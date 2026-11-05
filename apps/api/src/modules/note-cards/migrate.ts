import type { Collections } from '../../db/client';
import { createCard } from './service';

/**
 * Converts the old daily notes (one per date) into canvas cards: one card per non-empty note, with
 * its content starting with the date. If cards already exist it does nothing, so running it twice
 * does not duplicate; `force` skips that check.
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
