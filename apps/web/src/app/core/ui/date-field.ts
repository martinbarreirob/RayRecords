import {
  Component,
  ViewEncapsulation,
  booleanAttribute,
  computed,
  forwardRef,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule, NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { PrimeNG } from 'primeng/config';
import { DatePicker, DatePickerModule } from 'primeng/datepicker';
import { useSpanishTexts } from '../../features/expenses/primeng-es';
import { parseIsoDate, toIsoDate } from './date-time-logic';
import { prefersNativePickers } from './native-pickers';

/**
 * Date field. The value is a `YYYY-MM-DD` string (empty = `''`), the same one an
 * `<input type="date">` gives, so it replaces that input without touching the rest of the code.
 *
 * - Touch or no cursor: the native `<input type="date">`.
 * - Desktop: `p-datepicker` (dropdown calendar in Spanish, week starting Monday, `dd/mm/aaaa`,
 *   "Hoy" button, panel appended to `body` so no dialog clips it). It opens on click on the
 *   field or with the down arrow; Esc closes it without also closing the enclosing dialog or form.
 *
 * Use it with `[(value)]="signal"` or with `ngModel` / reactive forms. The route that shows it must
 * declare `providePrimeNgTheme()`. The panel styles are in `date-field.scss`.
 */
@Component({
  selector: 'app-date-field',
  imports: [FormsModule, DatePickerModule],
  template: `
    @if (native) {
      <input
        class="input"
        type="date"
        [attr.id]="inputId() ?? null"
        [attr.aria-label]="ariaLabel() ?? null"
        [attr.min]="min() || null"
        [attr.max]="max() || null"
        [required]="required()"
        [disabled]="disabled()"
        [value]="value()"
        (input)="commit($any($event.target).value)"
        (blur)="touched()"
      />
    } @else {
      <div class="rr-date-box" (keydown)="onKeydown($event)" (click)="onClick($event)">
        <p-datepicker
          [ngModel]="date()"
          (ngModelChange)="pick($event)"
          [ngModelOptions]="{ standalone: true }"
          [inputId]="inputId()"
          [ariaLabel]="ariaLabel()"
          [required]="required()"
          [disabled]="disabled()"
          [placeholder]="placeholder()"
          [minDate]="minDate()"
          [maxDate]="maxDate()"
          [firstDayOfWeek]="1"
          dateFormat="dd/mm/yy"
          [showIcon]="true"
          iconDisplay="input"
          [showButtonBar]="true"
          [showOnFocus]="false"
          [selectOtherMonths]="true"
          appendTo="body"
          panelStyleClass="rr-date-panel"
          (onShow)="shown($event)"
          (onClose)="closed()"
        />
      </div>
    }
  `,
  styleUrl: './date-field.scss',
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rr-date-field' },
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateField), multi: true },
  ],
})
export class DateField implements ControlValueAccessor {
  /** Date as `YYYY-MM-DD`; `''` if none. */
  readonly value = model('');
  /** `id` of the input (to link a `label for`). */
  readonly inputId = input<string>();
  readonly ariaLabel = input<string>();
  readonly required = input(false, { transform: booleanAttribute });
  /** Limits as `YYYY-MM-DD`. */
  readonly min = input('');
  readonly max = input('');
  readonly placeholder = input('dd/mm/aaaa');

  protected readonly native = prefersNativePickers();
  protected readonly disabled = signal(false);
  /** Panel open (until its close animation ends): used by the Esc handling. */
  private readonly open = signal(false);
  private readonly picker = viewChild(DatePicker);

  protected readonly date = computed(() => parseIsoDate(this.value()));
  protected readonly minDate = computed(() => parseIsoDate(this.min()));
  protected readonly maxDate = computed(() => parseIsoDate(this.max()));

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    if (!this.native) useSpanishTexts(inject(PrimeNG));
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  /** Change made by the user (from the calendar, typing or the native picker). */
  protected commit(value: string): void {
    if (value === this.value()) return;
    this.value.set(value);
    this.onChange(value);
  }

  protected pick(date: Date | Date[] | null | undefined): void {
    this.commit(date instanceof Date ? toIsoDate(date) : '');
  }

  protected touched(): void {
    this.onTouched();
  }

  protected shown(panel: HTMLElement): void {
    this.open.set(true);
    // The panel lives in `body`: its Esc must not reach the dialog either.
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    });
  }

  protected closed(): void {
    this.open.set(false);
    this.onTouched();
  }

  /** Opens on a click in the field (PrimeNG only opens on focus by default, which gets in the way here). */
  protected onClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (this.native || this.disabled() || !target.closest('.p-datepicker-input')) return;
    const picker = this.picker();
    if (picker && !picker.overlayVisible()) picker.showOverlay();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.native) return;
    if (event.key === 'Escape' && this.open()) {
      event.stopPropagation();
    } else if (event.key === 'ArrowDown' && !this.open() && !this.disabled()) {
      const target = event.target as HTMLElement;
      if (!target.closest('.p-datepicker-input')) return;
      event.preventDefault();
      this.picker()?.showOverlay();
    }
  }
}
