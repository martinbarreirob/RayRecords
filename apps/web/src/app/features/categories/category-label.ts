import { Component, input } from '@angular/core';
import { CategoryBadge, type CategoryLook } from './category-badge';
import { UNCATEGORIZED_LOOK } from './uncategorized';

/**
 * A category as it is named everywhere: its badge (the icon on its colored square) and its name.
 * With no look (no category, or one that no longer exists) it wears the "Sin categoría" badge,
 * so nothing in a list is left without an icon; `plain` leaves the badge out ("Todas").
 */
@Component({
  selector: 'app-category-label',
  imports: [CategoryBadge],
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
      max-width: 100%;
    }

    .name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
  template: `
    @if (!plain()) {
      <app-category-badge [look]="look() ?? uncategorized" [size]="size()" />
    }
    <span class="name">{{ name() }}</span>
  `,
})
export class CategoryLabel {
  readonly look = input<CategoryLook | null>(null);
  readonly name = input.required<string>();
  readonly size = input<'xs' | 'sm' | 'md'>('xs');
  readonly plain = input(false);
  protected readonly uncategorized = UNCATEGORIZED_LOOK;
}
