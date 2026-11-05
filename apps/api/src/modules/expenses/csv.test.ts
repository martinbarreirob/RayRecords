import { describe, expect, it } from 'vitest';
import {
  CsvFormatError,
  decodeCsv,
  parseAmountToCents,
  parseBankCsv,
  parseBankDate,
  parseCsv,
  repairYearTypos,
} from './csv';

describe('parseAmountToCents', () => {
  it.each([
    ['1.234,56', 123456],
    ['-12,5', -1250],
    ['12.50', 1250],
    ['(5,00)', -500],
    ['+3,2', 320],
    ['1.234', 123400],
    ['1,234', 123400],
    ['-1.234,5 €', -123450],
    ['0,07', 7],
    ['12-', -1200],
    ['100', 10000],
    // Floating point noise from the bank: rounded to cents.
    ['-5.7700000000000005 €', -577],
    ['338.16999999999996 €', 33817],
    ['-0.99 €', -99],
  ])('%s → %d', (raw, expected) => {
    expect(parseAmountToCents(raw)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3x', '12a,50'])('rejects "%s"', (raw) => {
    expect(parseAmountToCents(raw)).toBeNull();
  });
});

describe('parseBankDate', () => {
  it('accepts several formats and rejects impossible dates', () => {
    expect(parseBankDate('05/03/2026')).toBe('2026-03-05');
    expect(parseBankDate('5-3-26')).toBe('2026-03-05');
    expect(parseBankDate('2026-03-05 10:30')).toBe('2026-03-05');
    expect(parseBankDate('31/02/2026')).toBeNull();
    expect(parseBankDate('hola')).toBeNull();
  });
});

describe('parseCsv', () => {
  it('detects the delimiter and honors quotes', () => {
    expect(parseCsv('a;b;c\n1;"x;y";3\n')).toEqual([
      ['a', 'b', 'c'],
      ['1', 'x;y', '3'],
    ]);
    expect(parseCsv('a,b\r\n"di ""hola""",2')).toEqual([
      ['a', 'b'],
      ['di "hola"', '2'],
    ]);
  });
});

describe('decodeCsv', () => {
  it('strips the BOM and falls back to Windows-1252 when not UTF-8', () => {
    expect(decodeCsv(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]))).toBe('a');
    expect(decodeCsv(Uint8Array.from([0x63, 0x61, 0x66, 0xe9]))).toBe('café'); // e-acute in 1252
    expect(decodeCsv(new TextEncoder().encode('ñandú'))).toBe('ñandú');
  });
});

describe('parseBankCsv', () => {
  it('signed amount, balance and preamble rows before the header', () => {
    const csv = [
      'Extracto de movimientos;;;',
      'Cuenta: ES00 0000;;;',
      'Fecha operación;Concepto;Importe;Saldo',
      '03/11/2026;COMPRA MERCADONA 123;-45,67;1.000,00',
      '02/11/2026;NÓMINA EMPRESA;1.500,00;1.045,67',
      '',
    ].join('\n');
    const { rows, warnings } = parseBankCsv(csv);
    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      {
        date: '2026-11-03',
        description: 'COMPRA MERCADONA 123',
        amountCents: -4567,
        balanceAfterCents: 100000,
      },
      {
        date: '2026-11-02',
        description: 'NÓMINA EMPRESA',
        amountCents: 150000,
        balanceAfterCents: 104567,
      },
    ]);
  });

  it('debit and credit in separate columns', () => {
    const { rows } = parseBankCsv(
      [
        'Fecha;Descripción;Cargo;Abono',
        '01/11/2026;Recibo luz;60,10;',
        '02/11/2026;Bizum;;25',
      ].join('\n'),
    );
    expect(rows.map((r) => r.amountCents)).toEqual([-6010, 2500]);
  });

  it('warns about invalid lines without discarding the rest', () => {
    const { rows, warnings } = parseBankCsv(
      [
        'Fecha;Concepto;Importe',
        '01/11/2026;Bien;-1,00',
        'mal;Fecha rota;-1,00',
        '02/11/2026;Importe roto;xx',
        '03/11/2026;;-1,00',
      ].join('\n'),
    );
    expect(rows).toHaveLength(1);
    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('Línea 3');
  });

  it('throws a clear error when no header is recognizable', () => {
    expect(() => parseBankCsv('uno;dos\n1;2')).toThrow(CsvFormatError);
  });

  it('real bank format: "Data" header, amounts with the euro sign and decimal noise, operation date', () => {
    const csv = [
      'Data,Concepto,Saldo,Importe,Data operación,Data valor',
      '02-09-2024,BEACH BAR\SOME TOWN\ES0000000000,1668.28 €,-7.0 €,31-08-2024,31-08-2024',
      '29-08-2024,Amazon Prime*QR8CL7U55 amazon.es/prm 445,338.16999999999996 €,-49.9 €,29-08-2024,26-08-2024',
      '30-08-2024,"ACME PAYROLL, S.L.",1800.00 €,1500.00 €,30-08-2024,30-08-2024',
    ].join('\n');
    const { rows, warnings } = parseBankCsv(csv);
    expect(warnings).toEqual([]);
    expect(rows).toEqual([
      {
        date: '2024-08-31',
        description: 'BEACH BAR\SOME TOWN\ES0000000000',
        amountCents: -700,
        balanceAfterCents: 166828,
      },
      {
        date: '2024-08-29',
        description: 'Amazon Prime*QR8CL7U55 amazon.es/prm 445',
        amountCents: -4990,
        balanceAfterCents: 33817,
      },
      {
        date: '2024-08-30',
        description: 'ACME PAYROLL, S.L.',
        amountCents: 150000,
        balanceAfterCents: 180000,
      },
    ]);
  });
});

describe('repairYearTypos', () => {
  const row = (date: string) => ({ date, description: 'x', amountCents: -100 });

  it('fixes rows with the year too far ahead in a sorted file', () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => row(`2025-11-${String(i + 1).padStart(2, '0')}`)),
      row('2025-12-20'),
      row('2026-12-29'),
      row('2026-12-31'),
      row('2026-01-02'),
      row('2026-01-03'),
    ];
    const warnings: string[] = [];
    repairYearTypos(rows, warnings);
    expect(rows.slice(20).map((r) => r.date)).toEqual([
      '2025-12-20',
      '2025-12-29',
      '2025-12-31',
      '2026-01-02',
      '2026-01-03',
    ]);
    expect(warnings).toHaveLength(2);
  });

  it('leaves newest-first files and real gaps alone', () => {
    const descending = [row('2026-12-01'), row('2026-03-01'), row('2026-02-01'), row('2026-01-01')];
    repairYearTypos(descending, []);
    expect(descending[0]!.date).toBe('2026-12-01');
    const gap = [row('2025-01-01'), row('2025-01-02'), row('2025-12-01'), row('2025-12-02')];
    repairYearTypos(gap, []);
    expect(gap.map((r) => r.date)).toEqual([
      '2025-01-01',
      '2025-01-02',
      '2025-12-01',
      '2025-12-02',
    ]);
  });
});
