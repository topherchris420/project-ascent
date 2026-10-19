/** Client helper: ask a market's search route to load its records before the first address is typed. */
const warmed = new Set<string>();
export function warmAddressSearch(api: 'dc' | 'dc-condos' | 'maryland') {
  if (warmed.has(api)) return;
  warmed.add(api);
  fetch(`/api/${api}/search`, { method: 'POST', keepalive: true }).catch(() => warmed.delete(api));
}
