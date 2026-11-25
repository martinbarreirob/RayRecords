import type { BoardColumn, FieldDef } from '@rayrecords/shared';
import {
  cardsPerColumn,
  columnDeleteBlock,
  columnsToDrafts,
  fieldsToDrafts,
  isConfigurable,
  settingsProblem,
} from './settings-logic';
import { buildColumns, buildFieldDefs, kindLabel, nextKind } from './create-logic';

describe('settings-logic', () => {
  const defs: FieldDef[] = [
    { key: 'nombre', label: 'Nombre', type: 'text' },
    { key: 'estado', label: 'Estado', type: 'select', options: ['A', 'B'] },
  ];

  it('only boards and tables are configurable', () => {
    expect(isConfigurable({ fieldDefs: [] })).toBe(false);
    expect(isConfigurable({ fieldDefs: defs })).toBe(true);
    expect(isConfigurable({ fieldDefs: [], board: { columns: [] } })).toBe(true);
  });

  it('existing fields keep their key even when renamed or reordered', () => {
    const drafts = fieldsToDrafts(defs);
    drafts[0] = { ...drafts[0]!, label: 'Cliente' };
    const built = buildFieldDefs([drafts[1]!, drafts[0]!], ['nombre', 'estado']);
    expect(built.map((f) => f.key)).toEqual(['estado', 'nombre']);
    expect(built[1]!.label).toBe('Cliente');
    expect(built[0]!.options).toEqual(['A', 'B']);
  });

  it('new fields get a unique key, never reusing a deleted one', () => {
    const drafts = [
      ...fieldsToDrafts([defs[0]!]),
      { id: 9, label: 'Estado', type: 'text' as const, options: [] },
      { id: 10, label: 'Nombre', type: 'text' as const, options: [] },
    ];
    const built = buildFieldDefs(drafts, ['nombre', 'estado']);
    expect(built.map((f) => f.key)).toEqual(['nombre', 'estado2', 'nombre2']);
  });

  it('keeps kinds that cannot be picked and labels them', () => {
    const drafts = fieldsToDrafts([{ key: 'precio', label: 'Precio', type: 'money' }]);
    expect(buildFieldDefs(drafts, ['precio'])[0]!.type).toBe('money');
    expect(kindLabel('money')).toBe('Dinero');
    expect(kindLabel('select')).toBe('Opciones');
    expect(nextKind('text')).toBe('select');
    expect(nextKind('money')).toBe('text');
  });

  it('options are only kept for select fields and are cleaned', () => {
    const built = buildFieldDefs(
      [
        { id: 1, label: 'A', type: 'select', options: [' x ', 'x', ''] },
        { id: 2, label: 'B', type: 'number', options: ['y'] },
      ],
      [],
    );
    expect(built[0]!.options).toEqual(['x']);
    expect(built[1]!.options).toBeUndefined();
  });

  it('board columns keep key and colour; new ones get a key', () => {
    const columns: BoardColumn[] = [
      { key: 'porHacer', label: 'Por hacer', color: 'blue' },
      { key: 'hecho', label: 'Hecho' },
    ];
    const drafts = columnsToDrafts(columns);
    drafts.push({ id: 7, label: 'Por hacer', color: 'rose' });
    const built = buildColumns(drafts, ['porHacer', 'hecho']);
    expect(built).toEqual([
      { key: 'porHacer', label: 'Por hacer', color: 'blue' },
      { key: 'hecho', label: 'Hecho' },
      { key: 'porHacer2', label: 'Por hacer', color: 'rose' },
    ]);
  });

  it('counts cards per column', () => {
    const counts = cardsPerColumn([{ column: 'a' }, { column: 'a' }, { column: 'b' }, {}]);
    expect(counts.get('a')).toBe(2);
    expect(counts.get('b')).toBe(1);
  });

  it('a column with cards cannot be deleted; empty and new ones can', () => {
    const counts = new Map([
      ['a', 2],
      ['c', 1],
    ]);
    const col = (key?: string) => ({ id: 1, label: 'X', ...(key && { key }) });
    expect(columnDeleteBlock(col('a'), counts, 3)).toContain('2 tarjetas');
    expect(columnDeleteBlock(col('c'), counts, 3)).toContain('1 tarjeta:');
    expect(columnDeleteBlock(col('b'), counts, 3)).toBeNull();
    expect(columnDeleteBlock(col(), counts, 3)).toBeNull();
    expect(columnDeleteBlock(col('b'), counts, 1)).not.toBeNull();
  });

  it('validates the name and the columns', () => {
    expect(settingsProblem(' ', [{ label: 'a' }], 'column')).not.toBeNull();
    expect(settingsProblem('x', [], 'column')).not.toBeNull();
    expect(settingsProblem('x', [{ label: ' ' }], 'field')).not.toBeNull();
    expect(settingsProblem('x', [{ label: 'a' }, { label: 'A' }], 'field')).not.toBeNull();
    expect(settingsProblem('x', [{ label: 'a' }, { label: 'A' }], 'column')).toBeNull();
  });
});
