import type { NoteView } from '@rayrecords/shared';
import type { Collections } from '../../db/client';

export async function getNote(c: Collections, date: string): Promise<NoteView> {
  const doc = await c.dailyNotes.findOne({ date });
  return {
    date,
    content: doc?.content ?? '',
    updatedAt: doc ? doc.updatedAt.toISOString() : null,
  };
}

export async function putNote(
  c: Collections,
  date: string,
  content: string,
  now = new Date(),
): Promise<NoteView> {
  await c.dailyNotes.updateOne(
    { date },
    { $set: { content, updatedAt: now }, $setOnInsert: { date, createdAt: now } },
    { upsert: true },
  );
  return { date, content, updatedAt: now.toISOString() };
}

/**
 * Añade una línea al final de la nota (`\n` de separación si hace falta). Es una sola operación
 * atómica en Mongo, así dos capturas seguidas no pisan la línea de la otra. Devuelve el contenido
 * anterior para poder deshacer.
 */
export async function appendToNote(
  c: Collections,
  date: string,
  text: string,
  now = new Date(),
): Promise<{ note: NoteView; previousContent: string }> {
  const current = { $ifNull: ['$content', ''] };
  const separator = {
    $cond: [
      {
        $or: [{ $eq: [current, ''] }, { $regexMatch: { input: current, regex: '\\n$' } }],
      },
      '',
      '\n',
    ],
  };

  const before = await c.dailyNotes.findOneAndUpdate(
    { date },
    [
      {
        $set: {
          date,
          content: { $concat: [current, separator, text] },
          createdAt: { $ifNull: ['$createdAt', now] },
          updatedAt: now,
        },
      },
    ],
    { upsert: true, returnDocument: 'before' },
  );

  const previousContent = before?.content ?? '';
  const separatorText = previousContent === '' || previousContent.endsWith('\n') ? '' : '\n';
  return {
    note: { date, content: previousContent + separatorText + text, updatedAt: now.toISOString() },
    previousContent,
  };
}
