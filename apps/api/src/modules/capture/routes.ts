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

/** Un elemento capturado → campos de la lista. Los datos sin campo definido se guardan igualmente en `extra`. */
function captureExtra(item: CaptureItem): Extra {
  return {
    ...(item.priceCents !== undefined && { precio: item.priceCents }),
    ...(item.category !== undefined && { categoria: item.category }),
  };
}

/**
 * Captura rápida. El parser se ejecuta aquí, con los alias reales de las listas: es la única fuente
 * de verdad (el cliente solo lo usa para la vista previa). Capturar nunca falla por el contenido:
 * lo que no encaja acaba como tarjeta de nota, en el primer hueco libre del lienzo.
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

      // El parser lo llama `daily_note` (texto sin destino); aquí pasa a ser una tarjeta.
      if (result.kind === 'daily_note') {
        const card = await createCard(c, { text: result.text });
        return { kind: 'note_card' as const, card: toNoteCard(card) };
      }

      const list = lists.find((l) => l.captureAlias === result.list);
      if (!list) {
        // Hay intención clara (`hoy:`) pero no existe la lista de tareas: no se pierde, va a una nota.
        const text = `${result.title}${result.dueDate ? ` (para el ${result.dueDate})` : ''}`;
        const card = await createCard(c, { text });
        return {
          kind: 'note_card' as const,
          card: toNoteCard(card),
          warning: `No existe ninguna lista con el alias «${result.list}»: se ha guardado como nota.`,
        };
      }

      // Un dato que no encaja con el tipo del campo de la lista no debe impedir guardar: se descarta con aviso.
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
