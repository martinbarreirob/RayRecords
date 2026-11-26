import {
  LIST_PRESETS,
  addDays,
  slugify,
  type DateOnly,
  type Extra,
  type BoardColumn,
  type ListPreset,
} from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import type {
  EventDoc,
  ItemDoc,
  ItemHistoryDoc,
  ListDoc,
  NoteCardDoc,
  NoteGroupDoc,
} from '../db/documents';

interface ItemSeed {
  title: string;
  text?: string;
  tags?: string[];
  dueDate?: DateOnly;
  time?: string;
  url?: string;
  extra?: Extra;
  column?: string;
  done?: boolean;
}

/**
 * The columns of the sample board: every state icon the new column editor offers in use, and one
 * custom RGB colour next to the named ones.
 */
const BOARD_COLUMNS: BoardColumn[] = [
  { key: 'backlog', label: 'Backlog', color: 'violet', icon: 'backlog' },
  { key: 'porHacer', label: 'Por hacer', color: 'blue', icon: 'todo' },
  { key: 'enCurso', label: 'En curso', color: 'amber', icon: 'progress' },
  { key: 'enRevision', label: 'En revisión', color: '#0d9488', icon: 'review' },
  { key: 'hecho', label: 'Hecho', color: 'green', icon: 'done' },
];

/** The priority of a card (`extra.priority`), plus the old «prioridad» select the preset still has. */
const LEGACY_PRIORITY = { low: 'baja', medium: 'media', high: 'alta', urgent: 'alta' } as const;
const priority = (value: keyof typeof LEGACY_PRIORITY): Extra => ({
  priority: value,
  prioridad: LEGACY_PRIORITY[value],
});

function makeList(
  preset: ListPreset,
  order: number,
  now: Date,
  overrides: Partial<ListPreset> = {},
): ListDoc {
  const p = { ...preset, ...overrides };
  return {
    _id: new ObjectId(),
    name: p.name,
    slug: slugify(p.name),
    kind: p.kind,
    ...(p.icon !== undefined && { icon: p.icon }),
    ...(p.captureAlias !== undefined && { captureAlias: p.captureAlias }),
    fieldDefs: p.fieldDefs,
    ...(p.board !== undefined && { board: p.board }),
    order,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

function toItems(list: ListDoc, seeds: ItemSeed[], now: Date): ItemDoc[] {
  return seeds.map((seed, i) => ({
    _id: new ObjectId(),
    listId: list._id,
    title: seed.title,
    ...(seed.text !== undefined && { text: seed.text }),
    tags: seed.tags ?? [],
    ...(seed.dueDate !== undefined && { dueDate: seed.dueDate }),
    ...(seed.time !== undefined && { time: seed.time }),
    ...(seed.url !== undefined && { url: seed.url }),
    extra: seed.extra ?? {},
    ...(seed.column !== undefined && { column: seed.column }),
    order: (i + 1) * 1000,
    ...(seed.done && { doneAt: now }),
    source: 'manual' as const,
    createdAt: new Date(now.getTime() - (seeds.length - i) * 3_600_000),
    updatedAt: now,
  }));
}

/** Sample lists, items and notes. Dates are relative to today so the calendar always has data. */
export function buildCatalog(now: Date, today: DateOnly) {
  const films = makeList(LIST_PRESETS.media, 1000, now);
  const series = makeList(LIST_PRESETS.media, 2000, now, {
    name: 'Series',
    icon: 'tv',
    captureAlias: 'serie',
  });
  const shopping = makeList(LIST_PRESETS.shopping, 3000, now);
  const tasks = makeList(LIST_PRESETS.free, 4000, now, {
    name: 'Tareas',
    icon: 'check-square',
    captureAlias: 'tarea',
  });
  const board = makeList(LIST_PRESETS.board, 5000, now, {
    name: 'Portfolio web',
    board: { columns: BOARD_COLUMNS },
  });
  const ideas = makeList(LIST_PRESETS.free, 6000, now, { name: 'Ideas', icon: 'lightbulb' });

  const media = (
    anio: number,
    estado: string,
    puntuacion?: number,
    plataforma?: string,
  ): Extra => ({
    anio,
    estado,
    ...(puntuacion !== undefined && { puntuacion }),
    ...(plataforma !== undefined && { plataforma }),
  });

  const items: ItemDoc[] = [
    ...toItems(
      films,
      [
        { title: 'Dune: Parte dos', tags: ['scifi'], extra: media(2024, 'visto', 5, 'Max') },
        {
          title: 'Oppenheimer',
          tags: ['drama', 'historia'],
          extra: media(2023, 'visto', 4, 'Movistar+'),
        },
        { title: 'Blade Runner 2049', tags: ['scifi'], extra: media(2017, 'visto', 5) },
        { title: 'Parásitos', tags: ['thriller'], extra: media(2019, 'visto', 5) },
        { title: 'Interstellar', tags: ['scifi'], extra: media(2014, 'visto', 4) },
        { title: 'El Padrino', tags: ['clásico'], extra: media(1972, 'pendiente') },
        { title: 'Amélie', tags: ['francia'], extra: media(2001, 'pendiente') },
        {
          title: 'Mad Max: Furia en la carretera',
          tags: ['acción'],
          extra: media(2015, 'pendiente'),
        },
        { title: 'Perfect Days', tags: ['drama'], extra: media(2023, 'pendiente') },
        { title: 'La La Land', tags: ['musical'], extra: media(2016, 'abandonado', 2) },
      ],
      now,
    ),
    ...toItems(
      series,
      [
        {
          title: 'Severance',
          tags: ['scifi', 'thriller'],
          extra: media(2022, 'viendo', undefined, 'Apple TV+'),
        },
        {
          title: 'Slow Horses',
          tags: ['espías'],
          extra: media(2022, 'viendo', undefined, 'Apple TV+'),
        },
        { title: 'The Bear', tags: ['drama'], extra: media(2022, 'visto', 5, 'Disney+') },
        { title: 'Succession', tags: ['drama'], extra: media(2018, 'visto', 5, 'Max') },
        {
          title: 'Shōgun',
          tags: ['historia'],
          extra: media(2024, 'pendiente', undefined, 'Disney+'),
        },
        {
          title: 'Fallout',
          tags: ['scifi'],
          extra: media(2024, 'pendiente', undefined, 'Prime Video'),
        },
      ],
      now,
    ),
    ...toItems(
      shopping,
      [
        {
          title: 'Auriculares inalámbricos',
          url: 'https://example.com/auriculares',
          extra: { categoria: 'tecnología', precio: 12_999, estado: 'pendiente' },
        },
        {
          title: 'Cafetera Nespresso',
          url: 'https://example.com/cafetera',
          extra: { categoria: 'hogar', precio: 8_900, estado: 'pendiente' },
        },
        {
          title: 'Zapatillas de running',
          extra: { categoria: 'deporte', precio: 11_990, estado: 'pendiente' },
        },
        {
          title: 'Lámpara de escritorio',
          extra: { categoria: 'hogar', precio: 3_450, estado: 'pendiente' },
        },
        {
          title: 'Designing Data-Intensive Applications',
          tags: ['libros'],
          extra: { categoria: 'libros', precio: 4_200, estado: 'pendiente' },
        },
        {
          title: 'Mochila 25 L',
          extra: { categoria: 'viajes', precio: 6_500, estado: 'pendiente' },
        },
        {
          title: 'Monitor 27"',
          extra: { categoria: 'tecnología', precio: 24_900, estado: 'comprado' },
          done: true,
        },
        {
          title: 'Cargador USB-C',
          extra: { categoria: 'tecnología', precio: 1_999, estado: 'comprado' },
          done: true,
        },
      ],
      now,
    ),
    ...toItems(
      tasks,
      [
        // A task that is overdue and one with a link: list items with a date show in the calendar
        // too, next to the events.
        { title: 'Enviar la factura de octubre', dueDate: addDays(today, -2), tags: ['trabajo'] },
        {
          title: 'Comprar entradas del concierto',
          dueDate: addDays(today, 7),
          url: 'https://example.com/entradas',
        },
        { title: 'Ordenar el trastero', tags: ['casa'] },
      ],
      now,
    ),
    ...toItems(
      board,
      [
        {
          title: 'Definir la arquitectura del monorepo',
          text: 'Paquetes `web`, `api` y `shared`; el esquema Zod vive en `shared`.',
          tags: ['arquitectura'],
          column: 'hecho',
          done: true,
          extra: priority('high'),
        },
        {
          title: 'Parser de captura rápida',
          text: 'Prefijos de fecha (`hoy`, `mañana`) y alias de lista.',
          tags: ['api', 'captura'],
          column: 'hecho',
          done: true,
          extra: priority('high'),
        },
        {
          title: 'Esqueleto de Angular y pantallas',
          text: 'Rutas, cabecera y pestañas de cada sección.',
          tags: ['web'],
          column: 'enRevision',
          extra: priority('high'),
        },
        {
          title: 'Tablero con columnas y estados',
          text: 'Iconos de estado y colores propios por columna.',
          tags: ['web', 'listas'],
          column: 'enRevision',
          extra: priority('medium'),
        },
        {
          title: 'Seeder de datos de demostración',
          tags: ['api'],
          column: 'enCurso',
          extra: priority('medium'),
        },
        {
          title: 'Autenticación y sesión persistente',
          text: 'Cookie de sesión, expiración deslizante y cierre en todos los equipos.',
          tags: ['api', 'seguridad'],
          column: 'enCurso',
          extra: priority('urgent'),
        },
        {
          title: 'Importación del CSV del banco',
          tags: ['gastos'],
          column: 'porHacer',
          extra: priority('high'),
        },
        {
          title: 'Gráficos de gastos por mes y categoría',
          tags: ['gastos', 'web'],
          column: 'porHacer',
          extra: priority('medium'),
        },
        {
          title: 'Vista de calendario',
          tags: ['web'],
          column: 'porHacer',
          extra: priority('medium'),
        },
        {
          title: 'Passkeys (WebAuthn)',
          tags: ['seguridad'],
          column: 'backlog',
          extra: priority('low'),
        },
        {
          title: 'Tokens de diseño y tema',
          tags: ['web'],
          column: 'backlog',
          extra: priority('low'),
        },
        { title: 'Exportar los datos a CSV', tags: ['api'], column: 'backlog' },
      ],
      now,
    ),
    ...toItems(
      ideas,
      [
        { title: 'App de recetas con lista de la compra automática', tags: ['side-project'] },
        {
          title: 'Modo demo del portfolio con datos de ejemplo',
          text: 'Una build estática con un adaptador de API en memoria.',
          tags: ['portfolio'],
        },
        { title: 'Resumen semanal por correo', tags: ['gestión'] },
        { title: 'Escanear tickets y extraer el importe', tags: ['gastos'] },
        { title: 'Atajos de teclado para todo', tags: ['ux'] },
      ],
      now,
    ),
  ];

  // Notes: one group with three cards (one done 3 h ago) and several loose cards on the canvas.
  // One more was marked done 30 h ago: it no longer shows on the canvas but appears in the done list.
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
  const group: NoteGroupDoc = {
    _id: new ObjectId(),
    title: 'Reforma del baño',
    x: 40,
    y: 40,
    w: 420,
    h: 300,
    createdAt: now,
    updatedAt: now,
  };
  let z = 0;
  const card = (
    text: string,
    x: number,
    y: number,
    extra: { groupId?: ObjectId; doneAt?: Date } = {},
  ): NoteCardDoc => ({
    _id: new ObjectId(),
    text,
    x,
    y,
    w: 280,
    z: z++,
    groupId: extra.groupId ?? null,
    doneAt: extra.doneAt ?? null,
    createdAt: now,
    updatedAt: now,
  });
  /** The calendar's own events: they live in their own collection, and the lists screen shows them as «Eventos». */
  const event = (title: string, date: DateOnly, time?: string): EventDoc => ({
    _id: new ObjectId(),
    title,
    date,
    ...(time !== undefined && { time }),
    createdAt: now,
    updatedAt: now,
  });
  const events: EventDoc[] = [
    event('Llamar al dentista', today),
    event('Preparar la presentación', addDays(today, 1), '10:00'),
    event('Renovar el seguro del coche', addDays(today, 2)),
    event('Cumpleaños de Ana', addDays(today, 4)),
    event('Revisión del coche', addDays(today, 9), '09:30'),
    event('Declaración trimestral', addDays(today, 21)),
  ];

  const noteCards: NoteCardDoc[] = [
    card('Pedir presupuesto del alicatado', 16, 56, { groupId: group._id }),
    card('Elegir grifería', 16, 130, { groupId: group._id }),
    card('Desmontar el mueble del lavabo', 16, 204, { groupId: group._id, doneAt: hoursAgo(3) }),
    card('Llamar al fontanero. Preguntar por el desagüe nuevo.', 500, 40),
    card('Idea para el salón: mover la estantería a la pared este. Medir antes: 2,10 m.', 800, 40),
    card('Reunión con el equipo. Quedan por cerrar los plazos de la entrega.', 500, 170),
    card('Idea: **resumen semanal** de gastos por correo.', 800, 170),
    card('Cena con Ana. Recomendó *Perfect Days*.', 500, 300),
    card('Llamar al dentista', 800, 300, { doneAt: hoursAgo(22) }),
    card('Renovar el carné de la biblioteca', 40, 380, { doneAt: hoursAgo(30) }),
  ];

  const lists = [films, series, shopping, tasks, board, ideas];

  return {
    lists,
    items,
    history: buildHistory(lists, items),
    events,
    noteGroups: [group],
    noteCards,
  };
}

/**
 * The internal log of changes (`item_history`) that the API writes as items are used: every item
 * was created; a card of a board went through the columns up to the one it is in; a finished one
 * was ticked off. Entries come an hour apart, from when the item was created.
 */
export function buildHistory(
  lists: readonly ListDoc[],
  items: readonly ItemDoc[],
): ItemHistoryDoc[] {
  const hour = 3_600_000;
  const history: ItemHistoryDoc[] = [];
  for (const item of items) {
    const base = { itemId: item._id, listId: item.listId };
    history.push({ ...base, at: item.createdAt, type: 'created', changes: {} });

    const columns = lists.find((list) => list._id.equals(item.listId))?.board?.columns ?? [];
    const target = columns.findIndex((column) => column.key === item.column);
    for (let step = 1; step <= target; step++) {
      history.push({
        ...base,
        at: new Date(item.createdAt.getTime() + step * hour),
        type: 'moved',
        changes: { column: { from: columns[step - 1]!.key, to: columns[step]!.key } },
      });
    }
    if (item.doneAt) {
      history.push({
        ...base,
        at: item.doneAt,
        type: 'updated',
        changes: { done: { from: null, to: true } },
      });
    }
  }
  return history;
}
