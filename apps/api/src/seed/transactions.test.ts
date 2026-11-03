import { DEFAULT_RULES } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import { describe, expect, it } from 'vitest';
import { prepareTransactions } from '../modules/expenses/prepare';
import { createRng } from './rng';
import {
  generateCheckingTransactions,
  generateSavingsTransactions,
  withRunningBalance,
} from './transactions';

const TODAY = '2026-11-03';
const generate = (seed = 42) => generateCheckingTransactions(TODAY, createRng(seed));

describe('generateCheckingTransactions', () => {
  it('es determinista para una misma semilla y distinto para otra', () => {
    expect(generate(42)).toEqual(generate(42));
    expect(generate(42)).not.toEqual(generate(7));
  });

  it('ordena por fecha y no genera movimientos futuros', () => {
    const rows = generate();
    const dates = rows.map((r) => r.date);
    expect(dates).toEqual([...dates].sort());
    expect(dates.every((d) => d <= TODAY)).toBe(true);
  });

  it('cubre seis meses con nómina mensual y solo importes enteros no nulos', () => {
    const rows = generate();
    const months = new Set(rows.map((r) => r.date.slice(0, 7)));
    expect(months.size).toBe(6);
    const payrolls = rows.filter((r) => r.description.includes('NOMINA'));
    expect(payrolls.length).toBeGreaterThanOrEqual(5);
    expect(rows.every((r) => Number.isInteger(r.amountCents) && r.amountCents !== 0)).toBe(true);
  });

  it('incluye dos movimientos idénticos el mismo día', () => {
    const coffees = generate().filter(
      (r) => r.description.includes('CAFETERIA LA ESQUINA') && r.amountCents === -180,
    );
    expect(coffees).toHaveLength(2);
    expect(coffees[0]!.date).toBe(coffees[1]!.date);
  });

  it('produce hashes únicos tras prepararse, y la categorización cubre la mayoría', () => {
    const rows = withRunningBalance(generate(), 125_000);
    const docs = prepareTransactions({
      accountId: new ObjectId(),
      rows,
      rules: DEFAULT_RULES,
    });
    expect(new Set(docs.map((d) => d.hash)).size).toBe(docs.length);
    const categorized = docs.filter((d) => d.category !== null).length;
    expect(categorized / docs.length).toBeGreaterThan(0.8);
    expect(docs.some((d) => d.category === null)).toBe(true); // queda alguno para corregir a mano
  });
});

describe('withRunningBalance', () => {
  it('acumula el saldo desde el saldo inicial', () => {
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

describe('generateSavingsTransactions', () => {
  it('hace un traspaso por mes el día 28 sin pasar de hoy', () => {
    // El 28 de noviembre aún no ha llegado, así que el último es el de octubre.
    const rows = generateSavingsTransactions(TODAY);
    expect(rows.map((r) => r.date)).toEqual([
      '2026-06-28',
      '2026-07-28',
      '2026-08-28',
      '2026-09-28',
      '2026-10-28',
    ]);
  });
});
