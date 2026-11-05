import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { prepareTransactions, type RawTransaction } from './prepare';

const accountId = new ObjectId('6650a1b2c3d4e5f607182930');
const rules = [
  {
    pattern: 'mercadona',
    matchType: 'contains' as const,
    categoryKey: 'supermercado',
    priority: 0,
    active: true,
  },
];

const rows: RawTransaction[] = [
  { date: '2026-10-05', description: 'COMPRA TARJ. MERCADONA MADRID', amountCents: -4520 },
  { date: '2026-10-05', description: 'COMPRA TARJ. CAFETERIA LA ESQUINA', amountCents: -180 },
  { date: '2026-10-05', description: 'COMPRA TARJ. CAFETERIA LA ESQUINA', amountCents: -180 },
];

describe('prepareTransactions', () => {
  const docs = prepareTransactions({ accountId, rows, rules });

  it('categorizes by rule and leaves non-matching rows uncategorized', () => {
    expect(docs[0]).toMatchObject({ category: 'supermercado', categorySource: 'rule' });
    expect(docs[1]).toMatchObject({ category: null, categorySource: 'none' });
  });

  it('stores a UTC date, the denormalized month and the normalized description', () => {
    expect(docs[0]).toMatchObject({
      date: new Date('2026-10-05T00:00:00Z'),
      month: '2026-10',
      descriptionNorm: 'compra tarj. mercadona madrid',
    });
  });

  it('gives different hashes to two identical transactions on the same day', () => {
    expect(docs[1]!.hash).not.toBe(docs[2]!.hash);
    expect(new Set(docs.map((d) => d.hash)).size).toBe(3);
  });

  it('re-importing the same rows produces the same hashes (the unique index drops them)', () => {
    const again = prepareTransactions({ accountId, rows, rules });
    expect(again.map((d) => d.hash)).toEqual(docs.map((d) => d.hash));
  });

  it('the same transaction in another account has a different hash', () => {
    const other = prepareTransactions({ accountId: new ObjectId(), rows, rules });
    expect(other[0]!.hash).not.toBe(docs[0]!.hash);
  });

  it('links the import batch when given', () => {
    const importBatchId = new ObjectId();
    const [first] = prepareTransactions({ accountId, rows, rules, importBatchId });
    expect(first!.importBatchId).toEqual(importBatchId);
    expect(docs[0]).not.toHaveProperty('importBatchId');
  });
});
