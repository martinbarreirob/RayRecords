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

  it('show({ capture: true }) requests capture mode, once, and show() does not', () => {
    service.show({ capture: true });
    expect(service.takeCaptureRequest()).toBe(true);
    expect(service.takeCaptureRequest()).toBe(false);

    service.hide(false);
    service.show();
    expect(service.takeCaptureRequest()).toBe(false);
  });

  it('opens, closes and toggles', () => {
    service.show();
    expect(service.isOpen()).toBe(true);
    service.toggle();
    expect(service.isOpen()).toBe(false);
    service.toggle();
    expect(service.isOpen()).toBe(true);
  });

  it('on close gives focus back to whoever had it', () => {
    service.show();
    other.focus();

    service.hide();
    vi.runAllTimers();

    expect(document.activeElement).toBe(opener);
  });

  it('without restoring focus (when navigating) it leaves focus alone', () => {
    service.show();
    other.focus();

    service.hide(false);
    vi.runAllTimers();

    expect(document.activeElement).toBe(other);
  });

  it('reopening right away cancels the pending restore and keeps it for the next close', () => {
    service.show();
    service.hide();
    service.show();
    other.focus();
    vi.runAllTimers();
    expect(document.activeElement).toBe(other); // does not steal focus from the new palette

    service.hide();
    vi.runAllTimers();
    expect(document.activeElement).toBe(opener);
  });
});
