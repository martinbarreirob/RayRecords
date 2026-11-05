import {
  LIST_PRESETS,
  addDays,
  slugify,
  type DateOnly,
  type Extra,
  type ListPreset,
} from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import type { ItemDoc, ListDoc, NoteCardDoc, NoteGroupDoc } from '../db/documents';

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

/** Listas, elementos y notas de ejemplo. Las fechas son relativas a hoy para que el calendario siempre tenga datos. */
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
  const board = makeList(LIST_PRESETS.board, 5000, now, { name: 'Portfolio web' });
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
        { title: 'Enviar la factura de octubre', dueDate: addDays(today, -2), tags: ['trabajo'] },
        { title: 'Llamar al dentista', dueDate: today },
        {
          title: 'Preparar la presentación',
          dueDate: addDays(today, 1),
          time: '10:00',
          tags: ['trabajo'],
        },
        { title: 'Renovar el seguro del coche', dueDate: addDays(today, 2), tags: ['casa'] },
        { title: 'Cumpleaños de Ana', dueDate: addDays(today, 4), tags: ['personal'] },
        {
          title: 'Comprar entradas del concierto',
          dueDate: addDays(today, 7),
          url: 'https://example.com/entradas',
        },
        { title: 'Revisión del coche', dueDate: addDays(today, 9), time: '09:30', tags: ['casa'] },
        { title: 'Declaración trimestral', dueDate: addDays(today, 21), tags: ['trabajo'] },
      ],
      now,
    ),
    ...toItems(
      board,
      [
        {
          title: 'Definir la arquitectura del monorepo',
          column: 'hecho',
          done: true,
          extra: { prioridad: 'alta' },
        },
        {
          title: 'Parser de captura rápida',
          column: 'hecho',
          done: true,
          extra: { prioridad: 'alta' },
        },
        {
          title: 'Esqueleto de Angular y pantallas',
          column: 'enCurso',
          extra: { prioridad: 'alta' },
        },
        {
          title: 'Seeder de datos de demostración',
          column: 'enCurso',
          extra: { prioridad: 'media' },
        },
        {
          title: 'Autenticación y sesión persistente',
          column: 'porHacer',
          extra: { prioridad: 'alta' },
        },
        {
          title: 'Importación del CSV del banco',
          column: 'porHacer',
          extra: { prioridad: 'alta' },
        },
        {
          title: 'Gráficos de gastos por mes y categoría',
          column: 'porHacer',
          extra: { prioridad: 'media' },
        },
        { title: 'Vista de calendario', column: 'porHacer', extra: { prioridad: 'media' } },
        { title: 'Passkeys (WebAuthn)', column: 'porHacer', extra: { prioridad: 'baja' } },
        { title: 'Tokens de diseño y tema', column: 'porHacer', extra: { prioridad: 'baja' } },
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

  // Notas: un grupo con tres tarjetas (una hecha hace 3 h) y varias sueltas en el lienzo. Una más
  // se marcó hecha hace 30 h: ya no se ve en el lienzo, pero aparece en «Terminadas».
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

  return {
    lists: [films, series, shopping, tasks, board, ideas],
    items,
    noteGroups: [group],
    noteCards,
  };
}
