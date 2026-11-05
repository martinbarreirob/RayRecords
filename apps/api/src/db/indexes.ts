import type { Collections } from './client';

/**
 * Indexes for every collection. Idempotent: runs on each start and only creates what is missing.
 * With a single user a migration system is not worth it.
 */
export async function ensureIndexes(c: Collections): Promise<void> {
  await Promise.all([
    c.lists.createIndexes([
      { key: { slug: 1 }, unique: true, name: 'slug_unique' },
      // Unique only among lists that have an alias (partial index), so the rest do not collide.
      {
        key: { captureAlias: 1 },
        unique: true,
        partialFilterExpression: { captureAlias: { $type: 'string' } },
        name: 'captureAlias_unique',
      },
      { key: { archived: 1, order: 1 }, name: 'archived_order' },
    ]),

    c.items.createIndexes([
      { key: { listId: 1, order: 1 }, name: 'list_order' }, // list and board views
      { key: { listId: 1, createdAt: -1 }, name: 'list_created' },
      { key: { tags: 1 }, name: 'tags' }, // multikey
      // Calendar: only indexes items that have a date.
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
      { key: { groupId: 1 }, name: 'group' }, // cards of a group; releasing them when it is deleted
      { key: { doneAt: 1 }, name: 'doneAt' }, // 24 h filter and done view
    ]),

    c.accounts.createIndexes([{ key: { archived: 1, name: 1 }, name: 'archived_name' }]),

    c.transactions.createIndexes([
      // Dedup: re-importing an overlapping CSV does not create duplicates.
      { key: { accountId: 1, hash: 1 }, unique: true, name: 'account_hash_unique' },
      { key: { accountId: 1, date: -1 }, name: 'account_date' },
      { key: { month: 1, category: 1 }, name: 'month_category' }, // chart aggregations
      {
        // Review queue: indexes only pending rows, so it stays small with thousands of transactions.
        key: { merchantKey: 1, date: -1 },
        partialFilterExpression: { categorySource: 'none' },
        name: 'pending_merchant_partial',
      },
      {
        // Per-merchant history used to suggest a category.
        key: { merchantKey: 1, category: 1 },
        partialFilterExpression: { category: { $type: 'string' } },
        name: 'merchant_category_partial',
      },
      {
        key: { importBatchId: 1 },
        partialFilterExpression: { importBatchId: { $exists: true } },
        name: 'importBatch_partial', // undoing an import
      },
    ]),

    c.rules.createIndexes([{ key: { active: 1, priority: -1 }, name: 'active_priority' }]),

    c.importBatches.createIndexes([{ key: { createdAt: -1 }, name: 'created' }]),

    c.users.createIndexes([{ key: { username: 1 }, unique: true, name: 'username_unique' }]),

    c.sessions.createIndexes([
      // TTL: Mongo removes the session once `expiresAt` has passed (up to about a minute late).
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'expires_ttl' },
      { key: { userId: 1 }, name: 'user' }, // revoke all sessions of a user
    ]),

    c.credentials.createIndexes([
      { key: { credentialId: 1 }, unique: true, name: 'credentialId_unique' },
      { key: { userId: 1 }, name: 'user' },
    ]),
  ]);
}
