import { z } from 'zod';
import { ItemSchema } from './item';
import { NoteCardSchema } from './note-card';

export const CaptureInputSchema = z.object({ text: z.string().min(1).max(5_000) });
export type CaptureInput = z.infer<typeof CaptureInputSchema>;

/**
 * Resultado de `POST /api/capture`. Capturar nunca falla por el contenido:
 * lo que no encaja acaba como tarjeta de nota (con `warning` si había una intención clara).
 */
export const CaptureResponseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('empty') }),
  z.object({
    kind: z.literal('item'),
    item: ItemSchema,
    listName: z.string(),
    warning: z.string().optional(),
  }),
  z.object({
    kind: z.literal('note_card'),
    /** Deshacer la captura es borrar esta tarjeta. */
    card: NoteCardSchema,
    warning: z.string().optional(),
  }),
]);
export type CaptureResponse = z.infer<typeof CaptureResponseSchema>;
