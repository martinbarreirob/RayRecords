import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BOARD,
  boardList,
  cleanOptions,
  keyFromLabel,
  listTypeLabel,
  moveItem,
  nextColor,
  kindLabel,
  kindPatch,
  newColumn,
  nextKind,
  patchRow,
  simpleList,
  tableList,
  withOption,
  withoutOption,
} from './create-logic';

describe('create-logic', () => {
  it('keyFromLabel makes a camelCase key without accents and keeps it unique', () => {
    expect(keyFromLabel('Corte de pelo', new Set())).toBe('corteDePelo');
    expect(keyFromLabel('Año', new Set())).toBe('ano');
    expect(keyFromLabel('Estado', new Set(['estado']))).toBe('estado2');
    expect(keyFromLabel('2º turno', new Set())).toMatch(/^[a-z][a-zA-Z0-9_]*$/);
    expect(keyFromLabel('???', new Set())).toBe('c');
  });

  it('moveItem puts an element where it is dropped and ignores impossible moves', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });

  it('nextKind cycles Texto, Opciones, Número and Fecha', () => {
    expect(nextKind('text')).toBe('select');
    expect(nextKind('select')).toBe('number');
    expect(nextKind('date')).toBe('text');
  });

  it('kindLabel also names the kinds the cycle does not offer', () => {
    expect(kindLabel('select')).toBe('Opciones');
    expect(kindLabel('money')).toBe('Dinero');
    expect(nextKind('money')).toBe('text');
  });

  it('patchRow changes only the row with that id', () => {
    const rows = [
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ];
    expect(patchRow(rows, 2, { label: 'x' })).toEqual([
      { id: 1, label: 'a' },
      { id: 2, label: 'x' },
    ]);
    expect(rows[1]!.label).toBe('b');
  });

  it('kindPatch seeds two options when a column becomes Opciones', () => {
    expect(kindPatch({ id: 1, label: 'a', type: 'text', options: [] })).toEqual({
      type: 'select',
      options: ['Opción 1', 'Opción 2'],
    });
    expect(kindPatch({ id: 1, label: 'a', type: 'text', options: ['x'] }).options).toEqual(['x']);
    expect(kindPatch({ id: 1, label: 'a', type: 'select', options: ['x'] }).type).toBe('number');
  });

  it('withOption trims and refuses empties and repeats; withoutOption removes one', () => {
    expect(withOption(['a'], ' b ')).toEqual(['a', 'b']);
    expect(withOption(['a'], 'a')).toBeNull();
    expect(withOption(['a'], '  ')).toBeNull();
    expect(withoutOption(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('newColumn takes the first colour the others do not use', () => {
    expect(
      newColumn(5, [
        { id: 1, label: 'x', color: 'blue' },
        { id: 2, label: 'y' },
      ]),
    ).toEqual({
      id: 5,
      label: 'Nueva columna',
      color: 'green',
    });
  });

  it('the default board is To do, In progress and Done, without keys', () => {
    expect(DEFAULT_BOARD).toEqual([
      { label: 'To do', color: 'blue', icon: 'todo' },
      { label: 'In progress', color: 'amber', icon: 'progress' },
      { label: 'Done', color: 'green', icon: 'done' },
    ]);
  });

  it('nextColor takes the first colour not used yet, then goes round', () => {
    expect(nextColor([])).toBe('blue');
    expect(nextColor(['blue', 'green'])).toBe('amber');
    expect(nextColor(['blue', 'green', 'amber', 'rose', 'violet', 'teal'])).toBe('blue');
  });

  it('cleanOptions trims and drops empties and repeats', () => {
    expect(cleanOptions([' Corte ', '', 'Barba', 'Corte'])).toEqual(['Corte', 'Barba']);
  });

  it('tableList turns the columns into fields, in order, with options only for selects', () => {
    const list = tableList(
      '  Clientes ',
      [
        { id: 1, label: 'Cliente', type: 'text', options: [] },
        { id: 2, label: 'Servicio', type: 'select', options: ['Corte de pelo', 'Pelo y barba'] },
        { id: 3, label: '  ', type: 'text', options: [] },
        { id: 4, label: 'Día', type: 'date', options: ['ignorada'] },
      ],
      'cli',
    );
    expect(list.name).toBe('Clientes');
    expect(list.kind).toBe('free');
    expect(list.captureAlias).toBe('cli');
    expect(list.fieldDefs).toEqual([
      { key: 'cliente', label: 'Cliente', type: 'text' },
      {
        key: 'servicio',
        label: 'Servicio',
        type: 'select',
        options: ['Corte de pelo', 'Pelo y barba'],
      },
      { key: 'dia', label: 'Día', type: 'date' },
    ]);
  });

  it('boardList keeps the order and the colour of each column', () => {
    const list = boardList(
      'Web',
      [
        { id: 1, label: 'Por hacer', color: 'blue' },
        { id: 2, label: 'Hecho', color: 'green' },
      ],
      '',
    );
    expect(list.kind).toBe('board');
    expect(list.captureAlias).toBeUndefined();
    expect(list.board?.columns).toEqual([
      { key: 'porHacer', label: 'Por hacer', color: 'blue' },
      { key: 'hecho', label: 'Hecho', color: 'green' },
    ]);
  });

  it('simpleList has no fields', () => {
    expect(simpleList('Compra', '').fieldDefs).toEqual([]);
  });

  it('listTypeLabel tells a kanban, a table and a simple list apart', () => {
    expect(listTypeLabel({ kind: 'board', board: { columns: [1, 2, 3] }, fieldDefs: [] })).toBe(
      'Kanban · 3 columnas',
    );
    expect(listTypeLabel({ kind: 'free', fieldDefs: [1, 2] })).toBe('Tabla · 2 columnas');
    expect(listTypeLabel({ kind: 'free', fieldDefs: [] })).toBe('Lista simple');
    expect(listTypeLabel({ kind: 'media', fieldDefs: [1] })).toBe('Colección');
  });
});
