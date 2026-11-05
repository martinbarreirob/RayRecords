import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { DateField } from './date-field';
import { TimeField } from './time-field';

@Component({
  imports: [DateField, TimeField],
  template: `
    <app-date-field inputId="d" [(value)]="date" />
    <app-time-field inputId="t" [(value)]="time" />
  `,
})
class Host {
  readonly date = signal('2026-11-04');
  readonly time = signal('');
}

function type(input: HTMLInputElement, text: string): void {
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('app-time-field (desktop)', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  let input: HTMLInputElement;

  const rerender = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    input = fixture.nativeElement.querySelector('#t') as HTMLInputElement;
  });

  it('a full time is saved as typed and normalized on blur', async () => {
    type(input, '0930');
    expect(host.time()).toBe('09:30');
    expect(input.value).toBe('0930');
    input.dispatchEvent(new Event('blur'));
    await rerender();
    expect(input.value).toBe('09:30');
  });

  it('three digits (930) are interpreted on blur', async () => {
    type(input, '930');
    expect(host.time()).toBe('');
    input.dispatchEvent(new Event('blur'));
    await rerender();
    expect(host.time()).toBe('09:30');
    expect(input.value).toBe('09:30');
  });

  it('a partial time is completed on blur', async () => {
    type(input, '9');
    expect(host.time()).toBe('');
    input.dispatchEvent(new Event('blur'));
    await rerender();
    expect(host.time()).toBe('09:00');
    expect(input.value).toBe('09:00');
  });

  it('an impossible time is flagged and, on blur, goes back to the last valid value', async () => {
    type(input, '08:15');
    type(input, '25:70');
    await rerender();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(host.time()).toBe('08:15');
    input.dispatchEvent(new Event('blur'));
    await rerender();
    expect(input.value).toBe('08:15');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('disallowed characters are rejected', () => {
    type(input, '1a2');
    expect(input.value).toBe('12');
  });

  it('arrows start at 09:00, add and subtract 15 minutes, and Shift one hour', async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(host.time()).toBe('09:00');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(host.time()).toBe('09:15');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(host.time()).toBe('08:45');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true }));
    expect(host.time()).toBe('09:45');
    await rerender();
    expect(input.value).toBe('09:45');
  });

  it('clearing the text leaves the time empty and an outside value is shown', async () => {
    type(input, '10:00');
    type(input, '');
    expect(host.time()).toBe('');
    host.time.set('17:30');
    await rerender();
    expect(input.value).toBe('17:30');
  });

  it('Enter saves what was typed before the form submits', () => {
    type(input, '7');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(host.time()).toBe('07:00');
  });
});

describe('app-date-field (desktop)', () => {
  it('shows the date as dd/mm/aaaa', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#d') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('04/11/2026');
  });

  it('a hand-typed date arrives as YYYY-MM-DD and clearing it leaves the value empty', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('#d') as HTMLInputElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '5' }));
    type(input, '05/12/2026');
    expect(fixture.componentInstance.date()).toBe('2026-12-05');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace' }));
    type(input, '');
    expect(fixture.componentInstance.date()).toBe('');
  });
});
