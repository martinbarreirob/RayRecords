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

  it('closed it renders nothing', () => {
    expect(el().querySelector('.panel')).toBeNull();
  });

  it('open it is a modal dialog with the field focused and the commands', async () => {
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
    // The first row carries the "/" shortcut and each "Ir a" its own with Shift; the G sequence no longer exists.
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

  it('typing searches lists and notes, grouped by type', async () => {
    await open();
    await type('baño');

    const titles = [...el().querySelectorAll('.group-title')].map((t) => t.textContent?.trim());
    expect(titles).toEqual(['Listas', 'Notas']);
    expect(labels()[0]).toContain('Reforma del baño');
    expect(labels()[1]).toContain('Llamar al fontanero del baño');
  });

  it('after a delay it searches cards and expenses on the server', async () => {
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
    expect(api['items']).not.toHaveBeenCalled(); // still inside the delay

    await wait(300);
    await fixture.whenStable();

    expect(api['items']).toHaveBeenCalledWith(LIST.id, { q: 'ducha' });
    expect(api['transactions']).toHaveBeenCalledWith({ q: 'ducha', limit: 8 });
    const titles = [...el().querySelectorAll('.group-title')].map((t) => t.textContent?.trim());
    expect(titles).toEqual(['Tarjetas', 'Gastos']);
  });

  it('up/down move the selection wrapping around and Tab changes the filter', async () => {
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

  it('Enter runs the active row: "Ir a Notas" navigates and closes', async () => {
    await open();
    await type('notas');
    const row = [...el().querySelectorAll('.row')].find((r) =>
      r.textContent?.includes('Ir a Notas'),
    );
    expect(row).toBeDefined();

    // With "notas" the matching note comes first; move down to the command.
    while (!active()?.includes('Ir a Notas')) {
      press('ArrowDown');
      await fixture.whenStable();
    }
    press('Enter');
    await fixture.whenStable();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/notas');
    expect(palette.isOpen()).toBe(false);
  });

  it('"ir a notas" and "notas" find "Ir a Notas"; "gn" is no longer a shortcut', async () => {
    await open();
    await type('ir a notas');
    expect(labels()[0]).toContain('Ir a Notas');

    await type('notas');
    expect(labels().some((label) => label?.includes('Ir a Notas'))).toBe(true);

    await type('gn');
    expect(labels().some((label) => label?.includes('Ir a Notas'))).toBe(false);
  });

  it('"Nueva tarjeta vacía" creates a blank card, notifies the other screens and goes to /notas', async () => {
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

  it('Escape closes and focus goes back to whoever had it', async () => {
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

  it('a click outside the layer closes; inside it does not', async () => {
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

  it('what matches nothing is offered as a capture: Enter saves it and stays in capture mode with a confirmation', async () => {
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

  describe('"escribir una nota o tarea" mode', () => {
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

    it('"/" as the first character enters the mode, with the "/" consumed and the label visible', async () => {
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

    it('pasting "/text" enters the mode with the text minus the "/"', async () => {
      await open();
      await type('/compra: pan');

      expect(chip()).not.toBeNull();
      expect(input().value).toBe('compra: pan');
    });

    it('a "/" that is not first is a normal search character', async () => {
      await open();
      await type('a/b');

      expect(chip()).toBeNull();
      expect(input().value).toBe('a/b');
    });

    it('the "Escribir una nota o tarea" row (Enter or a tap) enters the mode', async () => {
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

    it('opened with "/" from outside (show with capture) it is already in the mode', async () => {
      palette.show({ capture: true });
      await fixture.whenStable();

      expect(chip()).not.toBeNull();

      // The request only applies to that opening.
      palette.hide(false);
      await fixture.whenStable();
      palette.show();
      await fixture.whenStable();
      expect(chip()).toBeNull();
    });

    it('builds the destination live: highlighted target list, title and warnings', async () => {
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

    it('does not search the server while a note is typed', async () => {
      await open();
      await typeCapture('compra: leche');
      await wait(300);

      expect(api['items']).not.toHaveBeenCalled();
      expect(api['transactions']).not.toHaveBeenCalled();
    });

    it('suggests the prefix ("com" gives compra:) and Tab completes it', async () => {
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

    it('a tap on a prefix in the help types it', async () => {
      await open();
      await typeCapture('');
      el().querySelector<HTMLButtonElement>('.prefix')!.click();
      await fixture.whenStable();
      expect(input().value).toBe('compra: ');
    });

    it('Enter saves with a loading state, confirms "Añadido a…" with "Ver" and leaves the field empty', async () => {
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
      // A second press while saving does not duplicate.
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

    it('a note without a prefix is confirmed as a loose note and "Ver" goes to the canvas', async () => {
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

    it('on error shows an actionable message and keeps the text to retry', async () => {
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

    it('Enter without a title warns and does not call the API', async () => {
      await open();
      await typeCapture('compra:');
      press('Enter');
      await fixture.whenStable();

      expect(api['capture']).not.toHaveBeenCalled();
      expect(el().querySelector('.error')?.textContent).toContain('Falta el título');
    });

    it('Esc clears the text; with no text goes back to search; in search it closes', async () => {
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

    it('after saving, Esc with an empty field closes the palette', async () => {
      await open();
      await typeCapture('compra: leche');
      press('Enter');
      await fixture.whenStable();
      expect(el().querySelector('.done')).not.toBeNull();

      press('Escape');
      await fixture.whenStable();
      expect(palette.isOpen()).toBe(false);
    });

    it('Backspace with an empty field leaves the mode, but not with text or when held down', async () => {
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

    it('the label button leaves the mode with a tap', async () => {
      await open();
      await type('/');
      el().querySelector<HTMLButtonElement>('.mode-exit')!.click();
      await fixture.whenStable();

      expect(chip()).toBeNull();
    });

    it('Ctrl+Enter from search saves and switches to capture mode', async () => {
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
