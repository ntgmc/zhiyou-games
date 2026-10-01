const icons: Record<string, string> = {
  dish: '<path d="M4 12a8 8 0 0 0 12 7L4 7v5Z"/><path d="m11 13 7-7M16 3a5 5 0 0 1 5 5M16 7a1 1 0 0 1 1 1M8 20l-1 2m5-2 1 2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M3 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H3V4Zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5V4Z"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  pulse: '<path d="M2 12h4l3-8 5 16 3-8h5"/>',
  tree: '<path d="M12 5v5M5 15v-5h14v5"/><circle cx="12" cy="3" r="2"/><circle cx="5" cy="18" r="3"/><circle cx="19" cy="18" r="3"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  send: '<path d="m3 4 18 8-18 8 3-8-3-8Zm3 8h15"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  wave: '<path d="M2 12c3-12 7-12 10 0s7 12 10 0M2 18c3-12 7-12 10 0s7 12 10 0"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',
  music: '<path d="M9 18V5l12-2v13M9 9l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/>',
};

export function icon(name: string, className = ""): string {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
}

export function stars(value: number, className = ""): string {
  return `<span class="stars ${className}" aria-label="${value} 星">${[1, 2, 3].map((i) => `<span class="${i <= value ? "lit" : ""}">★</span>`).join("")}</span>`;
}

export function bitStrip(bits: string, changed: number[] = [], className = ""): string {
  const limit = 112;
  return `<div class="bit-strip ${className}">${[...bits.slice(0, limit)].map((bit, i) => `<span class="${changed.includes(i) ? "changed-bit" : ""}" title="位置 ${i + 1}">${bit}</span>`).join("")}${bits.length > limit ? `<small>…另 ${bits.length - limit} 位</small>` : ""}</div>`;
}

export function modalFrame(title: string, eyebrow: string, content: string, className = "", busy = false): string {
  return `<div class="modal-backdrop"><section class="modal ${className}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <div class="modal-heading"><div><div class="eyebrow">${eyebrow}</div><h2 id="modal-title">${title}</h2></div>${busy ? "" : `<button class="icon-button" data-action="close" aria-label="关闭">${icon("close")}</button>`}</div>
    ${content}
  </section></div>`;
}
