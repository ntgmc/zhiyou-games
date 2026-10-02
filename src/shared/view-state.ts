// Keep the player's place when an action rebuilds the current task.
export function rememberView(root: HTMLElement): () => void {
  const regions = [...root.querySelectorAll<HTMLElement>('[role="region"][aria-label]')]
    .map((element) => ({ label: element.getAttribute("aria-label"), left: element.scrollLeft, top: element.scrollTop }));
  const active = document.activeElement;
  let selector = "";
  if (active instanceof HTMLElement && root.contains(active)) {
    if (active.id) selector = `#${CSS.escape(active.id)}`;
    else {
      const attributes = [...active.attributes].filter(({ name }) => name.startsWith("data-") || name === "aria-label");
      if (attributes.length) selector = active.tagName + attributes.map(({ name, value }) => `[${name}="${CSS.escape(value)}"]`).join("");
    }
  }
  return () => {
    if (selector) root.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    for (const region of regions) {
      const element = root.querySelector<HTMLElement>(`[role="region"][aria-label="${CSS.escape(region.label ?? "")}"]`);
      if (element) { element.scrollLeft = region.left; element.scrollTop = region.top; }
    }
  };
}
