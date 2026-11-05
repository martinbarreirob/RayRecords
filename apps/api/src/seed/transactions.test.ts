import { DEFAULT_RULES } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { prepareTransactions } from '../modules/expenses/prepare';
import { createRng } from './rng';
import { generateCheckingTransactions, withRunningBalance } from './transactions';

const TODAY = '2026-11-03';
const generate = (seed = 42) => generateCheckingTransactions(TODAY, createRng(seed));

describe('generateCheckingTransactions', () => {
  it('is deterministic for a seed and differs for another', () => {
    expect(generate(42)).toEqual(generate(42));
    expect(generate(42)).not.toEqual(generate(7));
  });

  it('sorts by date and generates no future transactions', () => {
    const rows = generate();
    const dates = rows.map((r) => r.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((d) => d <= TODAY)).toBe(true);
  });

  it('covers six months with a monthly payroll and only non-zero integer amounts', () => {
    const rows = generate();
    const months = new Set(rows.map((r) => r.date.slice(0, 7)));
    expect(months.size).toBe(6);
    const payrolls = rows.filter((r) => r.description.includes('NOMINA'));
    expect(payrolls.length).toBeGreaterThanOrEqual(5);
    expect(rows.every((r) => Number.isInteger(r.amountCents) && r.amountCents !== 0)).toBe(true);
  });

  it('includes two identical transactions on the same day', () => {
    const coffees = generate().filter(
      (r) => r.description.includes('CAFETERIA LA ESQUINA') && r.amountCents === -180,
    );
    expect(coffees).toHaveLength(2);
    expect(coffees[0]!.date).toBe(coffees[1]!.date);
  });

  it('produces unique hashes once prepared, and categorization covers most rows', () => {
    const rows = withRunningBalance(generate(), 125_000);
    const docs = prepareTransactions({
      accountId: new ObjectId(),
      rows,
      rules: DEFAULT_RULES,
    });
    expect(new Set(docs.map((d) => d.hash)).size).toBe(docs.length);
    const categorized = docs.filter((d) => d.category !== null).length;
    expect(categorized / docs.length).toBeGreaterThan(0.8);
    expect(docs.some((d) => d.category === null)).toBe(true); // some remain to be corrected by hand
  });
});

describe('withRunningBalance', () => {
  it('accumulates the balance from the opening balance', () => {
    const rows = withRunningBalance(
      [
        { date: '2026-10-01', description: 'a', amountCents: -100 },
        { date: '2026-10-02', description: 'b', amountCents: 350 },
      ],
      1_000,
    );
    expect(rows.map((r) => r.balanceAfterCents)).toEqual([900, 1_250]);
  });
});
