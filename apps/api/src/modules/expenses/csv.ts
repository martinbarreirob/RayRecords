import { isValidDateOnly } from '@rayrecords/shared';
import { normalizeDescription } from './normalize';
import type { RawTransaction } from './prepare';

/**
 * Lectura de extractos bancarios en CSV. No conocemos todavía el formato exacto del banco, así que el
 * parser es **tolerante**: detecta el separador, localiza la fila de cabecera por el nombre de las
 * columnas (fecha, concepto, importe o cargo/abono, saldo), admite decimales con coma y fechas
 * `dd/mm/yyyy`. Cuando llegue la muestra real se ajusta `HEADER_ALIASES` y se añade un test con ella.
 */

/** UTF-8 si es válido (con o sin BOM); si no, Windows-1252, que es lo habitual en bancos españoles. */
export function decodeCsv(buffer: Uint8Array): string {
  const bytes =
    buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf ? buffer.subarray(3) : buffer;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

function detectDelimiter(text: string): string {
  const firstLines = text.split(/\r?\n/).slice(0, 10).join('\n');
  const counts = [';', '\t', ','].map((d) => ({ d, n: firstLines.split(d).length - 1 }));
  return counts.sort((a, b) => b.n - a.n)[0]!.d;
}

/** CSV → filas de celdas. Admite comillas dobles, comillas escapadas (`""`) y saltos dentro de comillas. */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** `12/03/2026`, `12-03-26`, `2026-03-12` → `YYYY-MM-DD` (o `null`). Ignora una hora al final. */
export function parseBankDate(raw: string): string | null {
  const text = raw.trim().split(/[\sT]/)[0] ?? '';
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  let y: string, m: string, d: string;
  if (match) [, y, m, d] = match as unknown as [string, string, string, string];
  else {
    match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
    if (!match) return null;
    [, d, m, y] = match as unknown as [string, string, string, string];
    if (y.length === 2) y = `20${y}`;
  }
  const date = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return isValidDateOnly(date) ? date : null;
}

/**
 * Importe español → céntimos. `1.234,56` → 123456; `-12,5` → -1250; `12.50` → 1250; `(5,00)` → -500.
 * Con un solo separador y tres dígitos detrás (`1.234`) se interpreta como miles.
 */
export function parseAmountToCents(raw: string): number | null {
  let text = raw.replace(/[€\s ]|EUR/gi, '');
  if (!text) return null;

  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.endsWith('-')) {
    negative = true;
    text = text.slice(0, -1);
  }
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) text = text.slice(1);

  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  let decimalAt = Math.max(lastComma, lastDot);
  // Un único separador seguido de exactamente 3 dígitos y sin otro separador: son miles.
  if (
    decimalAt !== -1 &&
    (text.match(/[.,]/g) ?? []).length === 1 &&
    text.length - decimalAt - 1 === 3
  ) {
    decimalAt = -1;
  }

  const integerPart = (decimalAt === -1 ? text : text.slice(0, decimalAt)).replace(/[.,]/g, '');
  const decimalPart = decimalAt === -1 ? '' : text.slice(decimalAt + 1);
  // Más de dos decimales solo se admite como ruido de coma flotante (`5.7700000000000005`): se redondea.
  if (!/^\d+$/.test(integerPart) || !/^\d*$/.test(decimalPart)) return null;
  if (decimalPart.length > 2 && decimalPart.length < 4) return null;

  const roundUp = decimalPart.length > 2 && decimalPart.charCodeAt(2) >= 53 ? 1 : 0; // dígito ≥ 5
  const cents =
    Number(integerPart) * 100 + Number(decimalPart.slice(0, 2).padEnd(2, '0') || '0') + roundUp;
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

/** Nombres de columna reconocidos, ya normalizados (sin acentos ni mayúsculas), de mayor a menor preferencia. */
const HEADER_ALIASES = {
  date: [
    // «Data» es «fecha» en gallego/catalán: algunos extractos lo usan como cabecera.
    'data operacion',
    'fecha operacion',
    'fecha de operacion',
    'f. operacion',
    'fecha',
    'data',
    'fecha valor',
    'f. valor',
    'data valor',
  ],
  description: ['concepto', 'descripcion', 'movimiento', 'detalle', 'observaciones', 'referencia'],
  amount: ['importe', 'cantidad', 'importe eur', 'importe (eur)'],
  debit: ['cargo', 'cargos', 'debe', 'adeudo', 'gasto'],
  credit: ['abono', 'abonos', 'haber', 'ingreso', 'ingresos'],
  balance: ['saldo', 'saldo eur', 'saldo (eur)', 'saldo posterior'],
} as const;

type Column = keyof typeof HEADER_ALIASES;
type ColumnMap = Partial<Record<Column, number>>;

function mapHeader(cells: string[]): ColumnMap {
  const normalized = cells.map((c) => normalizeDescription(c));
  const map: ColumnMap = {};
  for (const column of Object.keys(HEADER_ALIASES) as Column[]) {
    for (const alias of HEADER_ALIASES[column]) {
      const index = normalized.indexOf(alias);
      if (index !== -1) {
        map[column] = index;
        break;
      }
    }
  }
  return map;
}

function isHeader(map: ColumnMap): boolean {
  const hasAmount =
    map.amount !== undefined || (map.debit !== undefined && map.credit !== undefined);
  return map.date !== undefined && map.description !== undefined && hasAmount;
}

export interface ParsedStatement {
  rows: RawTransaction[];
  /** Líneas ignoradas o con problemas (n.º de línea del fichero + motivo). */
  warnings: string[];
}

export class CsvFormatError extends Error {}

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;

/**
 * Algunos extractos traen el año mal en unas pocas filas (finales de diciembre con el año siguiente).
 * En un fichero ordenado de antiguo a nuevo se nota porque la fila queda casi un año por delante de las
 * dos siguientes: se le resta un año y se avisa. No actúa en ficheros desordenados ni en huecos reales.
 */
export function repairYearTypos(rows: RawTransaction[], warnings: string[]): void {
  if (rows.length < 4) return;
  let ascending = 0;
  for (let i = 1; i < rows.length; i++) if (rows[i]!.date >= rows[i - 1]!.date) ascending++;
  if (ascending / (rows.length - 1) < 0.9) return;

  // De atrás adelante: una racha de filas con el año mal se corrige empezando por la que enlaza con las buenas.
  for (let i = rows.length - 3; i >= 0; i--) {
    const row = rows[i]!;
    const gap = (offset: number) => dayNumber(row.date) - dayNumber(rows[i + offset]!.date);
    if (gap(1) > 180 && gap(2) > 180) {
      const fixed = `${Number(row.date.slice(0, 4)) - 1}${row.date.slice(4)}`;
      if (isValidDateOnly(fixed)) {
        warnings.unshift(`Movimiento ${i + 1}: año corregido (${row.date} → ${fixed})`);
        row.date = fixed;
      }
    }
  }
}

/** Interpreta el texto de un extracto. Lanza `CsvFormatError` si no encuentra una cabecera reconocible. */
export function parseBankCsv(text: string): ParsedStatement {
  const table = parseCsv(text);
  const headerIndex = table.slice(0, 20).findIndex((cells) => isHeader(mapHeader(cells)));
  if (headerIndex === -1) {
    throw new CsvFormatError(
      'No se reconoce la cabecera del CSV: se esperan columnas de fecha, concepto e importe (o cargo/abono).',
    );
  }
  const columns = mapHeader(table[headerIndex]!);
  const rows: RawTransaction[] = [];
  const warnings: string[] = [];

  for (let i = headerIndex + 1; i < table.length; i++) {
    const cells = table[i]!;
    const line = i + 1;
    const cell = (column: Column) =>
      columns[column] === undefined ? '' : (cells[columns[column]!] ?? '');

    const date = parseBankDate(cell('date'));
    if (!date) {
      warnings.push(`Línea ${line}: fecha no válida («${cell('date').trim()}»)`);
      continue;
    }

    let amountCents: number | null;
    if (columns.amount !== undefined) amountCents = parseAmountToCents(cell('amount'));
    else {
      const debit = parseAmountToCents(cell('debit'));
      const credit = parseAmountToCents(cell('credit'));
      amountCents =
        debit === null && credit === null ? null : Math.abs(credit ?? 0) - Math.abs(debit ?? 0);
    }
    if (amountCents === null) {
      warnings.push(`Línea ${line}: importe no válido`);
      continue;
    }

    const description = cell('description').replace(/\s+/g, ' ').trim();
    if (!description) {
      warnings.push(`Línea ${line}: sin concepto`);
      continue;
    }

    const balance = columns.balance === undefined ? null : parseAmountToCents(cell('balance'));
    rows.push({
      date,
      description: description.slice(0, 500),
      amountCents,
      ...(balance !== null && { balanceAfterCents: balance }),
    });
  }
  repairYearTypos(rows, warnings);
  return { rows, warnings };
}
