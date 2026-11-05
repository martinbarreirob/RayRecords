import { LoginInputSchema, UserSchema } from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ApiError } from '../../http/errors';
import { setSessionCookie } from './guard';
import { DUMMY_HASH, verifyPassword } from './password';
import { SESSION_COOKIE, createSession, deleteSession } from './sessions';

/** 10 intentos por IP cada 15 minutos: suficiente para uso legítimo, inútil para fuerza bruta. */
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: '15 minutes' };

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/auth/login',
    {
      config: { public: true, rateLimit: LOGIN_RATE_LIMIT },
      schema: { body: LoginInputSchema, response: { 200: UserSchema } },
    },
    async (request, reply) => {
      const { username, password } = request.body;
      const user = await app.db.collections.users.findOne({ username });

      // Se verifica siempre (contra un hash de relleno si el usuario no existe) y se responde igual:
      // ni el mensaje ni el tiempo delatan si el usuario existe.
      const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
      if (!user || !valid) {
        throw new ApiError(401, 'invalid_credentials', 'Usuario o contraseña incorrectos');
      }

      const { token, expiresAt } = await createSession(
        app.db.collections,
        user._id,
        request.headers['user-agent'],
      );
      setSessionCookie(reply, token, expiresAt, request.protocol === 'https');
      return { id: user._id.toHexString(), username: user.username };
    },
  );

  app.post('/auth/logout', { schema: { response: { 204: z.null() } } }, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) await deleteSession(app.db.collections, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return reply.status(204).send(null);
  });

  app.get('/auth/me', { schema: { response: { 200: UserSchema } } }, async (request) => {
    const { id, username } = request.user!;
    return { id, username };
  });
};
