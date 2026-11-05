import { TestBed } from '@angular/core/testing';
import { PaletteService } from './palette.service';

describe('PaletteService', () => {
  let service: PaletteService;
  let opener: HTMLButtonElement;
  let other: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    service = TestBed.inject(PaletteService);
    opener = document.createElement('button');
    other = document.createElement('button');
    document.body.append(opener, other);
    opener.focus();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('«show({ capture: true })» pide el modo captura, una sola vez, y «show()» no', () => {
    service.show({ capture: true });
    expect(service.takeCaptureRequest()).toBe(true);
    expect(service.takeCaptureRequest()).toBe(false);

    service.hide(false);
    service.show();
    expect(service.takeCaptureRequest()).toBe(false);
  });

  it('abre, cierra y alterna', () => {
    service.show();
    expect(service.isOpen()).toBe(true);
    service.toggle();
    expect(service.isOpen()).toBe(false);
    service.toggle();
    expect(service.isOpen()).toBe(true);
  });

  it('al cerrar devuelve el foco a quien lo tenía', () => {
    service.show();
    other.focus();

    service.hide();
    vi.runAllTimers();

    expect(document.activeElement).toBe(opener);
  });

  it('sin devolver el foco (al navegar) no lo toca', () => {
    service.show();
    other.focus();

    service.hide(false);
    vi.runAllTimers();

    expect(document.activeElement).toBe(other);
  });

  it('reabrir enseguida cancela la devolución pendiente y la conserva para el cierre siguiente', () => {
    service.show();
    service.hide();
    service.show();
    other.focus();
    vi.runAllTimers();
    expect(document.activeElement).toBe(other); // no le roba el foco a la paleta nueva

    service.hide();
    vi.runAllTimers();
    expect(document.activeElement).toBe(opener);
  });
});
