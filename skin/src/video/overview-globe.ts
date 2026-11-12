import { sampleOrbit, subsolarPoint, TWILIGHT_LIMIT, wrapLongitude, type OrbitData, type OrbitSample } from './orbit-data';
import dayMap from './textures/blue-marble.webp?url';
import nightMap from './textures/black-marble.webp?url';

const RADIANS = Math.PI / 180;
/** Globes drawn at least this wide (CSS px) show the ISS glyph instead of the dot; `Infinity` keeps the dot everywhere. */
export const ISS_MARKER_MIN_PX = Infinity; // marker trial rejected: always the dot
const ISS_MARKER_PX = 24;
const MAX_PIXEL_RATIO = 2;
// The orthographic frustum's half-width in world units.
const FRAME = 1.16;

export interface OverviewGlobe {
  draw(sample: OrbitSample): void;
  dispose(): void;
}

// `decode()` can stay pending while the page isn't being painted, so wait for the load event.
const loadImage = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error(`Could not load ${url}`));
  image.src = url;
});

const GLYPH_SCALE = 6;
const GLYPH_PAD = 24;

// Paints the seek thumb's ISS glyph: white with a thin dark outline, or as a soft white silhouette for the glow.
async function paintIssGlyph(doc: Document, glow: boolean) {
  const source = doc.querySelector('svg.ws-iss');
  if (!source) return;
  const svg = source.cloneNode(true) as SVGSVGElement;
  svg.querySelector('.ws-iss-knockout')?.remove();
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.setAttribute('width', String(34 * GLYPH_SCALE));
  svg.setAttribute('height', String(20 * GLYPH_SCALE));
  svg.setAttribute('fill', '#fff');
  if (!glow) svg.setAttribute('style', 'stroke:#081222;stroke-width:1.6px;stroke-linejoin:round;paint-order:stroke fill');
  const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.outerHTML)}`);
  const canvas = doc.createElement('canvas');
  canvas.width = 34 * GLYPH_SCALE + GLYPH_PAD * 2;
  canvas.height = 20 * GLYPH_SCALE + GLYPH_PAD * 2;
  const context = canvas.getContext('2d');
  if (!context) return;
  if (glow) context.filter = `blur(${GLYPH_PAD / 2.5}px)`;
  for (let pass = glow ? 3 : 1; pass > 0; pass--) context.drawImage(image, GLYPH_PAD, GLYPH_PAD);
  return canvas;
}

export async function createOverviewGlobe(host: HTMLElement, orbit: OrbitData, signal: AbortSignal): Promise<OverviewGlobe | undefined> {
  const {
    AdditiveBlending, BackSide, BufferGeometry, CanvasTexture, CircleGeometry, Color, Float32BufferAttribute, Line, LineBasicMaterial, Mesh, MeshBasicMaterial,
    OrthographicCamera, RingGeometry, Scene, ShaderMaterial, SphereGeometry, Sprite, SpriteMaterial, SRGBColorSpace, Texture, Vector3, WebGLRenderer,
  } = await import('three');
  if (signal.aborted) return;
  const [dayImage, nightImage, issImage, issGlow] = await Promise.all([
    loadImage(dayMap), loadImage(nightMap),
    // The glyph is optional: without it the globe keeps the dot at every size.
    paintIssGlyph(host.ownerDocument, false).catch(() => undefined),
    paintIssGlyph(host.ownerDocument, true).catch(() => undefined),
  ]);
  if (signal.aborted) return;

  const canvas = host.ownerDocument.createElement('canvas');
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, powerPreference: 'low-power' });
  if (!context) throw new Error('The overview globe requires WebGL2.');
  const renderer = new WebGLRenderer({ canvas, context, alpha: true, antialias: true });
  // The resize observer sizes the buffer in whole device pixels, so three.js never rescales it.
  renderer.setPixelRatio(1);
  const scene = new Scene();
  const camera = new OrthographicCamera(-FRAME, FRAME, FRAME, -FRAME, 0.1, 8);
  const resources: { dispose(): void }[] = [];

  const texture = (image: HTMLImageElement) => {
    const map = new Texture(image);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = renderer.capabilities.getMaxAnisotropy();
    map.needsUpdate = true;
    resources.push(map);
    return map;
  };
  const sunDirection = new Vector3();
  const earth = new Mesh(new SphereGeometry(1, 64, 32), new ShaderMaterial({
    uniforms: {
      dayMap: { value: texture(dayImage) },
      nightMap: { value: texture(nightImage) },
      sunDirection: { value: sunDirection },
      twilight: { value: Math.sin(TWILIGHT_LIMIT * RADIANS) },
    },
    vertexShader: `
      varying vec2 mapUv;
      varying vec3 surface;
      varying vec3 worldPosition;
      void main() {
        mapUv = uv;
        surface = position;
        worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
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
        // Lift saturation a little so land and sea separate at small sizes.
        day = mix(vec3(dot(day, vec3(0.299, 0.587, 0.114))), day, 1.25);
        vec3 color = day * daylight * (0.5 + 0.8 * max(sun, 0.0));
        // Night side: a faint moonlit surface under warm city lights.
        color += day * vec3(0.035, 0.05, 0.09) * (1.0 - daylight);
        color += night * vec3(1.0, 0.8, 0.52) * (1.0 - daylight) * 2.4;
        // A warm band where the sun sits on the horizon.
        float dusk = exp(-pow(sun / 0.11, 2.0));
        color += day * vec3(1.0, 0.42, 0.16) * dusk * 0.55;
        vec3 reflected = reflect(-sunDirection, normal);
        float glint = pow(max(dot(reflected, view), 0.0), 60.0) * 0.55 + pow(max(dot(reflected, view), 0.0), 8.0) * 0.1;
        color += vec3(1.0, 0.94, 0.82) * glint * ocean * daylight;
        // Haze thickens toward the limb, bluest in sunlight.
        float rim = pow(1.0 - max(dot(normal, view), 0.0), 2.6);
        float lit = smoothstep(-0.25, 0.35, sun);
        color = mix(color, vec3(0.36, 0.64, 1.0), rim * (0.1 + 0.6 * lit));
        color += vec3(1.0, 0.5, 0.25) * rim * dusk * 0.35;
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  }));

  // A halo shell seen from inside: brightest at Earth's limb, fading to nothing at the shell's own edge.
  const HALO = 1.13;
  const atmosphere = new Mesh(new SphereGeometry(HALO, 64, 32), new ShaderMaterial({
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
    fragmentShader: `
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
        // A faint airglow floor keeps the night limb outlined, so the whole halo reads as one ring around the sphere.
        gl_FragColor = vec4(color, glow * (0.24 + 0.68 * lit + 0.3 * dusk));
        #include <colorspace_fragment>
      }
    `,
    side: BackSide, blending: AdditiveBlending, transparent: true, depthWrite: false,
  }));

  // Match the equirectangular maps and SphereGeometry UVs: Greenwich faces +X.
  function position(target: InstanceType<typeof Vector3>, lat: number, lon: number, radius = 1) {
    const latitude = lat * RADIANS;
    const longitude = lon * RADIANS;
    const parallel = radius * Math.cos(latitude);
    return target.set(parallel * Math.cos(longitude), radius * Math.sin(latitude), -parallel * Math.sin(longitude));
  }

  const pointAt = ({ lat, lon }: OrbitSample) => position(new Vector3(), lat, lon, 1.012);
  const points = [pointAt(orbit.samples[0])];
  const times = [orbit.samples[0].videoTime];
  for (let index = 1; index < orbit.samples.length; index++) {
    const from = orbit.samples[index - 1];
    const to = orbit.samples[index];
    const degrees = Math.max(Math.abs(to.lat - from.lat), Math.abs(wrapLongitude(to.lon - from.lon)));
    // Subdivide sparse samples so the line follows the surface through turns and across the date line.
    const steps = Math.max(1, Math.ceil(degrees / 3));
    for (let step = 1; step < steps; step++) {
      const time = from.videoTime + (to.videoTime - from.videoTime) * step / steps;
      points.push(pointAt(sampleOrbit(orbit, time)));
      times.push(time);
    }
    points.push(pointAt(to));
    times.push(to.videoTime);
  }
  const travelled = { value: 0 };
  const accent = { value: new Color(0xffc247) };
  // A small tube keeps the core and halo consistent on WebGL implementations with 1 px lines.
  const route = (radius: number, opacity: number) => {
    const vertices: number[] = [], routeTimes: number[] = [], distances: number[] = [], indices: number[] = [];
    let distance = 0;
    points.forEach((point, index) => {
      if (index) distance += point.distanceTo(points[index - 1]);
      const tangent = points[Math.min(index + 1, points.length - 1)].clone().sub(points[Math.max(0, index - 1)]).normalize();
      const side = new Vector3().crossVectors(tangent, point).normalize();
      const normal = new Vector3().crossVectors(side, tangent).normalize();
      for (let edge = 0; edge < 6; edge++) {
        const angle = edge / 6 * Math.PI * 2;
        const vertex = point.clone().addScaledVector(side, Math.cos(angle) * radius).addScaledVector(normal, Math.sin(angle) * radius);
        vertices.push(vertex.x, vertex.y, vertex.z);
        routeTimes.push(times[index]);
        distances.push(distance);
        if (index) {
          const a = (index - 1) * 6 + edge, b = (index - 1) * 6 + (edge + 1) % 6;
          indices.push(a, b, a + 6, b, b + 6, a + 6);
        }
      }
    });
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('routeTime', new Float32BufferAttribute(routeTimes, 1));
    geometry.setAttribute('routeDistance', new Float32BufferAttribute(distances, 1));
    geometry.setIndex(indices);
    return new Mesh(geometry, new ShaderMaterial({
      uniforms: { travelled, accent, opacity: { value: opacity } },
      vertexShader: `
        attribute float routeTime;
        attribute float routeDistance;
        varying float time;
        varying float distance;
        void main() {
          time = routeTime;
          distance = routeDistance;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float travelled;
        uniform vec3 accent;
        uniform float opacity;
        varying float time;
        varying float distance;
        void main() {
          bool passed = time <= travelled;
          if (!passed && fract(distance / 0.065) > 0.55) discard;
          gl_FragColor = vec4(accent, opacity * (passed ? 1.0 : 0.24));
          #include <colorspace_fragment>
        }
      `,
      transparent: true, blending: AdditiveBlending, depthWrite: false,
    }));
  };
  const routeCore = route(0.0025, 0.95);
  const routeGlow = route(0.009, 0.13);
  const marker = new Mesh(new CircleGeometry(0.030, 24), new MeshBasicMaterial({ color: 0x081222 }));
  const markerDot = new Mesh(new CircleGeometry(0.020, 24), new MeshBasicMaterial({ color: 0xffefd2 }));
  markerDot.position.z = 0.002;
  marker.add(markerDot);
  const pulse = new Mesh(new RingGeometry(0.038, 0.043, 40), new MeshBasicMaterial({
    color: 0xffd891, transparent: true, opacity: 0.6, blending: AdditiveBlending, depthWrite: false,
  }));
  marker.add(pulse);
  const tether = new Line(new BufferGeometry().setFromPoints([new Vector3(), new Vector3()]), new LineBasicMaterial({ color: 0xffdfaa, transparent: true, opacity: 0.8 }));
  scene.add(earth, atmosphere, routeGlow, routeCore, marker, tether);
  for (const object of [earth, atmosphere, routeCore, routeGlow, marker, markerDot, pulse, tether]) resources.push(object.geometry, object.material);

  // On larger globes the station is drawn as the seek thumb's glyph, facing the camera and heading along the track.
  const glyph = (image: HTMLCanvasElement, glow: boolean) => {
    const map = new CanvasTexture(image);
    map.colorSpace = SRGBColorSpace;
    const material = new SpriteMaterial({
      map, depthWrite: false, transparent: true,
      ...(glow ? { color: accent.value, blending: AdditiveBlending } : {}),
    });
    resources.push(map, material);
    const sprite = new Sprite(material);
    sprite.renderOrder = glow ? 1 : 2;
    sprite.visible = false;
    scene.add(sprite);
    return sprite;
  };
  const iss = issImage && issGlow ? [glyph(issGlow, true), glyph(issImage, false)] : [];
  const nadir = new Mesh(new CircleGeometry(1, 16), new MeshBasicMaterial({ color: 0xffefd2 }));
  nadir.visible = false;
  scene.add(nadir);
  resources.push(nadir.geometry, nadir.material);
  const ahead = new Vector3();
  const behind = new Vector3();
  const screenFrom = new Vector3();
  const screenTo = new Vector3();
  let showIss = false;
  const fitMarker = () => {
    showIss = iss.length > 0 && size >= ISS_MARKER_MIN_PX;
    marker.visible = !showIss;
    const unit = FRAME * 2 / size;
    const width = ISS_MARKER_PX * unit * (34 * GLYPH_SCALE + GLYPH_PAD * 2) / (34 * GLYPH_SCALE);
    for (const sprite of iss) sprite.scale.set(width, width * (20 * GLYPH_SCALE + GLYPH_PAD * 2) / (34 * GLYPH_SCALE + GLYPH_PAD * 2), 1);
    nadir.scale.setScalar(1.5 * unit);
  };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const target = new Vector3();
  const view = new Vector3();
  const turn = new Vector3();
  let sample: OrbitSample | undefined;
  let frame = 0, lastFrame = 0, movingUntil = 0, size = 0;
  let visible = false, disposed = false, lost = false;
  const isVisible = () => visible && !document.hidden && !host.closest('[hidden]') && host.getClientRects().length > 0;
  const render = (now: number) => {
    frame = 0;
    if (disposed || lost || !sample || !size || !isVisible()) return;
    const delta = Math.min(64, now - (lastFrame || now - 16));
    lastFrame = now;
    const damping = reduced.matches ? 1 : 1 - Math.exp(-delta / 75);
    const angle = view.angleTo(target);
    if (angle > 0.00001) {
      turn.crossVectors(view, target);
      if (turn.lengthSq() < 0.000001) turn.crossVectors(view, camera.up);
      view.applyAxisAngle(turn.normalize(), angle * damping).normalize();
    }
    const settling = view.distanceToSquared(target) > 0.000001;
    if (!settling) view.copy(target);
    camera.position.copy(view).multiplyScalar(3);
    camera.lookAt(0, 0, 0);
    marker.quaternion.copy(camera.quaternion);
    nadir.quaternion.copy(camera.quaternion);
    // The glyph hides once the station passes behind Earth; the dot relies on the depth test alone.
    const facing = showIss && marker.position.dot(view) > 0;
    nadir.visible = facing;
    if (facing) {
      camera.updateMatrixWorld();
      screenFrom.copy(behind).project(camera);
      screenTo.copy(ahead).project(camera);
      const heading = Math.atan2(screenTo.y - screenFrom.y, screenTo.x - screenFrom.x);
      for (const sprite of iss) sprite.material.rotation = heading;
    }
    for (const sprite of iss) {
      sprite.visible = facing;
      sprite.position.copy(marker.position);
    }
    const moving = !reduced.matches && now < movingUntil;
    const phase = moving ? (now % 2400) / 2400 : 0.25;
    pulse.scale.setScalar(1 + phase * 0.85);
    pulse.material.opacity = moving ? 0.6 * (1 - phase) : 0.45;
    renderer.render(scene, camera);
    if (settling || moving) requestRender();
  };
  const requestRender = () => {    if (!frame && !disposed && !lost && isVisible()) frame = requestAnimationFrame(render);
  };
  const wake = () => { lastFrame = 0; requestRender(); };
  const intersection = new IntersectionObserver((entries) => { visible = entries.at(-1)!.isIntersecting; wake(); });
  intersection.observe(host);
  const visibility = new MutationObserver(wake);
  for (let element: HTMLElement | null = host; element; element = element.parentElement) {
    visibility.observe(element, { attributes: true, attributeFilter: ['hidden', 'class', 'style'] });
  }
  document.addEventListener('visibilitychange', wake);
  reduced.addEventListener('change', wake);
  const onContextLost = (event: Event) => {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  const resize = new ResizeObserver(([entry]) => {
    size = entry.contentRect.width;
    if (size <= 0) return;
    // A buffer in whole device pixels maps 1:1 onto the canvas box, so Earth stays centred and sharp at fractional ratios.
    const ratio = window.devicePixelRatio || 1;
    const devicePixels = entry.devicePixelContentBoxSize?.[0]?.inlineSize ?? Math.round(size * ratio);
    const pixels = Math.max(1, Math.round(devicePixels * Math.min(1, MAX_PIXEL_RATIO / ratio)));
    if (canvas.width !== pixels || canvas.height !== pixels) renderer.setSize(pixels, pixels, false);
    fitMarker();
    wake();
  });
  host.append(renderer.domElement);
  try {
    resize.observe(host, { box: 'device-pixel-content-box' });
  } catch {
    resize.observe(host);
  }

  const globe: OverviewGlobe = {
    draw(next) {
      if (disposed || lost || sample === next || (sample?.videoTime === next.videoTime && sample.utcMs === next.utcMs)) return;
      if (sample) movingUntil = performance.now() + 450;
      sample = next;
      travelled.value = next.videoTime;
      const palette = getComputedStyle(host.closest('media-container') ?? host);
      const color = palette.getPropertyValue('--ws-accent').trim() || palette.getPropertyValue('--page-accent').trim();
      if (color) accent.value.setStyle(color);
      iss[0]?.material.color.copy(accent.value);
      const sun = subsolarPoint(next.utcMs);
      position(sunDirection, sun.lat, sun.lon);
      // Exaggerate the marker's height so its surface tether reads at overview sizes.
      position(marker.position, next.lat, next.lon, 1.2);
      const surface = position(new Vector3(), next.lat, next.lon);
      const tetherPositions = tether.geometry.getAttribute('position');
      tetherPositions.setXYZ(0, surface.x, surface.y, surface.z);
      tetherPositions.setXYZ(1, marker.position.x, marker.position.y, marker.position.z);
      tetherPositions.needsUpdate = true;
      tether.geometry.computeBoundingSphere();
      nadir.position.copy(surface).multiplyScalar(1.004);
      // Heading from the route segment under the station, which also holds before the first and after the last sample.
      const found = times.findIndex((time) => time >= next.videoTime);
      const segment = Math.max(1, Math.min(found < 0 ? points.length - 1 : found, points.length - 1));
      if (points.length > 1) ahead.subVectors(points[segment], points[segment - 1]).normalize().multiplyScalar(0.05);
      behind.copy(marker.position).sub(ahead);
      ahead.add(marker.position);
      // Look a little along the pass, with a stable north-up orientation.
      target.copy(surface).lerp(pointAt(sampleOrbit(orbit, next.videoTime + 6)), 0.2).normalize();
      // Turn the view, rather than its aim, to offset the station without cropping Earth's limb.
      turn.crossVectors(target, camera.up).normalize();
      target.addScaledVector(turn, -0.2).normalize();
      if (!view.lengthSq()) view.copy(target);
      requestRender();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', wake);
      reduced.removeEventListener('change', wake);
      canvas.removeEventListener('webglcontextlost', onContextLost);
      signal.removeEventListener('abort', globe.dispose);
      renderer.domElement.remove();
      for (const resource of resources) resource.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
  signal.addEventListener('abort', globe.dispose, { once: true });
  return globe;
}
