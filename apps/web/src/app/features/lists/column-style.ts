import { Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';
import { BOARD_COLORS, COLUMN_ICONS, type ColumnIcon } from '@rayrecords/shared';
import { Dropdown } from '../../core/ui/dropdown';
import { columnHue, hueStyle, isHexColor } from './board-logic';
import { STATUS_LABELS, StatusIcon, defaultIcon } from './status-icon';

const COLOR_NAMES: Record<string, string> = {
  blue: 'Azul',
  green: 'Verde',
  amber: 'Ámbar',
  rose: 'Rosa',
  violet: 'Violeta',
  teal: 'Turquesa',
};

/**
 * The look of a board column in its editor: a button with its state icon that opens the list of
 * icons, and a button with its colour that opens the named tones and an RGB picker.
 */
@Component({
  selector: 'app-column-style',
  imports: [Dropdown, StatusIcon],
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
    }

    .current {
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }

    .swatch {
      display: block;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--hue, var(--line-strong));
      box-shadow: 0 0 0 1px var(--line-strong);
    }

    .icons {
      display: grid;
      grid-template-columns: 1fr;
      min-width: 190px;
    }

    .tones {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      padding: var(--space-2);
    }

    .preset {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 2px solid var(--surface);
      border-radius: 50%;
      background: var(--hue);
      box-shadow: 0 0 0 1px var(--line-strong);
      cursor: pointer;

      &[aria-selected='true'] {
        box-shadow: 0 0 0 2px var(--text);
      }
    }

    .rgb {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-2);
      border-top: 1px solid var(--line-soft);
      color: var(--muted);
      font-size: var(--text-sm);
    }

    .rgb input[type='color'] {
      width: 36px;
      height: 32px;
      padding: 0;
      border: 1px solid var(--line);
      border-radius: var(--radius-control);
      background: none;
      cursor: pointer;
    }

    .rgb .hex {
      width: 96px;
      font-variant-numeric: tabular-nums;
    }
  `,
  template: `
    <app-dropdown label="Icono del estado" [compact]="true">
      <span trigger [class]="'current hue-' + hue()" [style]="style()">
        <app-status-icon [kind]="shownIcon()" />
      </span>
      <div panel class="dd-menu icons" role="listbox" aria-label="Iconos de estado">
        @for (kind of kinds; track kind) {
          <button
            type="button"
            data-pick
            role="option"
            class="dd-opt"
            [class]="'dd-opt hue-' + hue()"
            [style]="style()"
            [attr.aria-selected]="kind === shownIcon()"
            (click)="iconChange.emit(kind)"
          >
            <app-status-icon [kind]="kind" />{{ labels[kind] }}
          </button>
        }
      </div>
    </app-dropdown>

    <app-dropdown label="Color de acento" [compact]="true" (opened)="readColor()">
      <span #swatch trigger [class]="'swatch hue-' + hue()" [style]="style()"></span>
      <div panel>
        <div class="tones" role="listbox" aria-label="Colores">
          @for (tone of tones; track tone) {
            <button
              type="button"
              data-pick
              role="option"
              [class]="'preset hue-' + tone"
              [attr.aria-label]="names[tone]"
              [attr.aria-selected]="color() === tone"
              (click)="colorChange.emit(tone)"
            ></button>
          }
        </div>
        <div class="rgb">
          <span id="rgb-label">RGB</span>
          <input
            #picker
            type="color"
            aria-labelledby="rgb-label"
            [value]="hex()"
            (input)="colorChange.emit(picker.value)"
          />
          <input
            #typed
            class="input hex"
            type="text"
            maxlength="7"
            aria-label="Código del color"
            [value]="hex()"
            (change)="typedColor(typed)"
          />
        </div>
      </div>
    </app-dropdown>
  `,
})
export class ColumnStyle {
  /** The column's colour: a named tone, a `#rrggbb` or none. */
  readonly color = input<string | undefined>(undefined);
  /** The icon chosen for the column, if any. */
  readonly icon = input<ColumnIcon | undefined>(undefined);
  /** The column's name, position and the number of columns: what the board derives its look from. */
  readonly label = input('');
  readonly index = input(0);
  readonly count = input(1);

  readonly colorChange = output<string>();
  readonly iconChange = output<ColumnIcon>();

  protected readonly kinds = COLUMN_ICONS;
  protected readonly tones = BOARD_COLORS;
  protected readonly labels = STATUS_LABELS;
  protected readonly names = COLOR_NAMES;

  /** The icon the column shows when none is chosen (by position). */
  private readonly fallbackIcon = computed(() => defaultIcon(this.index(), this.count()));
  /** The tone shown when no colour is chosen (from the name or position). */
  private readonly fallbackTone = computed(() => columnHue(this.label(), this.index()));

  protected readonly shownIcon = computed(() => this.icon() ?? this.fallbackIcon());
  protected readonly hue = computed(() => {
    const color = this.color();
    if (isHexColor(color)) return 'custom';
    return color && color in COLOR_NAMES ? color : this.fallbackTone();
  });
  protected readonly style = computed(() => hueStyle(this.color()));
  private readonly swatch = viewChild<ElementRef<HTMLElement>>('swatch');
  /** The colour the swatch really shows, read when the menu opens (a named tone is a token). */
  private readonly shown = signal<string | null>(null);

  protected readonly hex = computed(() => {
    const color = this.color();
    if (isHexColor(color)) return color.toLowerCase();
    // Until the menu has been opened and the real colour read, a neutral grey.
    return this.shown() ?? '#808080';
  });

  /** Reads the colour on screen as `#rrggbb`, so the RGB picker starts from what is painted. */
  protected readColor(): void {
    const element = this.swatch()?.nativeElement;
    const context = document.createElement('canvas').getContext('2d');
    if (!element || !context) return;
    context.fillStyle = getComputedStyle(element).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    const part = (n: number | undefined) => (n ?? 0).toString(16).padStart(2, '0');
    this.shown.set(`#${part(r)}${part(g)}${part(b)}`);
  }

  /** A colour typed as text: accepted when it is `#rrggbb`, else the field goes back to the current one. */
  protected typedColor(input: HTMLInputElement): void {
    const value = input.value.trim();
    const full = value.startsWith('#') ? value : `#${value}`;
    if (isHexColor(full)) this.colorChange.emit(full.toLowerCase());
    else input.value = this.hex();
  }
}
