import { Component, input } from '@angular/core';
import { Icon } from '../../core/ui/icon';
import type { IconName } from '../../core/ui/tabler-icons.generated';

/** What the badge needs of a category: also a draft that is not saved yet. */
export interface CategoryLook {
  icon: IconName;
  color: string;
  iconColor: string;
}

/**
 * A category's mark: its icon on a square of its color. Both colors are the user's own choice
 * (data, not theme tokens), so they are the same in the light and the dark theme. Decorative:
 * the category name always goes next to it.
 */
@Component({
  selector: 'app-category-badge',
  imports: [Icon],
  host: {
    'aria-hidden': 'true',
    '[class]': 'size()',
    '[style.background-color]': 'look().color',
    '[style.color]': 'look().iconColor',
  },
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border-radius: var(--radius-sm);
      /* A hairline keeps a square of the page's own color visible. */
      box-shadow: inset 0 0 0 1px color-mix(in srgb, currentColor 14%, transparent);
      font-size: 15px;
      vertical-align: middle;
    }

    /* Inside a table row or a list line, where 24 px would make the row taller. */
    :host(.xs) {
      width: 20px;
      height: 20px;
      border-radius: 5px;
      font-size: 13px;
    }

    :host(.md) {
      width: 32px;
      height: 32px;
      border-radius: var(--radius-md);
      font-size: 19px;
    }

    /* As tall as a two-line heading (a title and a small line under it). */
    :host(.xl) {
      width: 44px;
      height: 44px;
      border-radius: var(--radius-md);
      font-size: 26px;
    }

    :host(.lg) {
      width: 56px;
      height: 56px;
      border-radius: var(--radius-lg);
      font-size: 32px;
    }
  `,
  template: `<app-icon [name]="look().icon" />`,
})
export class CategoryBadge {
  readonly look = input.required<CategoryLook>();
  readonly size = input<'xs' | 'sm' | 'md' | 'xl' | 'lg'>('sm');
}
