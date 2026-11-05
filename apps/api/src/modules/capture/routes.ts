import {
  CaptureInputSchema,
  CaptureResponseSchema,
  parseQuickCapture,
  type CaptureItem,
  type Extra,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { toItem } from '../items/mapper';
import { validateExtra } from '../items/extra';
import { createItem } from '../items/service';
import { toNoteCard } from '../note-cards/mapper';
import { createCard } from '../note-cards/service';

/** Maps a captured item to list fields. Data without a matching field is still kept in `extra`. */
function captureExtra(item: CaptureItem): Extra {
  return {
    ...(item.priceCents !== undefined && { precio: item.priceCents }),
    ...(item.category !== undefined && { categoria: item.category }),
  };
}

/**
 * Quick capture. The parser runs here with the real list aliases: this is the single source of
 * truth (the client only uses it for the preview). Capturing never fails because of its content:
 * anything that does not fit ends up as a note card in the first free spot of the canvas.
 */
export const captureRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.db.collections;

  app.post(
    '/capture',
    { schema: { body: CaptureInputSchema, response: { 200: CaptureResponseSchema } } },
    async (request) => {
      const lists = await c.lists.find({ archived: false }).toArray();
      const aliases = lists.flatMap((list) => (list.captureAlias ? [list.captureAlias] : []));
      const result = parseQuickCapture(request.body.text, { aliases });

      if (result.kind === 'empty') return { kind: 'empty' as const };

      // The parser calls it `daily_note` (text with no destination); here it becomes a card.
      if (result.kind === 'daily_note') {
        const card = await createCard(c, { text: result.text });
        return { kind: 'note_card' as const, card: toNoteCard(card) };
      }

      const list = lists.find((l) => l.captureAlias === result.list);
      if (!list) {
        // The intent is clear (`hoy:`) but the task list does not exist: keep it as a note.
        const text = `${result.title}${result.dueDate ? ` (para el ${result.dueDate})` : ''}`;
        const card = await createCard(c, { text });
        return {
          kind: 'note_card' as const,
          card: toNoteCard(card),
          warning: `No existe ninguna lista con el alias «${result.list}»: se ha guardado como nota.`,
        };
      }

      // A value that does not fit the list field type must not block saving: drop it and warn.
      const extra = captureExtra(result);
      const issues = validateExtra(list.fieldDefs, extra);
      for (const issue of issues) delete extra[issue.path.replace('extra.', '')];

      const doc = await createItem(c, list, {
        title: result.title,
        tags: result.tags,
        extra,
        source: 'quick',
        ...(result.dueDate !== undefined && { dueDate: result.dueDate }),
        ...(result.url !== undefined && { url: result.url }),
      });
      return {
        kind: 'item' as const,
        item: toItem(doc),
        listName: list.name,
        ...(issues.length > 0 && {
          warning: `No se guardó: ${issues.map((i) => i.path.replace('extra.', '')).join(', ')} (no encaja con los campos de la lista).`,
        }),
      };
    },
  );
};
