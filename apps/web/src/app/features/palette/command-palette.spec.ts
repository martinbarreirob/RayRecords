import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { AuthStore } from '../../core/auth/auth.store';
import { PaletteService } from '../../core/palette/palette.service';
import { CommandPalette } from './command-palette';

describe('CommandPalette (shell)', () => {
  let fixture: ComponentFixture<CommandPalette>;
  let router: Router;

  beforeEach(async () => {
    const api = {
      lists: () => of([]),
      noteBoard: () => of({ cards: [], groups: [] }),
      items: () => of([]),
      transactions: () => of({ items: [], total: 0 }),
    };
    await TestBed.configureTestingModule({
      imports: [CommandPalette],
      providers: [provideRouter([]), { provide: ApiClient, useValue: api }],
    }).compileComponents();

    TestBed.inject(AuthStore).user.set({ id: 'u'.repeat(24), username: 'martin' });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(CommandPalette);
    await fixture.whenStable();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  const press = (key: string, init: KeyboardEventInit = {}, target: EventTarget = document) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));

  it('cerrada no monta el cuerpo de la paleta', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('app-palette-dialog')).toBeNull();
  });

  it('al abrirla monta el cuerpo (se descarga en diferido)', async () => {
    TestBed.inject(PaletteService).show();
    await fixture.whenStable();

    expect(
      (fixture.nativeElement as HTMLElement).querySelector('app-palette-dialog'),
    ).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="dialog"]')).not.toBeNull();
  });

  const SECTIONS: Record<string, string> = {
    N: '/notas',
    L: '/listas',
    C: '/calendario',
    G: '/gastos',
  };

  const add = (html: string): HTMLElement => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html;
    document.body.append(wrapper);
    return wrapper.firstElementChild as HTMLElement;
  };

  const shift = { shiftKey: true };

  it('Mayús+N, L, C y G navegan a su sección desde cualquier pantalla', () => {
    for (const [key, url] of Object.entries(SECTIONS)) {
      press(key, shift);
      expect(router.navigateByUrl).toHaveBeenLastCalledWith(url);
    }
    expect(router.navigateByUrl).toHaveBeenCalledTimes(4);
  });

  it('ya no hay secuencia «G» + letra', () => {
    for (const key of ['g', 'n', 'g', 'l', 'g', 'c', 'g', 'g', 'g', 'u']) press(key);

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('sin Mayús, o con Ctrl, Alt o Meta, no se activan', () => {
    press('n');
    press('N', { shiftKey: true, ctrlKey: true });
    press('N', { shiftKey: true, altKey: true });
    press('N', { shiftKey: true, metaKey: true });

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('con el cursor en un campo, un área de texto o un contenido editable no se activan', () => {
    for (const html of [
      '<input />',
      '<textarea></textarea>',
      '<div contenteditable="true"></div>',
      '<select><option>a</option></select>',
    ]) {
      const target = add(html);
      press('N', shift, target);
    }

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('con un selector o un calendario de PrimeNG enfocado o abierto no se activan', () => {
    press('N', shift, add('<div class="p-select" role="combobox" tabindex="0"></div>'));
    press('N', shift, add('<div class="p-datepicker"><input /></div>').firstElementChild!);
    expect(router.navigateByUrl).not.toHaveBeenCalled();

    const overlay = add('<div class="p-select-overlay"></div>');
    press('N', shift);
    overlay.remove();
    const panel = add('<div class="p-datepicker-panel"></div>');
    press('N', shift);
    panel.remove();

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('con un modal abierto no se activan, y al cerrarlo vuelven', () => {
    const modal = add('<div role="dialog" aria-modal="true"></div>');
    press('N', shift);
    expect(router.navigateByUrl).not.toHaveBeenCalled();

    modal.remove();
    press('N', shift);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/notas');
  });

  it('con la paleta abierta no se disparan', async () => {
    TestBed.inject(PaletteService).show();
    await fixture.whenStable();

    press('N', shift);
    press('/');

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('«/» fuera de un campo abre la paleta ya en modo captura (también con Mayús, como en teclado español)', async () => {
    const event = new KeyboardEvent('keydown', { key: '/', shiftKey: true, cancelable: true });
    document.dispatchEvent(event);
    await fixture.whenStable();

    expect(event.defaultPrevented).toBe(true);
    expect(TestBed.inject(PaletteService).isOpen()).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.mode-chip')?.textContent,
    ).toContain('Nueva nota o tarea');
  });

  it('«/» no abre la paleta escribiendo en un campo, con Ctrl o con un modal abierto', () => {
    press('/', {}, add('<input />'));
    press('/', { ctrlKey: true });
    add('<div aria-modal="true"></div>');
    press('/');

    expect(TestBed.inject(PaletteService).isOpen()).toBe(false);
  });
});
