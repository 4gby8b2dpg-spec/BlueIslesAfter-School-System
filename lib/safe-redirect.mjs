/**
 * Accept only local application paths. This rejects absolute URLs,
 * protocol-relative URLs and executable schemes such as `javascript:`.
 *
 * @param {string | null | undefined} candidate
 * @param {string} [fallback]
 */
export function safeRedirectPath(candidate, fallback = "/dashboard") {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  try {
    const parsed = new URL(candidate, "https://blueisles.invalid");
    if (parsed.origin !== "https://blueisles.invalid") return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
