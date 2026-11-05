import { addDays, type DateOnly } from '@rayrecords/shared';
import type { RawTransaction } from '../modules/expenses/prepare';
import type { Rng } from './rng';

// Descripciones con el aspecto de un extracto bancario real (mayúsculas, prefijos, algún acento).
const SUPERMARKETS = [
  'COMPRA TARJ. MERCADONA MADRID',
  'COMPRA TARJ. CARREFOUR EXPRESS',
  'COMPRA TARJ. LIDL SUPERMERCADOS',
  'COMPRA TARJ. DIA 2841 MADRID',
];
const RESTAURANTS = [
  'COMPRA TARJ. TELEPIZZA 118',
  'COMPRA TARJ. RESTAURANTE LA TASCA',
  'COMPRA TARJ. BAR EL PORTAL',
  'COMPRA TARJ. CERVECERIA LA ESQUINA',
];
const TRANSPORT = [
  'COMPRA TARJ. RENFE VIAJEROS',
  'COMPRA TARJ. REPSOL ESTACION',
  'PAGO CABIFY ESPAÑA',
];
// Sin regla en DEFAULT_RULES: quedan sin categorizar y sirven para probar la corrección manual.
const OTHER = ['COMPRA TARJ. LIBRERIA CERVANTES', 'COMPRA TARJ. FERRETERIA EL TORNILLO'];
const LEISURE = ['COMPRA TARJ. CINES YELMO', 'COMPRA TARJ. STEAM GAMES'];

/** Suma meses de calendario a un `YYYY-MM-DD` y devuelve `YYYY-MM`. */
function shiftMonth(date: DateOnly, delta: number): string {
  const [y, m] = date.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function pad(day: number): string {
  return String(day).padStart(2, '0');
}

/** Movimientos de la cuenta corriente de los últimos `months` meses, hasta `today` inclusive. */
export function generateCheckingTransactions(
  today: DateOnly,
  rng: Rng,
  months = 6,
): RawTransaction[] {
  const rows: RawTransaction[] = [];

  for (let back = months - 1; back >= 0; back--) {
    const month = shiftMonth(today, -back);
    const add = (day: number, description: string, amountCents: number) => {
      const date = `${month}-${pad(day)}`;
      if (date <= today) rows.push({ date, description, amountCents });
    };
    const repeat = (min: number, max: number, fn: () => void) => {
      for (let i = rng.int(min, max); i > 0; i--) fn();
    };

    add(1, 'RECIBO ALQUILER PISO', -75_000);
    add(3, 'RECIBO GIMNASIO FITZONE', -2_990);
    add(5, 'RECIBO NETFLIX.COM', -1_299);
    add(8, 'RECIBO SPOTIFY AB', -1_099);
    add(12, 'RECIBO IBERDROLA CLIENTES', -rng.int(4_200, 8_200));
    add(27, 'TRANSFERENCIA NOMINA EMPRESA SL', 215_000);

    repeat(7, 9, () => add(rng.int(1, 28), rng.pick(SUPERMARKETS), -rng.int(900, 9_500)));
    repeat(3, 5, () => add(rng.int(1, 28), rng.pick(RESTAURANTS), -rng.int(800, 4_500)));
    repeat(2, 4, () => add(rng.int(1, 28), rng.pick(TRANSPORT), -rng.int(300, 5_500)));
    repeat(1, 2, () => add(rng.int(1, 28), rng.pick(LEISURE), -rng.int(600, 3_000)));
    repeat(0, 1, () => add(rng.int(1, 28), rng.pick(OTHER), -rng.int(1_200, 6_000)));
    add(rng.int(1, 28), 'COMPRA TARJ. FARMACIA GARCÍA', -rng.int(400, 2_800));
    add(rng.int(1, 28), 'BIZUM RECIBIDO JUAN PEREZ', rng.int(500, 4_000));
  }

  // Dos cafés idénticos el mismo día: ejercitan el n.º de repetición del hash de deduplicación.
  const coffeeDay = addDays(today, -3);
  for (let i = 0; i < 2; i++) {
    rows.push({
      date: coffeeDay,
      description: 'COMPRA TARJ. CAFETERIA LA ESQUINA',
      amountCents: -180,
    });
  }

  // `sort` es estable: los movimientos del mismo día conservan el orden de generación.
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Añade el saldo tras cada movimiento (como lo traería un extracto con columna de saldo). */
export function withRunningBalance(
  rows: readonly RawTransaction[],
  openingBalanceCents: number,
): RawTransaction[] {
  let balance = openingBalanceCents;
  return rows.map((row) => {
    balance += row.amountCents;
    return { ...row, balanceAfterCents: balance };
  });
}
