import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ApiClient } from './core/api/api-client';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), { provide: ApiClient, useValue: { lists: () => of([]) } }],
    }).compileComponents();
  });

  it('muestra la marca y la navegación principal', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.brand')?.textContent).toContain('RayRecords');
    const links = [...el.querySelectorAll('nav a')].map((a) => a.textContent?.trim());
    expect(links).toEqual(['Notas', 'Listas', 'Calendario', 'Gastos', 'Cuentas']);
  });

  it('incluye la captura rápida en el shell', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('app-capture-bar input')).not.toBeNull();
  });
});
