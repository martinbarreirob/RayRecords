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

/** Texto que ya es una hora completa (`9:30`, `0930`, `17.05`…): se guarda sin esperar a salir del campo. */
const COMPLETE = /^(\d{1,2}[:.hH]\d{2}|\d{4})$/;

/**
 * Campo de hora. El valor es un texto `HH:mm` (vacío = `''`), el mismo que da un `<input type="time">`.
 *
 * - Táctil o sin cursor: el `<input type="time">` nativo.
 * - Escritorio: campo de texto con máscara suave. Acepta `930`, `9:30`, `09.30` o `17` y lo deja como
 *   `HH:mm`; ↑/↓ suman o restan 15 minutos (Mayús: 1 hora). Una hora imposible (`25:70`) se marca en
 *   rojo mientras se escribe y, al salir del campo, vuelve al último valor válido.
 *
 * Se usa con `[(value)]="señal"` o con `ngModel` / formularios reactivos.
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
  /** Hora como `HH:mm`; `''` si no hay. */
  readonly value = model('');
  readonly inputId = input<string>();
  readonly ariaLabel = input<string>();
  readonly required = input(false, { transform: booleanAttribute });

  protected readonly native = prefersNativePickers();
  protected readonly disabled = signal(false);
  /** Lo que se ve en el campo de escritorio (puede ir por delante del valor mientras se escribe). */
  protected readonly text = signal('');
  protected readonly invalid = signal(false);

  private onChange: (value: string) => void = () => undefined;
  private onTouchedFn: () => void = () => undefined;

  constructor() {
    // El valor de fuera (formulario, señal) manda sobre el texto, salvo si es el que acaba de escribirse.
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

  /** Teclea solo cifras y separadores; guarda en cuanto la hora está completa. */
  protected onInput(field: HTMLInputElement): void {
    const text = field.value.replace(/[^0-9:.hH]/g, '');
    // Si no cambia el texto (solo se tecleó algo no permitido) la plantilla no repinta: se limpia a mano.
    if (field.value !== text) field.value = text;
    this.text.set(text);
    const normalized = normalizeTime(text);
    this.invalid.set(normalized === null && (COMPLETE.test(text) || text.length >= 5));
    if (text === '') this.commit('');
    else if (COMPLETE.test(text) && normalized) this.commit(normalized);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      // El envío del formulario va después de este evento: se guarda lo escrito antes.
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

  /** Cierra la edición: hora normalizada si vale; si no, vuelve al último valor bueno. */
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
