import { z } from 'zod';
import { ObjectIdString } from './common';

export const UserSchema = z.object({
  id: ObjectIdString,
  username: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const LoginInputSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/** Longitud mínima al crear o cambiar la contraseña (no se aplica al iniciar sesión). */
export const MIN_PASSWORD_LENGTH = 12;

/** Formato uniforme de error de toda la API. `details` solo aparece en errores de validación. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;
