import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiClient } from './core/api/api-client';
import { AuthStore } from './core/auth/auth.store';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: ApiClient, useValue: { lists: () => of([]) } }],
    }).compileComponents();
  });

  function render(loggedIn: boolean) {
    if (loggedIn) TestBed.inject(AuthStore).user.set({ id: 'a'.repeat(24), username: 'martin' });
    const fixture = TestBed.createComponent(App);
    return fixture.whenStable().then(() => fixture.nativeElement as HTMLElement);
  }

  it('with a session shows the brand and the main navigation', async () => {
    const el = await render(true);

    expect(el.querySelector('.brand')?.textContent).toContain('RayRecords');
    const links = [...el.querySelectorAll('nav a')].map((a) => a.textContent?.trim());
    expect(links).toEqual(['Notas', 'Listas', 'Calendario', 'Gastos']);
  });

  it('with a session includes the logout button and no capture bar', async () => {
    const el = await render(true);

    expect(el.querySelector('app-capture-bar')).toBeNull();
    expect(el.querySelector('header .logout')?.getAttribute('aria-label')).toContain('martin');
  });

  it('with a session offers the command palette and the theme toggle', async () => {
    const el = await render(true);

    expect(el.querySelector('header .palette-trigger')?.textContent).toContain('Ctrl K');
    expect(el.querySelector('header .theme-toggle')).not.toBeNull();
  });

  it('the theme toggle flips between light and dark and starts from the system theme', async () => {
    const el = await render(true);
    const toggle = el.querySelector<HTMLButtonElement>('header .theme-toggle')!;

    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    toggle.click();
    TestBed.flushEffects();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    toggle.click();
    TestBed.flushEffects();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('rr-theme')).toBeNull();
  });

  it('starts from the system theme when it is dark', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('prefers-color-scheme: dark'),
      addEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      await render(true);
      TestBed.flushEffects();

      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    } finally {
      window.matchMedia = original;
    }
  });

  describe('on a phone', () => {
    const original = window.matchMedia;

    beforeEach(() => {
      window.matchMedia = ((query: string) => ({
        matches: query.includes('767px'),
        addEventListener: () => undefined,
      })) as unknown as typeof window.matchMedia;
    });

    afterEach(() => {
      window.matchMedia = original;
    });

    it('the brand opens and closes the menu with the theme toggle and logout', async () => {
      TestBed.inject(AuthStore).user.set({ id: 'a'.repeat(24), username: 'martin' });
      const fixture = TestBed.createComponent(App);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      const brand = el.querySelector<HTMLElement>('header .brand')!;
      const actions = el.querySelector('header .actions')!;

      const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

      expect(brand.tagName).toBe('BUTTON');
      expect(actions.classList.contains('open')).toBe(false);
      brand.click();
      fixture.detectChanges();
      expect(actions.classList.contains('open')).toBe(true);
      expect(brand.getAttribute('aria-expanded')).toBe('true');
      expect(navigate).not.toHaveBeenCalled(); // opening the menu must not leave the screen

      brand.click();
      fixture.detectChanges();
      expect(actions.classList.contains('open')).toBe(false);

      brand.click();
      fixture.detectChanges(); // the outside-click listener is attached while the menu is open
      document.body.click(); // a tap outside closes it
      fixture.detectChanges();
      expect(actions.classList.contains('open')).toBe(false);
    });
  });

  it('without a session shows no navigation', async () => {
    const el = await render(false);

    expect(el.querySelector('header')).toBeNull();
    expect(el.querySelector('app-capture-bar')).toBeNull();
  });
});
