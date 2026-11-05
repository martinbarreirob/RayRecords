/**
 * CSRF defense on top of `SameSite=Strict`: on state-changing requests, if the browser sends
 * `Origin`, its host must be the app's own host (or be listed in `ALLOWED_ORIGINS`).
 * Requests without `Origin` (curl, scripts) are allowed: they do not carry the browser cookie.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isOriginAllowed(
  method: string,
  origin: string | undefined,
  host: string | undefined,
  allowedOrigins: readonly string[] = [],
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase()) || !origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
