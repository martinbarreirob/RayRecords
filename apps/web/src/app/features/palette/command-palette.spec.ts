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

  it('closed it does not mount the palette body', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('app-palette-dialog')).toBeNull();
  });

  it('opening it mounts the body (lazy-loaded)', async () => {
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

  it('Shift+N, L, C and G navigate to their section from any screen', () => {
    for (const [key, url] of Object.entries(SECTIONS)) {
      press(key, shift);
      expect(router.navigateByUrl).toHaveBeenLastCalledWith(url);
    }
    expect(router.navigateByUrl).toHaveBeenCalledTimes(4);
  });

  it('the "G" + letter sequence is gone', () => {
    for (const key of ['g', 'n', 'g', 'l', 'g', 'c', 'g', 'g', 'g', 'u']) press(key);

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('without Shift, or with Ctrl, Alt or Meta, they do not fire', () => {
    press('n');
    press('N', { shiftKey: true, ctrlKey: true });
    press('N', { shiftKey: true, altKey: true });
    press('N', { shiftKey: true, metaKey: true });

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('with the cursor in an input, textarea or editable content they do not fire', () => {
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

  it('with a PrimeNG select or calendar focused or open they do not fire', () => {
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

  it('with a modal open they do not fire, and they work again once it closes', () => {
    const modal = add('<div role="dialog" aria-modal="true"></div>');
    press('N', shift);
    expect(router.navigateByUrl).not.toHaveBeenCalled();

    modal.remove();
    press('N', shift);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/notas');
  });

  it('with the palette open they do not fire', async () => {
    TestBed.inject(PaletteService).show();
    await fixture.whenStable();

    press('N', shift);
    press('/');

    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });

  it('"/" outside a field opens the palette already in capture mode (also with Shift, as on a Spanish keyboard)', async () => {
    const event = new KeyboardEvent('keydown', { key: '/', shiftKey: true, cancelable: true });
    document.dispatchEvent(event);
    await fixture.whenStable();

    expect(event.defaultPrevented).toBe(true);
    expect(TestBed.inject(PaletteService).isOpen()).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.mode-chip')?.textContent,
    ).toContain('Nueva nota o tarea');
  });

  it('"/" does not open the palette while typing in a field, with Ctrl or with a modal open', () => {
    press('/', {}, add('<input />'));
    press('/', { ctrlKey: true });
    add('<div aria-modal="true"></div>');
    press('/');

    expect(TestBed.inject(PaletteService).isOpen()).toBe(false);
  });
});
