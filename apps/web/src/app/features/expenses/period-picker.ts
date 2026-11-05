import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { DEFAULT_TIME_ZONE, monthOf, todayIn } from '@rayrecords/shared';
import { periodLabel, type Period } from './movements-logic';
import {
  monthInPeriod,
  periodPresets,
  rangeBetween,
  shiftPeriod,
  wholeYear,
  yearPeriod,
} from './period-logic';

const MONTH_NAMES = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/**
 * Custom period picker: shortcuts (this month, 3 or 12 months, a year, all), a whole year in one
 * click, and month ranges that can cross years. First click on a month selects it; the second
 * selects the range up to it. The arrows jump to the previous or next period of the same size.
 */
@Component({
  selector: 'app-period-picker',
  styleUrl: './period-picker.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'close()',
  },
  template: `
    <div class="pp">
      <button
        type="button"
        class="btn icon ghost"
        aria-label="Periodo anterior"
        [disabled]="!canShift()"
        (click)="shift(-1)"
      >
        <i class="pi pi-chevron-left" aria-hidden="true"></i>
      </button>

      <button
        type="button"
        class="btn pp-trigger"
        aria-haspopup="dialog"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        <i class="pi pi-calendar" aria-hidden="true"></i>
        <span>{{ label() }}</span>
        <i class="pi pi-angle-down" aria-hidden="true"></i>
      </button>

      <button
        type="button"
        class="btn icon ghost"
        aria-label="Periodo siguiente"
        [disabled]="!canShift()"
        (click)="shift(1)"
      >
        <i class="pi pi-chevron-right" aria-hidden="true"></i>
      </button>

      @if (open()) {
        <div class="pp-pop card" role="dialog" aria-label="Elegir periodo">
          <div class="pp-presets">
            @for (preset of presets(); track preset.id) {
              <button type="button" class="pp-preset" (click)="apply(preset.period)">
                {{ preset.label }}
              </button>
            }
          </div>

          <div class="pp-year">
            <button
              type="button"
              class="btn icon ghost"
              aria-label="Año anterior"
              (click)="year.set(year() - 1)"
            >
              <i class="pi pi-chevron-left" aria-hidden="true"></i>
            </button>
            <strong class="num">{{ year() }}</strong>
            <button
              type="button"
              class="btn icon ghost"
              aria-label="Año siguiente"
              (click)="year.set(year() + 1)"
            >
              <i class="pi pi-chevron-right" aria-hidden="true"></i>
            </button>
            <button type="button" class="btn sm" (click)="apply(yearOf())">Todo el año</button>
          </div>

          <div class="pp-months" role="group" aria-label="Meses del año">
            @for (name of monthNames; track $index) {
              <button
                type="button"
                class="pp-month"
                [class.in-range]="selected($index)"
                [class.is-anchor]="anchor() === monthKey($index)"
                [attr.aria-pressed]="selected($index)"
                (click)="pick($index)"
              >
                {{ name }}
              </button>
            }
          </div>

          <p class="pp-hint muted" aria-live="polite">
            @if (anchor()) {
              Pulsa otro mes para completar el rango.
            } @else {
              Pulsa un mes, o dos para elegir un rango.
            }
          </p>
        </div>
      }
    </div>
  `,
})
export class PeriodPicker {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Current period; `{ from: null, to: null }` means the whole history. */
  readonly period = input.required<Period>();
  /** Whether the screen allows no limit (Movements does, Summary does not). */
  readonly allowAll = input(false);
  readonly periodChange = output<Period>();

  protected readonly monthNames = MONTH_NAMES;
  protected readonly open = signal(false);
  protected readonly anchor = signal<string | null>(null);
  protected readonly year = signal(Number(todayIn(DEFAULT_TIME_ZONE).slice(0, 4)));

  protected readonly label = computed(() => {
    const period = this.period();
    return wholeYear(period) ?? periodLabel(period);
  });
  protected readonly presets = computed(() =>
    periodPresets(monthOf(todayIn(DEFAULT_TIME_ZONE)), this.allowAll()),
  );
  protected readonly canShift = computed(() => shiftPeriod(this.period(), 1) !== null);

  protected toggle(): void {
    if (this.open()) {
      this.close();
      return;
    }
    // Opens on the year of the selected period.
    const from = this.period().from;
    if (from) this.year.set(Number(from.slice(0, 4)));
    this.anchor.set(null);
    this.open.set(true);
  }

  protected close(): void {
    this.open.set(false);
    this.anchor.set(null);
  }

  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close();
  }

  protected monthKey(index: number): string {
    return `${this.year()}-${String(index + 1).padStart(2, '0')}`;
  }

  protected selected(index: number): boolean {
    const period = this.period();
    if (!period.from && !period.to) return false;
    return monthInPeriod(this.monthKey(index), period);
  }

  protected yearOf(): Period {
    return yearPeriod(String(this.year()));
  }

  protected pick(index: number): void {
    const month = this.monthKey(index);
    const anchor = this.anchor();
    if (anchor === null) {
      this.anchor.set(month);
      this.periodChange.emit({ from: month, to: month });
    } else {
      this.periodChange.emit(rangeBetween(anchor, month));
      this.close();
    }
  }

  protected apply(period: Period): void {
    this.periodChange.emit(period);
    this.close();
  }

  protected shift(direction: -1 | 1): void {
    const next = shiftPeriod(this.period(), direction);
    if (next) this.periodChange.emit(next);
  }
}
