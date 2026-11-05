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
    /** Route reachable without a session (only `health` and `login`). */
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
    // `Secure` only when the request came over HTTPS (directly or via `X-Forwarded-Proto`): on plain
    // HTTP in development the browser would drop the cookie.
    secure,
    sameSite: 'strict',
    expires: expiresAt,
  });
}

/**
 * Registered directly on the `/api` scope (not as an encapsulated plugin) so its hooks reach every
 * route. It checks the origin first, then requires a session unless the route is marked
 * `config: { public: true }`.
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
    // Sliding renewal: when the session was extended, the cookie must reflect it.
    if (resolved.renewedUntil) {
      setSessionCookie(reply, token, resolved.renewedUntil, request.protocol === 'https');
    }
  });
}
