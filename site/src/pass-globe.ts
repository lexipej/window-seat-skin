/*
 * The Earth outside the window: one globe with every pass drawn on it as a ground track, coloured by the light below
 * the station (the skin's strip colours), the boarded pass filled in the accent up to the playhead.
 * The Earth and halo shaders are copied from skin/src/video/overview-globe.ts (that module draws a single pass and
 * steers its own camera, so it can't be reused as is).
 */
import {
  AdditiveBlending, BackSide, BufferGeometry, CircleGeometry, Color, Float32BufferAttribute, Mesh, MeshBasicMaterial,
  OrthographicCamera, Scene, ShaderMaterial, SphereGeometry, SRGBColorSpace, Texture, Vector3, WebGLRenderer,
} from 'three';
import { sampleOrbit, solarElevation, subsolarPoint, TWILIGHT_LIMIT, wrapLongitude, type OrbitData, type OrbitSample } from '@skin/video/orbit-data';
import dayMap from '@skin/video/textures/blue-marble.webp?url';
import nightMap from '@skin/video/textures/black-marble.webp?url';

export interface PassTrack { id: string; label: string; title: string; orbit: OrbitData }

export type GlobeMode = 'pass' | 'all';

export interface PassGlobe {
  /** The boarded pass and its playback position in seconds. */
  setActive(id: string, time: number): void;
  /** Highlights a pass; `turn` also swings the globe to it (used from the list, never under the pointer). */
  preview(id: string | undefined, turn: boolean): void;
  /** `pass`: only the boarded track, following the station. `all`: every pass, turnable by drag and arrow keys. */
  setMode(mode: GlobeMode): void;
  dispose(): void;
}

interface Options {
  /** Receives an image of the globe after it first draws each boarded pass. */
  onSnapshot?(url: string): void;
  onHover(id: string | undefined): void;
  onPick(id: string): void;
}

const RADIANS = Math.PI / 180;
const FRAME = 1.1;
const MAX_PIXEL_RATIO = 1.5;
const PICK_PX = 16;
const DRAG_PX = 5;
const CHIP_W = 30;
const CHIP_H = 22;
const MAX_TILT = 70 * RADIANS;

const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load ${url}`));
  image.src = url;
});

// Greenwich faces +X, matching the equirectangular maps and SphereGeometry UVs.
function surface(target: Vector3, lat: number, lon: number, radius = 1) {
  const parallel = radius * Math.cos(lat * RADIANS);
  return target.set(parallel * Math.cos(lon * RADIANS), radius * Math.sin(lat * RADIANS), -parallel * Math.sin(lon * RADIANS));
}

const EARTH_VERTEX = `
  varying vec2 mapUv;
  varying vec3 surface;
  varying vec3 worldPosition;
  void main() {
    mapUv = uv;
    surface = position;
    worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const EARTH_FRAGMENT = `
  uniform sampler2D dayMap;
  uniform sampler2D nightMap;
  uniform vec3 sunDirection;
  uniform float twilight;
  varying vec2 mapUv;
  varying vec3 surface;
  varying vec3 worldPosition;
  void main() {
    vec3 normal = normalize(surface);
    float sun = dot(normal, sunDirection);
    float daylight = smoothstep(-twilight, twilight, sun);
    vec3 day = texture2D(dayMap, mapUv).rgb;
    vec3 night = texture2D(nightMap, mapUv).rgb;
    vec3 view = normalize(cameraPosition - worldPosition);
    float ocean = smoothstep(0.015, 0.09, day.b - max(day.r, day.g));
    day = mix(vec3(dot(day, vec3(0.299, 0.587, 0.114))), day, 1.2);
    // Dimmer than the porthole: the tracks drawn on top must read over bright cloud.
    vec3 color = day * daylight * (0.36 + 0.6 * max(sun, 0.0));
    color += day * vec3(0.03, 0.045, 0.08) * (1.0 - daylight);
    color += night * vec3(1.0, 0.8, 0.52) * (1.0 - daylight) * 2.2;
    float dusk = exp(-pow(sun / 0.11, 2.0));
    color += day * vec3(1.0, 0.42, 0.16) * dusk * 0.5;
    vec3 reflected = reflect(-sunDirection, normal);
    float glint = pow(max(dot(reflected, view), 0.0), 60.0) * 0.45;
    color += vec3(1.0, 0.94, 0.82) * glint * ocean * daylight;
    float rim = pow(1.0 - max(dot(normal, view), 0.0), 2.6);
    float lit = smoothstep(-0.25, 0.35, sun);
    color = mix(color, vec3(0.36, 0.64, 1.0), rim * (0.1 + 0.55 * lit));
    color += vec3(1.0, 0.5, 0.25) * rim * dusk * 0.35;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const HALO = 1.12;
const HALO_FRAGMENT = `
  uniform vec3 sunDirection;
  uniform float limb;
  varying vec3 surface;
  varying vec3 viewNormal;
  void main() {
    float depth = clamp(-normalize(viewNormal).z / limb, 0.0, 1.0);
    float glow = pow(depth, 2.4);
    float sun = dot(normalize(surface), sunDirection);
    float lit = smoothstep(-0.3, 0.3, sun);
    float dusk = exp(-pow(sun / 0.16, 2.0));
    vec3 color = mix(vec3(0.3, 0.6, 1.0), vec3(1.0, 0.55, 0.3), dusk * 0.6);
    gl_FragColor = vec4(color, glow * (0.22 + 0.6 * lit + 0.3 * dusk));
    #include <colorspace_fragment>
  }
`;

const TRACK_VERTEX = `
  attribute float routeTime;
  attribute float daylight;
  varying float time;
  varying float light;
  void main() {
    time = routeTime;
    light = daylight;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const TRACK_FRAGMENT = `
  uniform float travelled;
  uniform vec3 accent;
  uniform vec3 dayColor;
  uniform vec3 nightColor;
  uniform float opacity;
  varying float time;
  varying float light;
  void main() {
    vec3 color = time <= travelled ? accent : mix(nightColor, dayColor, light);
    gl_FragColor = vec4(color, opacity);
    #include <colorspace_fragment>
  }
`;

export async function createPassGlobe(host: HTMLElement, tracks: readonly PassTrack[], options: Options): Promise<PassGlobe> {
  const [dayImage, nightImage] = await Promise.all([loadImage(dayMap), loadImage(nightMap)]);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
  if (!context) throw new Error('The pass globe requires WebGL2.');
  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  renderer.setPixelRatio(1);
  const scene = new Scene();
  const camera = new OrthographicCamera(-FRAME, FRAME, FRAME, -FRAME, 0.1, 8);
  const resources: { dispose(): void }[] = [];
  const style = getComputedStyle(host);
  const token = (name: string, fallback: string) => new Color(style.getPropertyValue(name).trim() || fallback);

  const texture = (image: HTMLImageElement) => {
    const map = new Texture(image);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    map.needsUpdate = true;
    resources.push(map);
    return map;
  };

  const sunDirection = new Vector3(1, 0, 0);
  const earth = new Mesh(new SphereGeometry(1, 96, 48), new ShaderMaterial({
    uniforms: {
      dayMap: { value: texture(dayImage) },
      nightMap: { value: texture(nightImage) },
      sunDirection: { value: sunDirection },
      twilight: { value: Math.sin(TWILIGHT_LIMIT * RADIANS) },
    },
    vertexShader: EARTH_VERTEX,
    fragmentShader: EARTH_FRAGMENT,
  }));
  const halo = new Mesh(new SphereGeometry(HALO, 64, 32), new ShaderMaterial({
    uniforms: { sunDirection: { value: sunDirection }, limb: { value: Math.sqrt(1 - 1 / (HALO * HALO)) } },
    vertexShader: `
      varying vec3 surface;
      varying vec3 viewNormal;
      void main() {
        surface = position;
        viewNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: HALO_FRAGMENT,
    side: BackSide, blending: AdditiveBlending, transparent: true, depthWrite: false,
  }));
  scene.add(earth, halo);
  resources.push(earth.geometry, earth.material, halo.geometry, halo.material);

  const accent = { value: token('--page-accent', '#5ef0b5') };
  const dayColor = { value: token('--site-pass-day', '#6ccbff') };
  const nightColor = { value: token('--site-pass-night', '#8074f2') };

  // Each pass is a thin tube (consistent width on every WebGL implementation) plus a soft additive glow tube.
  const passes = tracks.map((track) => {
    const points: Vector3[] = [];
    const times: number[] = [];
    const light: number[] = [];
    const add = (sample: OrbitSample) => {
      points.push(surface(new Vector3(), sample.lat, sample.lon, 1.006));
      times.push(sample.videoTime);
      light.push(Math.max(0, Math.min(1, (solarElevation(sample) + TWILIGHT_LIMIT) / (2 * TWILIGHT_LIMIT))));
    };
    const samples = track.orbit.samples;
    add(samples[0]);
    for (let index = 1; index < samples.length; index++) {
      const from = samples[index - 1];
      const to = samples[index];
      const span = Math.max(Math.abs(to.lat - from.lat), Math.abs(wrapLongitude(to.lon - from.lon)));
      const steps = Math.max(1, Math.ceil(span / 2));
      for (let step = 1; step < steps; step++) add(sampleOrbit(track.orbit, from.videoTime + (to.videoTime - from.videoTime) * step / steps));
      add(to);
    }

    const travelled = { value: -1 };
    const meshes: Mesh[] = [];
    const tube = (radius: number, opacity: number, additive: boolean) => {
      const vertices: number[] = [], routeTimes: number[] = [], daylight: number[] = [], indices: number[] = [];
      points.forEach((point, index) => {
        const tangent = points[Math.min(index + 1, points.length - 1)].clone().sub(points[Math.max(0, index - 1)]).normalize();
        const side = new Vector3().crossVectors(tangent, point).normalize();
        const normal = new Vector3().crossVectors(side, tangent).normalize();
        for (let edge = 0; edge < 6; edge++) {
          const angle = edge / 6 * Math.PI * 2;
          const vertex = point.clone().addScaledVector(side, Math.cos(angle) * radius).addScaledVector(normal, Math.sin(angle) * radius);
          vertices.push(vertex.x, vertex.y, vertex.z);
          routeTimes.push(times[index]);
          daylight.push(light[index]);
          if (index) {
            const a = (index - 1) * 6 + edge, b = (index - 1) * 6 + (edge + 1) % 6;
            indices.push(a, b, a + 6, b, b + 6, a + 6);
          }
        }
      });
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
      geometry.setAttribute('routeTime', new Float32BufferAttribute(routeTimes, 1));
      geometry.setAttribute('daylight', new Float32BufferAttribute(daylight, 1));
      geometry.setIndex(indices);
      const material = new ShaderMaterial({
        uniforms: { travelled, accent, dayColor, nightColor, opacity: { value: opacity } },
        vertexShader: TRACK_VERTEX,
        fragmentShader: TRACK_FRAGMENT,
        transparent: true,
        depthWrite: false,
        ...(additive ? { blending: AdditiveBlending } : {}),
      });
      const mesh = new Mesh(geometry, material);
      scene.add(mesh);
      meshes.push(mesh);
      resources.push(geometry, material);
      return material;
    };
    const glow = tube(0.02, 0, true);
    const core = tube(0.0075, 0.7, false);
    const middle = points[Math.floor(points.length / 2)];
    return { track, points, times, travelled, glow, core, middle, meshes, emphasis: 0 };
  });

  const marker = new Mesh(new CircleGeometry(0.03, 24), new MeshBasicMaterial({ color: 0x081222 }));
  const markerDot = new Mesh(new CircleGeometry(0.019, 24), new MeshBasicMaterial({ color: 0xffefd2 }));
  markerDot.position.z = 0.002;
  marker.add(markerDot);
  marker.visible = false;
  scene.add(marker);
  resources.push(marker.geometry, marker.material, markerDot.geometry, markerDot.material);

  // Pass chips are real buttons: on the track when it faces us, pinned to the rim (pointing at it) when it doesn't.
  const labels = passes.map((pass) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'globe-chip';
    chip.textContent = pass.track.label;
    chip.setAttribute('aria-label', `Board pass ${pass.track.label}, ${pass.track.title}`);
    chip.addEventListener('click', () => {
      manual = false;
      turnedTo = pass;
      aimAt(pass);
      wake();
      options.onPick(pass.track.id);
    });
    chip.addEventListener('pointerenter', () => { hovered = pass; options.onHover(pass.track.id); wake(); });
    chip.addEventListener('pointerleave', () => { hovered = undefined; options.onHover(undefined); wake(); });
    host.append(chip);
    return chip;
  });

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const view = new Vector3();
  const target = new Vector3();
  const axis = new Vector3();
  const projected = new Vector3();
  let active: (typeof passes)[number] | undefined;
  let previewed: (typeof passes)[number] | undefined;
  let hovered: (typeof passes)[number] | undefined;
  let turnedTo: (typeof passes)[number] | undefined;
  let activeTime = 0;
  let accentRead = 0;
  let snapshotWanted = true;
  let size = 0, frame = 0, lastFrame = 0;
  let visible = false, disposed = false, lost = false;
  // The view swings a little east of the target, so the target sits left of centre where the globe is cropped on the right.
  let shift = 0;
  let mode: GlobeMode = 'all';
  // After a drag or arrow key the view stays where the visitor left it, until a pass is boarded or chosen.
  let manual = false;
  let spinX = 0, spinY = 0;

  // Turns a view direction by a yaw (around the poles) and a tilt (towards a pole), keeping north up.
  const turnView = (vector: Vector3, yaw: number, tilt: number) => {
    const lat = Math.max(-MAX_TILT, Math.min(MAX_TILT, Math.asin(Math.max(-1, Math.min(1, vector.y))) + tilt));
    const lon = Math.atan2(-vector.z, vector.x) - yaw;
    vector.set(Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon));
  };

  const aimAt = (pass: (typeof passes)[number] | undefined) => {
    if (!pass) return;
    const point = pass === active ? surface(new Vector3(), ...latLonAt(pass, activeTime)) : pass.middle;
    target.copy(point).normalize();
    axis.set(0, 1, 0);
    target.applyAxisAngle(axis, shift).normalize();
    if (!view.lengthSq()) view.copy(target);
  };

  const latLonAt = (pass: (typeof passes)[number], time: number): [number, number] => {
    const sample = sampleOrbit(pass.track.orbit, time);
    return [sample.lat, sample.lon];
  };

  const render = (now: number) => {
    frame = 0;
    if (disposed || lost || !size || !visible || document.hidden) return;
    const delta = Math.min(64, now - (lastFrame || now - 16));
    lastFrame = now;
    const damping = reduced.matches ? 1 : 1 - Math.exp(-delta / 140);
    let settling = false;

    if (!dragging && (Math.abs(spinX) > 0.00002 || Math.abs(spinY) > 0.00002)) {
      turnView(view, spinX * delta, spinY * delta);
      target.copy(view);
      const decay = Math.exp(-delta / 260);
      spinX *= decay;
      spinY *= decay;
      settling = true;
    }

    const angle = view.angleTo(target);
    if (angle > 0.0001) {
      axis.crossVectors(view, target).normalize();
      if (axis.lengthSq() > 0) view.applyAxisAngle(axis, angle * damping).normalize();
      settling = view.angleTo(target) > 0.0001;
      if (!settling) view.copy(target);
    }
    camera.position.copy(view).multiplyScalar(3);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    marker.quaternion.copy(camera.quaternion);

    const focus = hovered ?? previewed;
    for (const pass of passes) {
      const goal = pass === focus ? 1 : pass === active ? 0.6 : 0;
      pass.emphasis += (goal - pass.emphasis) * (reduced.matches ? 1 : 1 - Math.exp(-delta / 90));
      if (Math.abs(goal - pass.emphasis) > 0.002) settling = true;
      else pass.emphasis = goal;
      const dim = focus && pass !== focus ? 0.35 : 1;
      pass.core.uniforms.opacity.value = (0.62 + 0.38 * pass.emphasis) * dim;
      pass.glow.uniforms.opacity.value = 0.32 * pass.emphasis;
    }

    layoutChips(focus);

    renderer.render(scene, camera);
    // The drawing buffer is only readable in the task that rendered it.
    // The camera follows the station while playing, so it never fully settles: capture on any rendered frame.
    if (snapshotWanted && active) {
      const url = canvas.toDataURL('image/webp', 0.82);
      // A blank buffer encodes to a tiny image; keep asking until the globe is really there.
      if (url.length > 4000) {
        snapshotWanted = false;
        options.onSnapshot?.(url);
      } else settling = true;
    }
    if (settling) requestRender();
  };

  const layoutChips = (focus: (typeof passes)[number] | undefined) => {
    const half = size / 2;
    const rim = half / FRAME + 4;
    const chips = passes.map((pass) => {
      projected.copy(pass.middle).project(camera);
      const x = projected.x * half;
      const y = -projected.y * half;
      const pinned = pass.middle.dot(view) < 0.15;
      let angle = Math.atan2(y, x);
      if (pinned && Math.hypot(x, y) < 1) angle = -Math.PI / 2;
      return { pass, x, y, pinned, angle };
    });
    // Pinned chips sit on the rim, spread so that neighbours never overlap.
    const ring = chips.filter((chip) => chip.pinned).sort((a, b) => a.angle - b.angle);
    const gap = (CHIP_W + 4) / rim;
    for (let round = 0; round < 4; round++) {
      for (let index = 1; index < ring.length; index++) {
        const overlap = gap - (ring[index].angle - ring[index - 1].angle);
        if (overlap > 0) {
          ring[index - 1].angle -= overlap / 2;
          ring[index].angle += overlap / 2;
        }
      }
    }
    const placed = chips.map((chip) => {
      if (!chip.pinned) return { ...chip, left: chip.x, top: chip.y - 14 };
      return { ...chip, left: Math.cos(chip.angle) * rim, top: Math.sin(chip.angle) * rim };
    });
    // Chips on the near side are nudged apart vertically if they collide.
    for (let round = 0; round < 8; round++) {
      for (const a of placed) {
        for (const b of placed) {
          if (a === b || a.pinned || Math.abs(a.left - b.left) >= CHIP_W || Math.abs(a.top - b.top) >= CHIP_H) continue;
          if (b.pinned) {
            // A rim chip stays put; the chip on the track steps inwards, towards the centre.
            const length = Math.max(1, Math.hypot(a.left, a.top));
            a.left -= a.left / length * 6;
            a.top -= a.top / length * 6;
            continue;
          }
          const push = (CHIP_H - Math.abs(a.top - b.top)) / 2 + 0.5;
          const sign = a.top < b.top || (a.top === b.top && a.left < b.left) ? -1 : 1;
          a.top += sign * push;
        }
      }
    }
    for (const chip of placed) {
      // Keep every chip inside the globe's box, which is always fully on screen.
      chip.left = Math.max(-half + CHIP_W / 2, Math.min(half - CHIP_W / 2, chip.left));
      chip.top = Math.max(-half + CHIP_H / 2, Math.min(half - CHIP_H / 2, chip.top));
      const element = labels[passes.indexOf(chip.pass)];
      element.style.translate = `${(half + chip.left).toFixed(1)}px ${(half + chip.top).toFixed(1)}px`;
      element.toggleAttribute('data-pinned', chip.pinned);
      element.style.setProperty('--point', `${(Math.atan2(chip.y - chip.top, chip.x - chip.left) * 180 / Math.PI).toFixed(0)}deg`);
      element.toggleAttribute('data-focus', chip.pass === focus);
      element.toggleAttribute('data-active', chip.pass === active);
    }
  };

  const requestRender = () => {
    if (!frame && !disposed && !lost && visible && !document.hidden) frame = requestAnimationFrame(render);
  };
  const wake = () => { lastFrame = 0; requestRender(); };

  // Hit-testing in screen space: the nearest track point within a finger's reach, on the near side of the Earth.
  const pick = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    let best: (typeof passes)[number] | undefined;
    let bestDistance = PICK_PX;
    for (const pass of passes) {
      for (let index = 0; index < pass.points.length; index += 2) {
        const point = pass.points[index];
        if (point.dot(view) < 0.05) continue;
        projected.copy(point).project(camera);
        const distance = Math.hypot((projected.x + 1) / 2 * box.width - x, (1 - projected.y) / 2 * box.height - y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = pass;
        }
      }
    }
    return best;
  };

  let dragging = false;
  let pressed: { x: number; y: number; time: number; id: number } | undefined;
  let dragged = false;
  const onDown = (event: PointerEvent) => {
    if (mode !== 'all' || event.button !== 0) return;
    pressed = { x: event.clientX, y: event.clientY, time: performance.now(), id: event.pointerId };
    dragged = false;
    spinX = spinY = 0;
  };
  const onDrag = (event: PointerEvent) => {
    if (!pressed || event.pointerId !== pressed.id) return false;
    const dx = event.clientX - pressed.x;
    const dy = event.clientY - pressed.y;
    if (!dragging && Math.hypot(dx, dy) < DRAG_PX) return true;
    if (!dragging) {
      dragging = dragged = true;
      manual = true;
      turnedTo = undefined;
      canvas.setPointerCapture(event.pointerId);
      host.toggleAttribute('data-dragging', true);
    }
    const now = performance.now();
    const elapsed = Math.max(1, now - pressed.time);
    // One globe width of drag turns the Earth half way round.
    const scale = Math.PI / Math.max(1, size);
    // Dragging right turns the surface right, as if grabbing it.
    const yaw = dx * scale;
    const tilt = dy * scale;
    turnView(view, yaw, tilt);
    target.copy(view);
    const cap = (value: number) => Math.max(-0.003, Math.min(0.003, value));
    spinX = reduced.matches ? 0 : cap(yaw / elapsed);
    spinY = reduced.matches ? 0 : cap(tilt / elapsed);
    pressed = { x: event.clientX, y: event.clientY, time: now, id: event.pointerId };
    wake();
    return true;
  };
  const onUp = (event: PointerEvent) => {
    if (!pressed || event.pointerId !== pressed.id) return;
    pressed = undefined;
    if (dragging) {
      dragging = false;
      host.toggleAttribute('data-dragging', false);
      wake();
    }
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  host.addEventListener('keydown', (event) => {
    if (mode !== 'all' || event.target !== host) return;
    const step = 20 * RADIANS;
    const turns: Record<string, [number, number]> = {
      ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step],
    };
    const turn = turns[event.key];
    if (!turn) return;
    event.preventDefault();
    manual = true;
    turnedTo = undefined;
    spinX = spinY = 0;
    turnView(target, turn[0], turn[1]);
    wake();
  });

  const onMove = (event: PointerEvent) => {
    if (onDrag(event)) return;
    const next = pick(event);
    if (next === hovered) return;
    hovered = next;
    canvas.style.cursor = next ? 'pointer' : '';
    options.onHover(next?.track.id);
    wake();
  };
  const onLeave = () => {
    if (!hovered) return;
    hovered = undefined;
    canvas.style.cursor = '';
    options.onHover(undefined);
    wake();
  };
  const onClick = (event: MouseEvent) => {
    if (dragged) {
      dragged = false;
      return;
    }
    const picked = pick(event as PointerEvent);
    if (picked) options.onPick(picked.track.id);
  };
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('click', onClick);

  // This pass: only the boarded track and the dot, no chips, the camera following the station.
  const applyMode = () => {
    host.dataset.mode = mode;
    for (const pass of passes) for (const mesh of pass.meshes) mesh.visible = mode === 'all' || pass === active;
    labels.forEach((chip) => { chip.hidden = mode !== 'all'; });
  };
  applyMode();

  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); });
  intersection.observe(host);
  document.addEventListener('visibilitychange', wake);
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    host.toggleAttribute('data-unavailable', true);
  });
  const resize = new ResizeObserver(([entry]) => {
    size = entry.contentRect.width;
    if (size <= 0) return;
    const ratio = Math.min(MAX_PIXEL_RATIO, window.devicePixelRatio || 1);
    const pixels = Math.max(1, Math.round(size * ratio));
    if (canvas.width !== pixels) renderer.setSize(pixels, pixels, false);
    shift = Number.parseFloat(getComputedStyle(host).getPropertyValue('--globe-shift')) || 0;
    aimAt(turnedTo ?? active);
    wake();
  });
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);
  resize.observe(host);

  return {
    setActive(id, time) {
      const pass = passes.find((candidate) => candidate.track.id === id);
      if (pass !== active) {
        if (active) active.travelled.value = -1;
        active = pass;
        turnedTo = undefined;
        manual = false;
        applyMode();
        accentRead = performance.now();
        snapshotWanted = true;
        accent.value.set(getComputedStyle(host).getPropertyValue('--page-accent').trim() || '#5ef0b5');
      }
      if (!active) {
        marker.visible = false;
        wake();
        return;
      }
      activeTime = time;
      active.travelled.value = time;
      const sample = sampleOrbit(active.track.orbit, time);
      surface(marker.position, sample.lat, sample.lon, 1.02);
      marker.visible = true;
      const sun = subsolarPoint(sample.utcMs);
      surface(sunDirection, sun.lat, sun.lon);
      // Reading the accent forces a style pass, so playback samples it twice a second rather than on every tick.
      const now = performance.now();
      if (now - accentRead > 500) {
        accentRead = now;
        accent.value.set(getComputedStyle(host).getPropertyValue('--page-accent').trim() || '#5ef0b5');
      }
      if (!turnedTo && !manual) aimAt(active);
      wake();
    },
    setMode(next) {
      mode = next;
      manual = false;
      turnedTo = undefined;
      spinX = spinY = 0;
      applyMode();
      aimAt(active);
      wake();
    },
    preview(id, turn) {
      previewed = passes.find((candidate) => candidate.track.id === id);
      if (turn && mode === 'all') {
        manual = false;
        turnedTo = previewed;
        aimAt(previewed ?? active);
      }
      wake();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      document.removeEventListener('visibilitychange', wake);
      canvas.remove();
      labels.forEach((label) => label.remove());
      for (const resource of resources) resource.dispose();
      renderer.dispose();
    },
  };
}
