import {
  Component,
  ViewEncapsulation,
  booleanAttribute,
  effect,
  forwardRef,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { normalizeTime, shiftTime } from './date-time-logic';
import { prefersNativePickers } from './native-pickers';

/** Text that is already a full time (`9:30`, `0930`, `17.05`...): saved without waiting for blur. */
const COMPLETE = /^(\d{1,2}[:.hH]\d{2}|\d{4})$/;

/**
 * Time field. The value is a `HH:mm` string (empty = `''`), the same one an `<input type="time">` gives.
 *
 * - Touch or no cursor: the native `<input type="time">`.
 * - Desktop: text field with a soft mask. Accepts `930`, `9:30`, `09.30` or `17` and leaves it as
 *   `HH:mm`; up/down add or subtract 15 minutes (Shift: 1 hour). An impossible time (`25:70`) is shown
 *   in red while typing and, on blur, goes back to the last valid value.
 *
 * Use it with `[(value)]="signal"` or with `ngModel` / reactive forms.
 */
@Component({
  selector: 'app-time-field',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rr-time-field' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TimeField), multi: true },
  ],
  styles: `
    .rr-time-field {
      display: block;
      min-width: 0;
    }

    .rr-time-field input {
      font-family: inherit;
      font-size: var(--text-base);
      font-variant-numeric: tabular-nums;
    }

    @media (width <= 767px), (pointer: coarse) {
      .rr-time-field input {
        min-height: var(--touch-target);
        font-size: max(16px, var(--text-base));
      }
    }

    .rr-time-field input[aria-invalid='true'] {
      border-color: var(--danger);
    }

    .rr-time-field input[aria-invalid='true']:focus-visible {
      box-shadow: 0 0 0 3px var(--danger-soft);
    }
  `,
  template: `
    @if (native) {
      <input
        class="input"
        type="time"
        [attr.id]="inputId() ?? null"
        [attr.aria-label]="ariaLabel() ?? null"
        [required]="required()"
        [disabled]="disabled()"
        [value]="value()"
        (input)="commit($any($event.target).value)"
        (blur)="onTouched()"
      />
    } @else {
      <input
        class="input"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        maxlength="5"
        placeholder="HH:mm"
        [attr.id]="inputId() ?? null"
        [attr.aria-label]="ariaLabel() ?? null"
        [attr.aria-invalid]="invalid() ? 'true' : null"
        [required]="required()"
        [disabled]="disabled()"
        [value]="text()"
        (input)="onInput($any($event.target))"
        (keydown)="onKeydown($event)"
        (blur)="onBlur()"
      />
    }
  `,
})
export class TimeField implements ControlValueAccessor {
  /** Time as `HH:mm`; `''` if none. */
  readonly value = model('');
  readonly inputId = input<string>();
  readonly ariaLabel = input<string>();
  readonly required = input(false, { transform: booleanAttribute });

  protected readonly native = prefersNativePickers();
  protected readonly disabled = signal(false);
  /** What the desktop field shows (can be ahead of the value while typing). */
  protected readonly text = signal('');
  protected readonly invalid = signal(false);

  private onChange: (value: string) => void = () => undefined;
  private onTouchedFn: () => void = () => undefined;

  constructor() {
    // The outside value (form, signal) wins over the text, unless it is the one just typed.
    effect(() => {
      const value = this.value();
      untracked(() => {
        if (normalizeTime(this.text()) !== value) this.text.set(value);
      });
    });
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected onTouched(): void {
    this.onTouchedFn();
  }

  protected commit(value: string): void {
    if (value === this.value()) return;
    this.value.set(value);
    this.onChange(value);
  }

  /** Accepts only digits and separators; saves as soon as the time is complete. */
  protected onInput(field: HTMLInputElement): void {
    const text = field.value.replace(/[^0-9:.hH]/g, '');
    // If the text does not change (a disallowed key was typed) the template does not repaint: clean it by hand.
    if (field.value !== text) field.value = text;
    this.text.set(text);
    const normalized = normalizeTime(text);
    this.invalid.set(normalized === null && (COMPLETE.test(text) || text.length >= 5));
    if (text === '') this.commit('');
    else if (COMPLETE.test(text) && normalized) this.commit(normalized);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      // Form submit runs after this event: what was typed is saved first.
      this.settle();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      const step = (event.shiftKey ? 60 : 15) * (event.key === 'ArrowUp' ? 1 : -1);
      const current = normalizeTime(this.text()) || this.value();
      const next = shiftTime(current, current ? step : 0);
      this.text.set(next);
      this.invalid.set(false);
      this.commit(next);
    }
  }

  protected onBlur(): void {
    this.settle();
    this.onTouchedFn();
  }

  /** Ends editing: normalized time if valid; otherwise goes back to the last good value. */
  private settle(): void {
    const normalized = normalizeTime(this.text());
    if (normalized === null) {
      this.text.set(this.value());
    } else {
      this.text.set(normalized);
      this.commit(normalized);
    }
    this.invalid.set(false);
  }
}
