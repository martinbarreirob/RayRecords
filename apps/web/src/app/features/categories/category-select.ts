import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectModule } from 'primeng/select';
import type { CategoryLook } from './category-badge';
import { CategoryLabel } from './category-label';
import { NO_CATEGORY } from './uncategorized';

/** One entry of the selector: what it stands for, its name and its look. */
export interface CategoryOption {
  /** Whatever the host needs to tell the entries apart (a key, an id, `all`, `none`). */
  value: string;
  label: string;
  /** `null` wears the "Sin categoría" badge. */
  look: CategoryLook | null;
  /** No badge at all (the "Todas" entry of a filter). */
  plain?: boolean;
}

/**
 * The category dropdown used wherever a category is picked: the same PrimeNG select, with each
 * entry (and the chosen one) drawn as its badge and name. The host builds the entries, so the
 * same control serves stock categories and expense ones, and special entries like "Todas".
 */
@Component({
  selector: 'app-category-select',
  imports: [FormsModule, SelectModule, CategoryLabel, NgTemplateOutlet],
  template: `
    <p-select
      [options]="options()"
      optionLabel="label"
      optionValue="value"
      [ngModel]="value()"
      (ngModelChange)="valueChange.emit($event ?? null)"
      [ngModelOptions]="{ standalone: true }"
      [placeholder]="placeholder()"
      [showClear]="showClear()"
      [disabled]="disabled()"
      [filter]="options().length > 8"
      filterBy="label"
      filterPlaceholder="Buscar categoría"
      [inputId]="inputId()"
      [ariaLabel]="ariaLabel()"
      [ariaLabelledBy]="ariaLabelledBy()"
      appendTo="body"
      styleClass="w-full"
    >
      <ng-template #selectedItem let-option>
        <ng-container *ngTemplateOutlet="row; context: { $implicit: option }" />
      </ng-template>
      <ng-template #item let-option>
        <ng-container *ngTemplateOutlet="row; context: { $implicit: option }" />
      </ng-template>
    </p-select>

    <ng-template #row let-option>
      <app-category-label
        size="sm"
        [look]="option.look"
        [name]="option.label"
        [plain]="option.plain ?? false"
      />
    </ng-template>
  `,
})
export class CategorySelect {
  readonly options = input.required<CategoryOption[]>();
  readonly value = input<string | null>(null);
  readonly placeholder = input(NO_CATEGORY);
  readonly showClear = input(false);
  readonly disabled = input(false);
  readonly inputId = input<string>();
  readonly ariaLabel = input<string>();
  readonly ariaLabelledBy = input<string>();

  /** The entry picked, or `null` when it is cleared. */
  readonly valueChange = output<string | null>();
}
