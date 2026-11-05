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
 * Campo de fecha. El valor es un texto `YYYY-MM-DD` (vacío = `''`), el mismo que da un
 * `<input type="date">`, así que sustituye a ese input sin tocar el resto del código.
 *
 * - Táctil o sin cursor: el `<input type="date">` nativo.
 * - Escritorio: `p-datepicker` (calendario desplegable en español, semana desde el lunes, `dd/mm/aaaa`,
 *   botón «Hoy», panel anexado al `body` para que ningún diálogo lo recorte). Se abre al pulsar el
 *   campo o con ↓; Esc lo cierra sin cerrar también el diálogo o formulario que lo contiene.
 *
 * Se usa con `[(value)]="señal"` o con `ngModel` / formularios reactivos. Requiere que la ruta que lo
 * muestre declare `providePrimeNgTheme()`. Los estilos del panel están en `date-field.scss`.
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
  /** Fecha como `YYYY-MM-DD`; `''` si no hay. */
  readonly value = model('');
  /** `id` del campo de entrada (para enlazar una `label for`). */
  readonly inputId = input<string>();
  readonly ariaLabel = input<string>();
  readonly required = input(false, { transform: booleanAttribute });
  /** Límites como `YYYY-MM-DD`. */
  readonly min = input('');
  readonly max = input('');
  readonly placeholder = input('dd/mm/aaaa');

  protected readonly native = prefersNativePickers();
  protected readonly disabled = signal(false);
  /** Panel abierto (hasta que termina su animación de cierre): lo usa el control de Esc. */
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

  /** Cambio hecho por el usuario (desde el calendario, escribiendo o con el selector nativo). */
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
    // El panel vive en el `body`: su Esc tampoco debe llegar al diálogo.
    panel.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') event.stopPropagation();
    });
  }

  protected closed(): void {
    this.open.set(false);
    this.onTouched();
  }

  /** Abre con un clic en el campo (por defecto PrimeNG solo abre al enfocar, que aquí estorba). */
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
