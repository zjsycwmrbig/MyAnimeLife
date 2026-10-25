export function normalizeCoverUrl(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const resolved = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  return /^(?:https?:\/\/|data:image\/)/iu.test(resolved) ? resolved : null;
}
