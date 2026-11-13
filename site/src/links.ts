/** Outbound links. Each is optional: unset links are not rendered, so no dead link ships. */
export const links: { repo?: string; contraPost?: string; xPost?: string } = {
  repo: 'https://github.com/lexipej/window-seat-skin',
  contraPost: 'https://contra.com/community/whqGgljh-window-seat-an-orbit-aware-videojs-skin',
  xPost: 'https://x.com/lexipej/status/2121135029447450787',
};

const LABELS = { repo: 'Source', contraPost: 'Contra submission', xPost: 'Post on X' } as const;

export function renderLinks() {
  // Links into the repository (`data-repo-path`) become plain text until `repo` is set.
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[data-repo-path]')) {
    const path = anchor.dataset.repoPath!;
    if (links.repo) anchor.href = `${links.repo.replace(/\/$/, '')}${path.startsWith('#') ? '' : '/'}${path}`;
    else anchor.replaceWith(anchor.textContent ?? '');
  }
  const list = document.querySelector<HTMLElement>('#outbound');
  if (!list) return;
  const items = (Object.keys(LABELS) as (keyof typeof LABELS)[]).flatMap((key) => {
    const href = links[key];
    if (!href) return [];
    const item = document.createElement('li');
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.textContent = LABELS[key];
    item.append(anchor);
    return [item];
  });
  list.replaceChildren(...items);
  list.hidden = items.length === 0;
}
