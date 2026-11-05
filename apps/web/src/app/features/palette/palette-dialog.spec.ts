import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { CaptureResponse, List, NoteCard } from '@rayrecords/shared';
import { Observable, of, throwError } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth.store';
import { PaletteService } from '../../core/palette/palette.service';
import { RefreshBus } from '../../core/refresh';
import { PaletteDialog } from './palette-dialog';

const NOW = '2026-11-04T10:00:00.000Z';
const LIST: List = {
  id: 'a'.repeat(24),
  name: 'Reforma del baño',
  slug: 'reforma-del-bano',
  kind: 'free',
  fieldDefs: [],
  order: 0,
  archived: false,
  createdAt: NOW,
  updatedAt: NOW,
} as List;
const SHOPPING: List = {
  ...LIST,
  id: 's'.repeat(24),
  name: 'Compras',
  slug: 'compras',
  captureAlias: 'compra',
} as List;
const CARD: NoteCard = {
  id: 'c'.repeat(24),
  text: 'Llamar al fontanero del baño',
  x: 0,
  y: 0,
  w: 240,
  z: 0,
  groupId: null,
  doneAt: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('PaletteDialog', () => {
  let fixture: ComponentFixture<PaletteDialog>;
  let palette: PaletteService;
  let router: Router;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    const savedItem = {
      id: 'b'.repeat(24),
      listId: LIST.id,
      title: 'Dune',
      tags: [],
      extra: {},
      order: 0,
      source: 'quick' as const,
      createdAt: NOW,
      updatedAt: NOW,
    };
    api = {
      lists: vi.fn(() => of([LIST])),
      noteBoard: vi.fn(() => of({ cards: [CARD], groups: [] })),
      items: vi.fn(() => of([])),
      transactions: vi.fn(() => of({ items: [], total: 0 })),
      capture: vi.fn(() =>
        of({
          kind: 'item',
          item: savedItem,
          listName: 'Películas',
        } satisfies CaptureResponse),
      ),
      deleteItem: vi.fn(() => of(undefined)),
      deleteNoteCard: vi.fn(() => of(undefined)),
      createNoteCard: vi.fn(() => of(CARD)),
    };
    await TestBed.configureTestingModule({
      imports: [PaletteDialog],
      providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    }).compileComponents();

    TestBed.inject(AuthStore).user.set({ id: 'u'.repeat(24), username: 'martin' });
    palette = TestBed.inject(PaletteService);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(PaletteDialog);
    await fixture.whenStable();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  const el = () => fixture.nativeElement as HTMLElement;
  const input = () => el().querySelector<HTMLInputElement>('input')!;
  const labels = () =>
    [...el().querySelectorAll('.row .label')].map((node) => node.textContent?.trim());
  const active = () => el().querySelector('.row.active .label')?.textContent?.trim();
  const press = (key: string, init: KeyboardEventInit = {}) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));

  async function open() {
    palette.show();
    await fixture.whenStable();
  }

  async function type(text: string) {
    const field = input();
    field.value = text;
    field.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  it('cerrada no pinta nada', () => {
    expect(el().querySelector('.panel')).toBeNull();
  });

  it('abierta es un diálogo modal con el campo enfocado y los comandos', async () => {
    document.body.append(el());
    await open();

    const dialog = el().querySelector('[role="dialog"]');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(input());
    expect(el().querySelector('.group-title')?.textContent?.trim()).toBe('Comandos');
    expect(labels()[0]).toContain('Escribir una nota o tarea');
    expect(active()).toContain('Escribir una nota o tarea');
    expect(el().querySelector('.row.active .kbd.enter')).not.toBeNull();
    expect(input().placeholder).toBe('Buscar, ejecutar o escribir / para crear…');
    // La primera fila lleva el atajo «/» y cada «Ir a» el suyo con Mayús; ya no existe la secuencia G.
    const keysOf = (text: string) =>
      [
        ...[...el().querySelectorAll('.row')]
          .find((row) => row.textContent?.includes(text))!
          .querySelectorAll('.kbd:not(.enter)'),
      ].map((kbd) => kbd.textContent?.trim());
    expect(keysOf('Escribir una nota o tarea')).toEqual(['/']);
    expect(keysOf('Ir a Calendario')).toEqual(['⇧C']);
    expect(keysOf('Ir a Gastos')).toEqual(['⇧G']);
    expect(el().querySelector('.foot')?.textContent).toContain('⇧N · ⇧L · ⇧C · ⇧G');
    expect(el().querySelector('.foot')?.textContent).not.toContain('G N');
  });

  it('al escribir busca en listas y notas, agrupado por tipo', async () => {
    await open();
    await type('baño');

    const titles = [...el().querySelectorAll('.group-title')].map((t) => t.textContent?.trim());
    expect(titles).toEqual(['Listas', 'Notas']);
    expect(labels()[0]).toContain('Reforma del baño');
    expect(labels()[1]).toContain('Llamar al fontanero del baño');
  });

  it('con retardo busca tarjetas y gastos en el servidor', async () => {
    api['items']!.mockReturnValue(
      of([
        {
          id: 'b'.repeat(24),
          listId: LIST.id,
          title: 'Comprar plato de ducha',
          tags: [],
          extra: {},
          order: 0,
          source: 'manual',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]),
    );
    api['transactions']!.mockReturnValue(
      of({
        total: 1,
        items: [
          {
            id: 'd'.repeat(24),
            accountId: 'a'.repeat(24),
            date: '2026-11-02',
            month: '2026-11',
            amountCents: -2490,
            description: 'Cortina de ducha',
            category: null,
            categorySource: 'none',
          },
        ],
      }),
    );
    await open();
    await type('ducha');
    expect(api['items']).not.toHaveBeenCalled(); // aún dentro del retardo

    await wait(300);
    await fixture.whenStable();

    expect(api['items']).toHaveBeenCalledWith(LIST.id, { q: 'ducha' });
    expect(api['transactions']).toHaveBeenCalledWith({ q: 'ducha', limit: 8 });
    const titles = [...el().querySelectorAll('.group-title')].map((t) => t.textContent?.trim());
    expect(titles).toEqual(['Tarjetas', 'Gastos']);
  });

  it('↑↓ mueven la selección dando la vuelta y Tab cambia el filtro', async () => {
    await open();
    const total = labels().length;

    press('ArrowDown');
    await fixture.whenStable();
    expect(active()).toBe(labels()[1]);

    press('ArrowUp');
    press('ArrowUp');
    await fixture.whenStable();
    expect(active()).toBe(labels()[total - 1]);

    press('Tab');
    await fixture.whenStable();
    const pressed = () =>
      el().querySelector('.filters .chip[aria-pressed="true"]')?.textContent?.trim();
    expect(pressed()).toBe('Listas');
    press('Tab', { shiftKey: true });
    press('Tab', { shiftKey: true });
    await fixture.whenStable();
    expect(pressed()).toBe('Comandos');
  });

  it('Enter ejecuta la fila activa: «Ir a Notas» navega y cierra', async () => {
    await open();
    await type('notas');
    const row = [...el().querySelectorAll('.row')].find((r) =>
      r.textContent?.includes('Ir a Notas'),
    );
    expect(row).toBeDefined();

    // Con «notas» la nota coincidente va primero; bajamos hasta el comando.
    while (!active()?.includes('Ir a Notas')) {
      press('ArrowDown');
      await fixture.whenStable();
    }
    press('Enter');
    await fixture.whenStable();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/notas');
    expect(palette.isOpen()).toBe(false);
  });

  it('«ir a notas» y «notas» encuentran «Ir a Notas»; «gn» ya no es un atajo', async () => {
    await open();
    await type('ir a notas');
    expect(labels()[0]).toContain('Ir a Notas');

    await type('notas');
    expect(labels().some((label) => label?.includes('Ir a Notas'))).toBe(true);

    await type('gn');
    expect(labels().some((label) => label?.includes('Ir a Notas'))).toBe(false);
  });

  it('«Nueva tarjeta vacía» crea una tarjeta en blanco, avisa al resto de pantallas y va a /notas', async () => {
    const bus = TestBed.inject(RefreshBus);
    const before = bus.version();
    await open();

    press('ArrowDown');
    await fixture.whenStable();
    expect(active()).toContain('Nueva tarjeta vacía');
    press('Enter');
    await fixture.whenStable();

    expect(api['createNoteCard']).toHaveBeenCalledWith({ text: '' });
    expect(bus.version()).toBe(before + 1);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/notas');
    expect(palette.newNoteId()).toBe(CARD.id);
    expect(palette.isOpen()).toBe(false);
  });

  it('Escape cierra y el foco vuelve a quien lo tenía', async () => {
    const opener = document.createElement('button');
    document.body.append(opener, el());
    opener.focus();
    await open();
    expect(document.activeElement).toBe(input());

    press('Escape');
    await fixture.whenStable();
    await wait(10);

    expect(palette.isOpen()).toBe(false);
    expect(el().querySelector('.panel')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('un clic fuera de la capa cierra; dentro no', async () => {
    await open();
    el()
      .querySelector('.panel')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await fixture.whenStable();
    expect(palette.isOpen()).toBe(true);

    el()
      .querySelector('.backdrop')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await fixture.whenStable();
    expect(palette.isOpen()).toBe(false);
  });

  it('lo que no encaja con nada se ofrece como captura: Enter la guarda y sigue en modo captura con confirmación', async () => {
    const bus = TestBed.inject(RefreshBus);
    const before = bus.version();
    await open();
    await type('peli: Dune');
    await wait(300);
    await fixture.whenStable();

    expect(labels()).toEqual([expect.stringContaining('Capturar: peli: Dune')]);

    press('Enter');
    await fixture.whenStable();

    expect(api['capture']).toHaveBeenCalledWith('peli: Dune');
    expect(bus.version()).toBe(before + 1);
    expect(el().querySelector('.mode-chip')).not.toBeNull();
    expect(input().value).toBe('');
    expect(el().querySelector('.done')?.textContent).toContain('Añadido a Películas');

    [...el().querySelectorAll<HTMLButtonElement>('.done .link')]
      .find((button) => button.textContent?.includes('Deshacer'))!
      .click();
    await fixture.whenStable();
    expect(api['deleteItem']).toHaveBeenCalledWith('b'.repeat(24));
    expect(el().querySelector('.done')?.textContent).toContain('Captura deshecha');
  });

  describe('modo «escribir una nota o tarea»', () => {
    const chip = () => el().querySelector('.mode-chip');
    const plan = () => el().querySelector('.plan');
    const typeCapture = async (text: string) => {
      await type('/');
      await type(text);
    };
    const link = (name: string) =>
      [...el().querySelectorAll<HTMLButtonElement>('.done .link')].find((button) =>
        button.textContent?.includes(name),
      )!;

    beforeEach(() => {
      api['lists']!.mockReturnValue(of([LIST, SHOPPING]));
    });

    it('«/» como primer carácter entra en el modo, con la «/» consumida y la etiqueta visible', async () => {
      await open();
      expect(chip()).toBeNull();

      await type('/');

      expect(chip()?.textContent).toContain('Nueva nota o tarea');
      expect(input().value).toBe('');
      expect(input().placeholder).toBe('compra: leche semidesnatada');
      expect(input().getAttribute('aria-label')).toBe('Texto de la nota o tarea');
      expect(el().querySelector('.filters')).toBeNull();
      expect(el().querySelector('app-palette-capture .help')).not.toBeNull();
    });

    it('pegar «/texto» entra en el modo con el texto sin la «/»', async () => {
      await open();
      await type('/compra: pan');

      expect(chip()).not.toBeNull();
      expect(input().value).toBe('compra: pan');
    });

    it('una «/» que no es la primera es un carácter normal de la búsqueda', async () => {
      await open();
      await type('a/b');

      expect(chip()).toBeNull();
      expect(input().value).toBe('a/b');
    });

    it('la fila «Escribir una nota o tarea» (Enter o un toque) entra en el modo', async () => {
      await open();
      press('Enter');
      await fixture.whenStable();
      expect(chip()).not.toBeNull();

      press('Backspace');
      await fixture.whenStable();
      expect(chip()).toBeNull();

      el().querySelector<HTMLElement>('.row')!.click();
      await fixture.whenStable();
      expect(chip()).not.toBeNull();
    });

    it('abierta con «/» desde fuera (show con capture) ya está en el modo', async () => {
      palette.show({ capture: true });
      await fixture.whenStable();

      expect(chip()).not.toBeNull();

      // La petición vale solo para esa apertura.
      palette.hide(false);
      await fixture.whenStable();
      palette.show();
      await fixture.whenStable();
      expect(chip()).toBeNull();
    });

    it('construye en vivo adónde irá: lista destino resaltada, título y avisos', async () => {
      await open();
      await typeCapture('compra: leche semidesnatada');

      expect(plan()?.querySelector('.destination')?.textContent).toContain('Compras');
      expect(plan()?.querySelector('.destination')?.classList.contains('accent')).toBe(true);
      expect(plan()?.querySelector('.title')?.textContent).toContain('leche semidesnatada');

      await type('compra: Cafetera #hogar 89€');
      expect(
        [...el().querySelectorAll('.extras .chip')].map((chip) => chip.textContent?.trim()),
      ).toEqual(['#hogar', expect.stringContaining('89,00')]);

      await type('una idea suelta');
      expect(plan()?.querySelector('.destination')?.textContent).toContain(
        'Nota suelta en el lienzo',
      );
      expect(plan()?.querySelector('.notice')).toBeNull();

      await type('idea: probar el tema oscuro');
      expect(plan()?.querySelector('.notice')?.textContent).toContain('No hay ninguna lista');

      await type('compra:');
      expect(plan()?.classList.contains('incomplete')).toBe(true);
      expect(el().querySelector<HTMLButtonElement>('.send .btn')!.disabled).toBe(true);
    });

    it('no busca en el servidor mientras se escribe una nota', async () => {
      await open();
      await typeCapture('compra: leche');
      await wait(300);

      expect(api['items']).not.toHaveBeenCalled();
      expect(api['transactions']).not.toHaveBeenCalled();
    });

    it('sugiere el prefijo («com» → compra:) y Tab lo completa', async () => {
      await open();
      await typeCapture('com');

      const suggestion = el().querySelector('.suggestion');
      expect(suggestion?.textContent).toContain('compra:');
      expect(suggestion?.textContent).toContain('Tab');

      press('Tab');
      await fixture.whenStable();
      expect(input().value).toBe('compra: ');
      expect(el().querySelector('.suggestion')).toBeNull();
    });

    it('un toque en un prefijo de la ayuda lo escribe', async () => {
      await open();
      await typeCapture('');
      el().querySelector<HTMLButtonElement>('.prefix')!.click();
      await fixture.whenStable();
      expect(input().value).toBe('compra: ');
    });

    it('Enter guarda con estado de carga, confirma «Añadido a…» con «Ver» y deja el campo vacío', async () => {
      let finish!: (response: CaptureResponse) => void;
      api['capture']!.mockReturnValue(
        new Observable<CaptureResponse>((subscriber) => {
          finish = (response) => {
            subscriber.next(response);
            subscriber.complete();
          };
        }),
      );
      const bus = TestBed.inject(RefreshBus);
      const before = bus.version();
      await open();
      await typeCapture('compra: leche semidesnatada');

      press('Enter');
      await fixture.whenStable();
      expect(api['capture']).toHaveBeenCalledWith('compra: leche semidesnatada');
      expect(input().readOnly).toBe(true);
      expect(el().querySelector<HTMLButtonElement>('.send .btn')!.textContent).toContain(
        'Guardando',
      );
      // Una segunda pulsación mientras guarda no duplica.
      press('Enter');
      expect(api['capture']).toHaveBeenCalledTimes(1);

      finish({
        kind: 'item',
        listName: 'Compras',
        item: {
          id: 'i'.repeat(24),
          listId: SHOPPING.id,
          title: 'leche semidesnatada',
          tags: [],
          extra: {},
          order: 0,
          source: 'quick',
          createdAt: NOW,
          updatedAt: NOW,
        },
      });
      await fixture.whenStable();

      expect(bus.version()).toBe(before + 1);
      expect(input().readOnly).toBe(false);
      expect(input().value).toBe('');
      expect(chip()).not.toBeNull();
      expect(el().querySelector('.done')?.textContent).toContain('Añadido a Compras');

      link('Ver').click();
      await fixture.whenStable();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/listas/compras');
      expect(palette.isOpen()).toBe(false);
    });

    it('una nota sin prefijo se confirma como nota suelta y «Ver» lleva al lienzo', async () => {
      api['capture']!.mockReturnValue(
        of({ kind: 'note_card', card: CARD } satisfies CaptureResponse),
      );
      await open();
      await typeCapture('una idea suelta');
      press('Enter');
      await fixture.whenStable();

      expect(el().querySelector('.done')?.textContent).toContain('nota suelta');
      link('Ver').click();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/notas');
    });

    it('con error enseña un mensaje accionable y conserva el texto para reintentar', async () => {
      api['capture']!.mockReturnValueOnce(throwError(() => new Error('caído')));
      await open();
      await typeCapture('compra: leche');

      press('Enter');
      await fixture.whenStable();

      expect(el().querySelector('.error')?.textContent).toContain('No se pudo guardar');
      expect(el().querySelector('.error')?.textContent).toContain('pulsa Enter para reintentar');
      expect(input().value).toBe('compra: leche');
      expect(input().readOnly).toBe(false);

      press('Enter');
      await fixture.whenStable();
      expect(api['capture']).toHaveBeenCalledTimes(2);
      expect(el().querySelector('.error')).toBeNull();
      expect(el().querySelector('.done')).not.toBeNull();
    });

    it('Enter sin título avisa y no llama a la API', async () => {
      await open();
      await typeCapture('compra:');
      press('Enter');
      await fixture.whenStable();

      expect(api['capture']).not.toHaveBeenCalled();
      expect(el().querySelector('.error')?.textContent).toContain('Falta el título');
    });

    it('Esc vacía el texto; sin texto vuelve a la búsqueda; en la búsqueda cierra', async () => {
      await open();
      await typeCapture('compra: leche');

      press('Escape');
      await fixture.whenStable();
      expect(input().value).toBe('');
      expect(chip()).not.toBeNull();
      expect(palette.isOpen()).toBe(true);

      press('Escape');
      await fixture.whenStable();
      expect(chip()).toBeNull();
      expect(palette.isOpen()).toBe(true);

      press('Escape');
      await fixture.whenStable();
      expect(palette.isOpen()).toBe(false);
    });

    it('tras guardar, Esc con el campo vacío cierra la paleta', async () => {
      await open();
      await typeCapture('compra: leche');
      press('Enter');
      await fixture.whenStable();
      expect(el().querySelector('.done')).not.toBeNull();

      press('Escape');
      await fixture.whenStable();
      expect(palette.isOpen()).toBe(false);
    });

    it('Retroceso con el campo vacío sale del modo, pero no con texto ni al mantenerlo pulsado', async () => {
      await open();
      await typeCapture('a');

      press('Backspace');
      await fixture.whenStable();
      expect(chip()).not.toBeNull();

      await type('');
      press('Backspace', { repeat: true });
      await fixture.whenStable();
      expect(chip()).not.toBeNull();

      press('Backspace');
      await fixture.whenStable();
      expect(chip()).toBeNull();
      expect(input().placeholder).toBe('Buscar, ejecutar o escribir / para crear…');
    });

    it('el botón de la etiqueta sale del modo con un toque', async () => {
      await open();
      await type('/');
      el().querySelector<HTMLButtonElement>('.mode-exit')!.click();
      await fixture.whenStable();

      expect(chip()).toBeNull();
    });

    it('Ctrl+Enter desde la búsqueda guarda y pasa al modo captura', async () => {
      await open();
      await type('compra: pan');
      press('Enter', { ctrlKey: true });
      await fixture.whenStable();

      expect(api['capture']).toHaveBeenCalledWith('compra: pan');
      expect(chip()).not.toBeNull();
      expect(el().querySelector('.done')).not.toBeNull();
    });
  });
});
