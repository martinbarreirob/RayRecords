import { Component, computed, input } from '@angular/core';
import { TABLER_ICONS, type IconName } from './tabler-icons.generated';

/**
 * A Tabler icon, drawn inline as SVG at the size of the surrounding text (`1em`) and in its
 * color. Only the icons in `tabler-icons.generated.ts` exist; that file says how to add one.
 * Decorative by default: the control or text next to it carries the meaning.
 */
@Component({
  selector: 'app-icon',
  host: { 'aria-hidden': 'true' },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      line-height: 0;
    }

    svg {
      width: 1em;
      height: 1em;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.75;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
  template: `
    <svg viewBox="0 0 24 24" focusable="false">
      @for (d of paths(); track $index) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();

  protected readonly paths = computed(() => TABLER_ICONS[this.name()] ?? []);
}
