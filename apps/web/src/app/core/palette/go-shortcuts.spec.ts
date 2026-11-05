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

describe('goShortcutTarget (Mayús + letra)', () => {
  it('Mayús+N · L · C · G llevan a su sección', () => {
    expect(goShortcutTarget(press('N'))).toBe('/notas');
    expect(goShortcutTarget(press('L'))).toBe('/listas');
    expect(goShortcutTarget(press('C'))).toBe('/calendario');
    expect(goShortcutTarget(press('G'))).toBe('/gastos');
  });

  it('con Bloq Mayús y Mayús la tecla llega en minúscula y también vale', () => {
    expect(goShortcutTarget(press('n'))).toBe('/notas');
  });

  it('sin Mayús no hace nada (la «n» suelta es «nueva nota» en Notas)', () => {
    for (const key of ['n', 'l', 'c', 'g']) {
      expect(goShortcutTarget(press(key, { shiftKey: false }))).toBeNull();
    }
  });

  it('con Ctrl, Alt o Meta no se activa', () => {
    expect(goShortcutTarget(press('N', { ctrlKey: true }))).toBeNull();
    expect(goShortcutTarget(press('N', { altKey: true }))).toBeNull();
    expect(goShortcutTarget(press('N', { metaKey: true }))).toBeNull();
  });

  it('otras letras y teclas especiales no hacen nada', () => {
    expect(goShortcutTarget(press('X'))).toBeNull();
    expect(goShortcutTarget(press('Shift'))).toBeNull();
    expect(goShortcutTarget(press('ArrowLeft'))).toBeNull();
  });

  it('ya no existe la secuencia «G» + letra', () => {
    expect('stepGoSequence' in goShortcuts).toBe(false);
    expect('GO_SEQUENCE_MS' in goShortcuts).toBe(false);
    expect(goShortcutTarget(press('g', { shiftKey: false }))).toBeNull();
  });

  it('el atajo se enseña como «⇧N»', () => {
    expect(shortcutLabel('n')).toBe('⇧N');
    expect(shortcutLabel('g')).toBe('⇧G');
  });
});

describe('isTypingTarget y canUseGlobalShortcut', () => {
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

  it('campos, áreas de texto, selects y contenido editable cuentan como escribir', () => {
    expect(isTypingTarget(add('<input />'))).toBe(true);
    expect(isTypingTarget(add('<textarea></textarea>'))).toBe(true);
    expect(isTypingTarget(add('<select><option>a</option></select>'))).toBe(true);
    expect(isTypingTarget(add('<div contenteditable="true">hola</div>'))).toBe(true);
    expect(isTypingTarget(add('<div contenteditable="">hola</div>'))).toBe(true);
  });

  it('los selectores de PrimeNG y sus hijos cuentan como escribir', () => {
    const select = add('<div class="p-select"><span class="p-select-label">x</span></div>');
    expect(isTypingTarget(select)).toBe(true);
    expect(isTypingTarget(select.firstElementChild)).toBe(true);
    expect(isTypingTarget(add('<div role="combobox"></div>'))).toBe(true);
    expect(isTypingTarget(add('<div class="p-datepicker"><input /></div>'))).toBe(true);
    expect(isTypingTarget(add('<div class="p-multiselect"></div>'))).toBe(true);
    expect(isTypingTarget(add('<div role="textbox"></div>'))).toBe(true);
  });

  it('botones, enlaces y el cuerpo de la página no cuentan', () => {
    expect(isTypingTarget(add('<button>ok</button>'))).toBe(false);
    expect(isTypingTarget(add('<a href="/x">x</a>'))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(add('<div contenteditable="false"></div>'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it('se pueden usar con el foco en el cuerpo o en un botón', () => {
    expect(canUseGlobalShortcut(eventOn(document.body))).toBe(true);
    expect(canUseGlobalShortcut(eventOn(add('<button>ok</button>')))).toBe(true);
  });

  it('no con un campo enfocado', () => {
    expect(canUseGlobalShortcut(eventOn(add('<input />')))).toBe(false);
  });

  it('no con un modal abierto ni con un desplegable de PrimeNG abierto', () => {
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

  it('no si otro código ya atendió la tecla', () => {
    const event = new KeyboardEvent('keydown', { key: 'N', shiftKey: true, cancelable: true });
    event.preventDefault();
    expect(canUseGlobalShortcut(event)).toBe(false);
  });
});

describe('adjacentSection (Alt+← / Alt+→)', () => {
  it('avanza por el orden de la barra: notas, listas, calendario, gastos', () => {
    expect(adjacentSection('/notas', 1)).toBe('/listas');
    expect(adjacentSection('/listas', 1)).toBe('/calendario');
    expect(adjacentSection('/calendario', 1)).toBe('/gastos');
  });

  it('retrocede en el mismo orden', () => {
    expect(adjacentSection('/gastos', -1)).toBe('/calendario');
    expect(adjacentSection('/listas', -1)).toBe('/notas');
  });

  it('una lista concreta cuenta como la sección Listas', () => {
    expect(adjacentSection('/listas/compras', 1)).toBe('/calendario');
    expect(adjacentSection('/listas/compras?vista=kanban', -1)).toBe('/notas');
  });

  it('en los extremos no da la vuelta', () => {
    expect(adjacentSection('/notas', -1)).toBeNull();
    expect(adjacentSection('/gastos', 1)).toBeNull();
  });

  it('fuera de las secciones no hace nada', () => {
    expect(adjacentSection('/login', 1)).toBeNull();
    expect(adjacentSection('/', 1)).toBeNull();
  });
});
