import * as goShortcuts from './go-shortcuts';
import {
  adjacentSection,
  canUseGlobalShortcut,
  goShortcutTarget,
  isTypingTarget,
  shortcutLabel,
  type ShortcutKeyEvent,
} from './go-shortcuts';

const press = (key: string, init: Partial<ShortcutKeyEvent> = {}): ShortcutKeyEvent => ({
  key,
  shiftKey: true,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
  ...init,
});

describe('goShortcutTarget (Shift + letter)', () => {
  it('Shift+N, L, C, G go to their section', () => {
    expect(goShortcutTarget(press('N'))).toBe('/notas');
    expect(goShortcutTarget(press('L'))).toBe('/listas');
    expect(goShortcutTarget(press('C'))).toBe('/calendario');
    expect(goShortcutTarget(press('G'))).toBe('/gastos');
  });

  it('with Caps Lock plus Shift the key arrives lowercase and still works', () => {
    expect(goShortcutTarget(press('n'))).toBe('/notas');
  });

  it('without Shift it does nothing (a bare "n" is "new note" on Notas)', () => {
    for (const key of ['n', 'l', 'c', 'g']) {
      expect(goShortcutTarget(press(key, { shiftKey: false }))).toBeNull();
    }
  });

  it('does not fire with Ctrl, Alt or Meta', () => {
    expect(goShortcutTarget(press('N', { ctrlKey: true }))).toBeNull();
    expect(goShortcutTarget(press('N', { altKey: true }))).toBeNull();
    expect(goShortcutTarget(press('N', { metaKey: true }))).toBeNull();
  });

  it('other letters and special keys do nothing', () => {
    expect(goShortcutTarget(press('X'))).toBeNull();
    expect(goShortcutTarget(press('Shift'))).toBeNull();
    expect(goShortcutTarget(press('ArrowLeft'))).toBeNull();
  });

  it('the "G" + letter sequence no longer exists', () => {
    expect('stepGoSequence' in goShortcuts).toBe(false);
    expect('GO_SEQUENCE_MS' in goShortcuts).toBe(false);
    expect(goShortcutTarget(press('g', { shiftKey: false }))).toBeNull();
  });

  it('the shortcut is shown as "⇧N"', () => {
    expect(shortcutLabel('n')).toBe('⇧N');
    expect(shortcutLabel('g')).toBe('⇧G');
  });
});

describe('isTypingTarget and canUseGlobalShortcut', () => {
  afterEach(() => document.body.replaceChildren());

  const add = (html: string): HTMLElement => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.append(wrapper);
    return wrapper.firstElementChild as HTMLElement;
  };
  const eventOn = (target: EventTarget | null): Event => {
    const event = new KeyboardEvent('keydown', { key: 'N', shiftKey: true, bubbles: true });
    Object.defineProperty(event, 'target', { value: target });
    return event;
  };

  it('inputs, textareas, selects and editable content count as typing', () => {
    expect(isTypingTarget(add('<input />'))).toBe(true);
    expect(isTypingTarget(add('<textarea></textarea>'))).toBe(true);
    expect(isTypingTarget(add('<select><option>a</option></select>'))).toBe(true);
    expect(isTypingTarget(add('<div contenteditable="true">hola</div>'))).toBe(true);
    expect(isTypingTarget(add('<div contenteditable="">hola</div>'))).toBe(true);
  });

  it('PrimeNG selects and their children count as typing', () => {
    const select = add('<div class="p-select"><span class="p-select-label">x</span></div>');
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(select.firstElementChild)).toBe(true);
    expect(isTypingTarget(add('<div role="combobox"></div>'))).toBe(true);
    expect(isTypingTarget(add('<div class="p-datepicker"><input /></div>'))).toBe(true);
    expect(isTypingTarget(add('<div class="p-multiselect"></div>'))).toBe(true);
    expect(isTypingTarget(add('<div role="textbox"></div>'))).toBe(true);
  });

  it('buttons, links and the page body do not count', () => {
    expect(isTypingTarget(add('<button>ok</button>'))).toBe(false);
    expect(isTypingTarget(add('<a href="/x">x</a>'))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(add('<div contenteditable="false"></div>'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('can be used with focus on the body or a button', () => {
    expect(canUseGlobalShortcut(eventOn(document.body))).toBe(true);
    expect(canUseGlobalShortcut(eventOn(add('<button>ok</button>')))).toBe(true);
  });

  it('not with a focused field', () => {
    expect(canUseGlobalShortcut(eventOn(add('<input />')))).toBe(false);
  });

  it('not with an open modal or an open PrimeNG overlay', () => {
    const modal = add('<div role="dialog" aria-modal="true"></div>');
    expect(canUseGlobalShortcut(eventOn(document.body))).toBe(false);
    modal.remove();
    expect(canUseGlobalShortcut(eventOn(document.body))).toBe(true);

    for (const overlay of ['p-select-overlay', 'p-multiselect-overlay', 'p-datepicker-panel']) {
      const panel = add(`<div class="${overlay}"></div>`);
      expect(canUseGlobalShortcut(eventOn(document.body))).toBe(false);
      panel.remove();
    }
  });

  it('not if other code already handled the key', () => {
    const event = new KeyboardEvent('keydown', { key: 'N', shiftKey: true, cancelable: true });
    event.preventDefault();
    expect(canUseGlobalShortcut(event)).toBe(false);
  });
});

describe('adjacentSection (Alt+← / Alt+→)', () => {
  it('moves forward in navbar order: notes, lists, calendar, expenses', () => {
    expect(adjacentSection('/notas', 1)).toBe('/listas');
    expect(adjacentSection('/listas', 1)).toBe('/calendario');
    expect(adjacentSection('/calendario', 1)).toBe('/gastos');
  });

  it('moves back in the same order', () => {
    expect(adjacentSection('/gastos', -1)).toBe('/calendario');
    expect(adjacentSection('/listas', -1)).toBe('/notas');
  });

  it('a specific list counts as the Listas section', () => {
    expect(adjacentSection('/listas/compras', 1)).toBe('/calendario');
    expect(adjacentSection('/listas/compras?vista=kanban', -1)).toBe('/notas');
  });

  it('does not wrap at the ends', () => {
    expect(adjacentSection('/notas', -1)).toBeNull();
    expect(adjacentSection('/gastos', 1)).toBeNull();
  });

  it('outside the sections it does nothing', () => {
    expect(adjacentSection('/login', 1)).toBeNull();
    expect(adjacentSection('/', 1)).toBeNull();
  });
});
