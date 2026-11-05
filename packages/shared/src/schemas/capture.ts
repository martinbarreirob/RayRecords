import { z } from 'zod';
import { ItemSchema } from './item';
import { NoteCardSchema } from './note-card';

export const CaptureInputSchema = z.object({ text: z.string().min(1).max(5_000) });
export type CaptureInput = z.infer<typeof CaptureInputSchema>;

/**
 * Result of `POST /api/capture`. Capturing never fails because of the content:
 * whatever does not fit ends up as a note card (with a `warning` if the intent was clear).
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
    /** Undoing the capture means deleting this card. */
    card: NoteCardSchema,
    warning: z.string().optional(),
  }),
]);
export type CaptureResponse = z.infer<typeof CaptureResponseSchema>;
