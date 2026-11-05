import type { Collections } from './client';

/**
 * Índices de todas las colecciones. Es idempotente: se ejecuta en cada arranque y solo crea
 * lo que falta. Con un único usuario no merece la pena un sistema de migraciones.
 */
export async function ensureIndexes(c: Collections): Promise<void> {
  await Promise.all([
    c.lists.createIndexes([
      { key: { slug: 1 }, unique: true, name: 'slug_unique' },
      // Único solo entre las listas que tienen alias (índice parcial): las demás no chocan entre sí.
      {
        key: { captureAlias: 1 },
        unique: true,
        partialFilterExpression: { captureAlias: { $type: 'string' } },
        name: 'captureAlias_unique',
      },
      { key: { archived: 1, order: 1 }, name: 'archived_order' },
    ]),

    c.items.createIndexes([
      { key: { listId: 1, order: 1 }, name: 'list_order' }, // vista de lista y tablero
      { key: { listId: 1, createdAt: -1 }, name: 'list_created' },
      { key: { tags: 1 }, name: 'tags' }, // multikey
      // Calendario: solo indexa los elementos que tienen fecha.
      {
        key: { dueDate: 1 },
        partialFilterExpression: { dueDate: { $exists: true } },
        name: 'dueDate_partial',
      },
      {
        key: { title: 'text', text: 'text' },
        default_language: 'spanish',
        weights: { title: 3, text: 1 },
        name: 'title_text',
      },
    ]),

    c.dailyNotes.createIndexes([{ key: { date: 1 }, unique: true, name: 'date_unique' }]),

    c.noteCards.createIndexes([
      { key: { groupId: 1 }, name: 'group' }, // tarjetas de un grupo; liberarlas al borrarlo
      { key: { doneAt: 1 }, name: 'doneAt' }, // filtro de las 24 h y vista de terminadas
    ]),

    c.accounts.createIndexes([{ key: { archived: 1, name: 1 }, name: 'archived_name' }]),

    c.transactions.createIndexes([
      // Deduplicación: reimportar un CSV solapado no crea duplicados.
      { key: { accountId: 1, hash: 1 }, unique: true, name: 'account_hash_unique' },
      { key: { accountId: 1, date: -1 }, name: 'account_date' },
      { key: { month: 1, category: 1 }, name: 'month_category' }, // agregaciones de gráficos
      {
        // Cola de revisión: solo indexa lo pendiente, así que sigue pequeño aunque haya miles de movimientos.
        key: { merchantKey: 1, date: -1 },
        partialFilterExpression: { categorySource: 'none' },
        name: 'pending_merchant_partial',
      },
      {
        // Historial por comercio para sugerir categoría.
        key: { merchantKey: 1, category: 1 },
        partialFilterExpression: { category: { $type: 'string' } },
        name: 'merchant_category_partial',
      },
      {
        key: { importBatchId: 1 },
        partialFilterExpression: { importBatchId: { $exists: true } },
        name: 'importBatch_partial', // deshacer una importación
      },
    ]),

    c.rules.createIndexes([{ key: { active: 1, priority: -1 }, name: 'active_priority' }]),

    c.importBatches.createIndexes([{ key: { createdAt: -1 }, name: 'created' }]),

    c.users.createIndexes([{ key: { username: 1 }, unique: true, name: 'username_unique' }]),

    c.sessions.createIndexes([
      // TTL: Mongo elimina la sesión en cuanto `expiresAt` queda atrás (con un retraso de hasta ~1 min).
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'expires_ttl' },
      { key: { userId: 1 }, name: 'user' }, // revocar todas las sesiones de un usuario
    ]),

    c.credentials.createIndexes([
      { key: { credentialId: 1 }, unique: true, name: 'credentialId_unique' },
      { key: { userId: 1 }, name: 'user' },
    ]),
  ]);
}
