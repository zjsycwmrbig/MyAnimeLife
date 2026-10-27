export function replaceChildrenSafe(label, target, ...children) {
  if (!target || typeof target.replaceChildren !== "function") {
    const message = `${label}容器不存在，已跳过本次页面更新`;
    console.warn(`[MyAnimeLife] ${message}`);
    if (
      typeof window !== "undefined" &&
      typeof window.dispatchEvent === "function" &&
      typeof CustomEvent === "function"
    ) {
      window.dispatchEvent(
        new CustomEvent("anime-admin:dom-warning", {
          detail: { label, message },
        }),
      );
    }
    return false;
  }

  target.replaceChildren(...children);
  return true;
}
