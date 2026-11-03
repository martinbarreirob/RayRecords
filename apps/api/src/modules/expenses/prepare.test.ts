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

  it('categoriza por regla y deja sin categoría lo que no coincide', () => {
    expect(docs[0]).toMatchObject({ category: 'supermercado', categorySource: 'rule' });
    expect(docs[1]).toMatchObject({ category: null, categorySource: 'none' });
  });

  it('guarda fecha UTC, mes desnormalizado y descripción normalizada', () => {
    expect(docs[0]).toMatchObject({
      date: new Date('2026-10-05T00:00:00Z'),
      month: '2026-10',
      descriptionNorm: 'compra tarj. mercadona madrid',
    });
  });

  it('da hashes distintos a dos movimientos idénticos del mismo día', () => {
    expect(docs[1]!.hash).not.toBe(docs[2]!.hash);
    expect(new Set(docs.map((d) => d.hash)).size).toBe(3);
  });

  it('reimportar las mismas filas produce los mismos hashes (la BD las descartará por el índice único)', () => {
    const again = prepareTransactions({ accountId, rows, rules });
    expect(again.map((d) => d.hash)).toEqual(docs.map((d) => d.hash));
  });

  it('el mismo movimiento en otra cuenta tiene otro hash', () => {
    const other = prepareTransactions({ accountId: new ObjectId(), rows, rules });
    expect(other[0]!.hash).not.toBe(docs[0]!.hash);
  });

  it('enlaza el lote de importación si se indica', () => {
    const importBatchId = new ObjectId();
    const [first] = prepareTransactions({ accountId, rows, rules, importBatchId });
    expect(first!.importBatchId).toEqual(importBatchId);
    expect(docs[0]).not.toHaveProperty('importBatchId');
  });
});
