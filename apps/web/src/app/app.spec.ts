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

  it('con sesión muestra la marca y la navegación principal', async () => {
    const el = await render(true);

    expect(el.querySelector('.brand')?.textContent).toContain('RayRecords');
    const links = [...el.querySelectorAll('nav a')].map((a) => a.textContent?.trim());
    expect(links).toEqual(['Notas', 'Listas', 'Calendario', 'Gastos']);
  });

  it('con sesión incluye el botón de salir y no hay barra de captura', async () => {
    const el = await render(true);

    expect(el.querySelector('app-capture-bar')).toBeNull();
    expect(el.querySelector('header .logout')?.getAttribute('aria-label')).toContain('martin');
  });

  it('con sesión ofrece la paleta de comandos y el cambio de tema', async () => {
    const el = await render(true);

    expect(el.querySelector('header .palette-trigger')?.textContent).toContain('Ctrl K');
    expect(el.querySelector('header .theme-toggle')).not.toBeNull();
  });

  it('sin sesión no muestra navegación', async () => {
    const el = await render(false);

    expect(el.querySelector('header')).toBeNull();
    expect(el.querySelector('app-capture-bar')).toBeNull();
  });
});
