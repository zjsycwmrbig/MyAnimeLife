export const ADMIN_ACCENTS = Object.freeze({
  coral: {
    accent: "#cf6247",
    accentDark: "#8f3f2c",
    accentSoft: "#f9e9e4",
  },
  teal: {
    accent: "#2f756d",
    accentDark: "#1f504b",
    accentSoft: "#e7f2ee",
  },
  blue: {
    accent: "#456f9d",
    accentDark: "#2e4d70",
    accentSoft: "#e9eff6",
  },
  amber: {
    accent: "#b4782f",
    accentDark: "#7e511e",
    accentSoft: "#f5ecdc",
  },
});

export function resolveAdminAppearance(
  settings = {},
  localAppearance = null,
) {
  const template = ["default", "compact", "spotlight"].includes(
    settings.template,
  )
    ? settings.template
    : "default";
  const requestedAccent =
    localAppearance?.share?.accent ?? settings.share?.accent ?? "coral";
  const accent = Object.hasOwn(ADMIN_ACCENTS, requestedAccent)
    ? requestedAccent
    : "coral";
  return {
    template,
    accent,
    palette: ADMIN_ACCENTS[accent],
    siteTitle: String(settings.site?.title ?? "").trim(),
    siteBrand: String(settings.site?.brand ?? "").trim(),
  };
}

export function applyAdminAppearance(settings, localAppearance = null) {
  const appearance = resolveAdminAppearance(settings, localAppearance);
  const root = document.documentElement;
  root.dataset.siteTemplate = appearance.template;
  root.dataset.shareAccent = appearance.accent;
  root.style.setProperty("--accent", appearance.palette.accent);
  root.style.setProperty("--accent-dark", appearance.palette.accentDark);
  root.style.setProperty("--accent-soft", appearance.palette.accentSoft);
  root.style.setProperty("--focus", appearance.palette.accent);

  const brandMark = document.querySelector("#adminBrandMark");
  const brandTitle = document.querySelector("#adminBrandTitle");
  if (brandMark && appearance.siteBrand) {
    brandMark.textContent = [...appearance.siteBrand][0] ?? "A";
  }
  if (brandTitle) {
    brandTitle.textContent =
      appearance.siteBrand || appearance.siteTitle || "Anime Records Manager";
  }
  if (appearance.siteTitle) {
    document.title = `${appearance.siteTitle} · 管理`;
  }
  return appearance;
}
