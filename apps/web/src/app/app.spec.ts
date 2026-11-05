import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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

  it('without a session shows no navigation', async () => {
    const el = await render(false);

    expect(el.querySelector('header')).toBeNull();
    expect(el.querySelector('app-capture-bar')).toBeNull();
  });
});
