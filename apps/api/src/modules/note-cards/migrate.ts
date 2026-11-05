import type { Collections } from '../../db/client';
import { createCard } from './service';

/**
 * Convierte las notas del día antiguas (una por fecha) en tarjetas del lienzo: una tarjeta por nota
 * con texto, cuyo contenido empieza por la fecha. Si ya hay tarjetas no hace nada, así que ejecutarlo
 * dos veces no duplica; con `force` se salta esa comprobación.
 */
export async function migrateDailyNotes(
  c: Collections,
  now = new Date(),
  { force = false }: { force?: boolean } = {},
): Promise<{ migrated: number; skippedBecauseNotEmpty: boolean }> {
  if (!force && (await c.noteCards.countDocuments({}, { limit: 1 })) > 0) {
    return { migrated: 0, skippedBecauseNotEmpty: true };
  }

  const notes = await c.dailyNotes
    .find({ content: { $ne: '' } })
    .sort({ date: 1 })
    .toArray();

  let migrated = 0;
  for (const note of notes) {
    if (note.content.trim() === '') continue;
    await createCard(c, { text: `${note.date}\n${note.content}`.slice(0, 5_000) }, now);
    migrated++;
  }
  return { migrated, skippedBecauseNotEmpty: false };
}
