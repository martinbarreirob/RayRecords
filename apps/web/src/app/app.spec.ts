import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import type { UpdateUser } from '@rayrecords/shared';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ApiClient } from './core/api/api-client';
import { AuthStore } from './core/auth/auth.store';
import { App } from './app';

describe('App', () => {
  /** Saving the theme answers with the user as the server would return it. */
  const updateMe = vi.fn((input: UpdateUser) =>
    of({ id: 'a'.repeat(24), username: 'martin', ...input }),
  );

  beforeEach(async () => {
    // The theme leaves a copy in the browser: each test starts without one.
    localStorage.clear();
    updateMe.mockClear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: ApiClient, useValue: { lists: () => of([]), updateMe } },
      ],
    }).compileComponents();
  });

  function render(loggedIn: boolean) {
    if (loggedIn)
      TestBed.inject(AuthStore).user.set({
        id: 'a'.repeat(24),
        username: 'martin',
        theme: 'system',
      });
    const fixture = TestBed.createComponent(App);
    return fixture.whenStable().then(() => fixture.nativeElement as HTMLElement);
  }

  it('with a session shows the brand and the main navigation', async () => {
    const el = await render(true);

    expect(el.querySelector('.brand')?.textContent).toContain('RayRecords');
    const links = [...el.querySelectorAll('nav a')].map((a) => a.textContent?.trim());
    expect(links).toEqual(['Notas', 'Listas', 'Calendario', 'Gastos']);
  });

  it('the first level offers the two areas and marks the personal one', async () => {
    const el = await render(true);
    const tabs = [...el.querySelectorAll('header .areas a')];

    expect(tabs.map((a) => a.textContent?.trim())).toEqual(['Personal', 'Gestión']);
    expect(tabs[0]?.getAttribute('aria-current')).toBe('true');
    expect(tabs[1]?.getAttribute('aria-current')).toBeNull();
  });

  it('inside management the second level lists the management sections', async () => {
    TestBed.inject(AuthStore).user.set({ id: 'a'.repeat(24), username: 'martin', theme: 'system' });
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: '**', children: [] }]);
    const fixture = TestBed.createComponent(App);
    await router.navigateByUrl('/gestion/stock');
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    const links = [...el.querySelectorAll('header nav a')].map((a) => a.textContent?.trim());
    expect(links).toEqual(['Dashboard', 'Stock', 'Ventas', 'Tickets']);
    const tabs = [...el.querySelectorAll('header .areas a')];
    expect(tabs[1]?.getAttribute('aria-current')).toBe('true');
  });

  it('switching area returns to the last section visited in it', async () => {
    TestBed.inject(AuthStore).user.set({ id: 'a'.repeat(24), username: 'martin', theme: 'system' });
    const router = TestBed.inject(Router);
    router.resetConfig([{ path: '**', children: [] }]);
    const fixture = TestBed.createComponent(App);
    const el = fixture.nativeElement as HTMLElement;
    const hrefs = () =>
      [...el.querySelectorAll('header .areas a')].map((a) => a.getAttribute('href'));

    await router.navigateByUrl('/gastos');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(hrefs()).toEqual(['/gastos', '/gestion/dashboard']);

    await router.navigateByUrl('/gestion/tickets');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(hrefs()).toEqual(['/gastos', '/gestion/tickets']);
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
    // Each choice is saved in the account.
    expect(updateMe.mock.calls.map(([input]) => input.theme)).toEqual(['dark', 'light']);
  });

  it('uses the theme saved in the account, whatever the system says', async () => {
    TestBed.inject(AuthStore).user.set({ id: 'a'.repeat(24), username: 'martin', theme: 'dark' });
    const el = await render(false);
    TestBed.flushEffects();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(updateMe).not.toHaveBeenCalled();
    // The browser keeps a copy so the next load paints it before the session is known.
    expect(localStorage.getItem('rayrecords.theme')).toBe('dark');

    // Going back to the system theme is only offered while a fixed one is in use.
    const system = el.querySelector<HTMLButtonElement>('header .theme-system')!;
    system.click();
    TestBed.flushEffects();
    expect(updateMe).toHaveBeenCalledWith({ theme: 'system' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('rayrecords.theme')).toBeNull();
  });

  it('does not offer the system theme while it is already the one in use', async () => {
    const el = await render(true);
    expect(el.querySelector('header .theme-system')).toBeNull();
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

  it('the user button opens and closes the menu with the theme toggle and logout', async () => {
    TestBed.inject(AuthStore).user.set({ id: 'a'.repeat(24), username: 'martin', theme: 'system' });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = el.querySelector<HTMLElement>('header .user-button')!;
    const actions = el.querySelector('header .actions')!;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl');

    expect(actions.classList.contains('open')).toBe(false);
    button.click();
    fixture.detectChanges();
    expect(actions.classList.contains('open')).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(actions.querySelector('.theme-toggle')).not.toBeNull();
    expect(actions.querySelector('.logout')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled(); // opening the menu must not leave the screen

    button.click();
    fixture.detectChanges();
    expect(actions.classList.contains('open')).toBe(false);

    button.click();
    fixture.detectChanges(); // the outside-click listener is attached while the menu is open
    document.body.click(); // a tap outside closes it
    fixture.detectChanges();
    expect(actions.classList.contains('open')).toBe(false);
  });

  it('without a session shows no navigation', async () => {
    const el = await render(false);

    expect(el.querySelector('header')).toBeNull();
    expect(el.querySelector('app-capture-bar')).toBeNull();
  });
});
