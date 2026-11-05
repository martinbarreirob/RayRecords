import type { FastifyInstance, FastifyReply } from 'fastify';
import { ApiError } from '../../http/errors';
import { isOriginAllowed } from '../../http/origin';
import { SESSION_COOKIE, resolveSession } from './sessions';

export interface SessionUser {
  id: string;
  username: string;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
  }
  interface FastifyContextConfig {
    /** Ruta accesible sin sesión (solo `health` y `login`). */
    public?: boolean;
  }
}

export function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
  secure: boolean,
): void {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    // `Secure` solo si la petición llegó por HTTPS (directa o por `X-Forwarded-Proto`): en HTTP plano
    // de desarrollo el navegador descartaría la cookie.
    secure,
    sameSite: 'strict',
    expires: expiresAt,
  });
}

/**
 * Se registra directamente en el ámbito de `/api` (sin plugin encapsulado) para que sus hooks
 * alcancen a todas las rutas. Primero comprueba el origen y después exige sesión, salvo en las
 * rutas marcadas `config: { public: true }`.
 */
export function registerAuthGuard(
  api: FastifyInstance,
  options: { allowedOrigins: readonly string[] },
): void {
  api.decorateRequest('user', null);

  api.addHook('onRequest', async (request) => {
    if (
      !isOriginAllowed(request.method, request.headers.origin, request.host, options.allowedOrigins)
    ) {
      throw new ApiError(403, 'forbidden_origin', 'Origen no permitido');
    }
  });

  api.addHook('onRequest', async (request, reply) => {
    if (request.routeOptions.config.public) return;

    const token = request.cookies[SESSION_COOKIE];
    const resolved = token ? await resolveSession(api.db.collections, token) : null;
    const user = resolved
      ? await api.db.collections.users.findOne({ _id: resolved.session.userId })
      : null;
    if (!resolved || !user || !token) {
      throw new ApiError(401, 'unauthorized', 'Sesión no válida o caducada');
    }

    request.user = {
      id: user._id.toHexString(),
      username: user.username,
      sessionId: resolved.session._id,
    };
    // Renovación deslizante: si la sesión se ha extendido, la cookie debe reflejarlo.
    if (resolved.renewedUntil) {
      setSessionCookie(reply, token, resolved.renewedUntil, request.protocol === 'https');
    }
  });
}
