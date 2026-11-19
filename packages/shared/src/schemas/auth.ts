import { z } from 'zod';
import { ObjectIdString } from './common';

/** Which theme the user wants: the device's own (the default) or a fixed one. */
export const ThemePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const UserSchema = z.object({
  id: ObjectIdString,
  username: z.string(),
  theme: ThemePreferenceSchema,
});
export type User = z.infer<typeof UserSchema>;

/** What a user can change about their own account. */
export const UpdateUserSchema = z.object({ theme: ThemePreferenceSchema });
export type UpdateUser = z.infer<typeof UpdateUserSchema>;

export const LoginInputSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

/** Minimum length when creating or changing the password (not applied at login). */
export const MIN_PASSWORD_LENGTH = 12;

/** Error format shared by the whole API. `details` only appears on validation errors. */
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorSchema>;
