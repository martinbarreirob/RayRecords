/**
 * Defensa CSRF adicional a `SameSite=Strict`: en las peticiones que modifican datos, si el navegador
 * envía `Origin`, su host debe ser el de la propia aplicación (o estar en `ALLOWED_ORIGINS`).
 * Sin `Origin` (curl, herramientas) se permite: esas peticiones no llevan la cookie del navegador.
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
