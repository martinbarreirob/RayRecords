import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import {
  DEFAULT_CATEGORY_COLOR,
  DEFAULT_CATEGORY_ICON,
  DEFAULT_CATEGORY_ICON_COLOR,
  HEX_COLOR_RE,
  CATEGORY_COLOR_PAIRS,
  type CategoryIcon,
} from '@rayrecords/shared';
import { ConfirmationService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import type { Observable } from 'rxjs';
import { apiErrorMessage } from '../../core/api/errors';
import { Icon } from '../../core/ui/icon';
import { prefersNativePickers } from '../../core/ui/native-pickers';
import { ScrollFade } from '../../core/ui/scroll-fade';
import { CategoryBadge } from './category-badge';
import { ICON_LABELS, searchIcons } from './category-icons';

/** A category as the manager needs it, whatever it belongs to (stock or expenses). */
export interface ManagedCategory {
  id: string;
  name: string;
  icon: CategoryIcon;
  color: string;
  iconColor: string;
  /** Built-in entry ("Todas"): its icon and colors can change, its name cannot, nor can it be deleted. */
  locked?: boolean;
}

/** The part of a category the manager can change. */
export type CategoryChanges = Partial<Omit<ManagedCategory, 'id' | 'locked'>>;

/**
 * What the manager does to the data, given by whoever hosts it: the same screen works for the
 * stock categories and the expense ones, which live in different collections.
 */
export interface CategoryOps {
  create(input: Omit<ManagedCategory, 'id' | 'locked'>): Observable<ManagedCategory>;
  update(id: string, changes: CategoryChanges): Observable<unknown>;
  remove(id: string): Observable<unknown>;
}

/** What a category holds and what deleting it does, in the words of the host. */
export interface CategoryTexts {
  /** "3 productos", "sin productos". */
  count(n: number): string;
  /** Said in the confirmation: what happens to the `n` things the category holds. */
  deleteEffect(n: number): string;
}

/** What the editor holds: the name as typed and the look. */
interface Draft {
  name: string;
  icon: CategoryIcon;
  color: string;
  iconColor: string;
}

const NEW_DRAFT: Draft = {
  name: '',
  icon: DEFAULT_CATEGORY_ICON,
  color: DEFAULT_CATEGORY_COLOR,
  iconColor: DEFAULT_CATEGORY_ICON_COLOR,
};

const NAME_ID = 'category-name';

/**
 * The user's own categories (stock or expenses), list and editor side by side. The list is on the left, each
 * row with its rename and delete buttons; the editor of the selected one is on the right: a
 * preview of the badge next to the name, the color pairs on a single row and the icons with a
 * search box.
 *
 * An existing category saves itself: an icon or a color at once, the name when the field is
 * left or Enter is pressed. A new one is only created with its button, once it has a name.
 * Every saved change is announced with `changed`. Deleting leaves the products uncategorized.
 */
@Component({
  selector: 'app-categories-dialog',
  imports: [DialogModule, CategoryBadge, Icon, ScrollFade],
  styleUrl: './categories-dialog.scss',
  template: `
    <p-dialog
      header="Categorías"
      [visible]="open()"
      (visibleChange)="$event || closed.emit()"
      [modal]="true"
      [draggable]="false"
      [dismissableMask]="!creating()"
      [style]="{ width: 'min(760px, 94vw)' }"
      [breakpoints]="{ '767px': '100vw' }"
      styleClass="categories-dialog"
    >
      @if (error(); as message) {
        <p class="alert" role="alert">{{ message }}</p>
      }

      <div class="split">
        <div class="side">
          @if (categories().length) {
            <ul class="list">
              @for (category of categories(); track category.id) {
                <li [class.selected]="isSelected(category.id)">
                  <button
                    type="button"
                    class="pick"
                    [attr.aria-pressed]="isSelected(category.id)"
                    (click)="select(category)"
                  >
                    <app-category-badge [look]="shown(category)" />
                    <span class="who">
                      <span class="name">{{ shown(category).name || 'Sin nombre' }}</span>
                      <span class="count">{{ countLabel(category.id) }}</span>
                    </span>
                  </button>
                  @if (!category.locked) {
                    <button
                      type="button"
                      class="btn ghost icon row-action"
                      [attr.aria-label]="'Renombrar la categoría ' + category.name"
                      title="Renombrar"
                      (click)="rename(category)"
                    >
                      <app-icon name="pencil" />
                    </button>
                    <button
                      type="button"
                      class="btn ghost icon danger row-action"
                      [attr.aria-label]="'Eliminar la categoría ' + category.name"
                      title="Eliminar"
                      (click)="remove(category)"
                    >
                      <app-icon name="trash" />
                    </button>
                  }
                </li>
              }
            </ul>
          }
          <button
            type="button"
            class="new"
            [attr.aria-pressed]="creating()"
            (click)="startCreate()"
          >
            <span class="new-mark"><app-icon name="plus" /></span>
            Nueva categoría
          </button>
        </div>

        @if (editing()) {
          <form class="editor" novalidate (submit)="submit($event)">
            <div class="preview">
              <app-category-badge [look]="draft()" size="lg" />
              <div class="name-field">
                <label class="sr-only" [attr.for]="nameId">Nombre de la categoría</label>
                <input
                  #nameInput
                  [id]="nameId"
                  class="input"
                  type="text"
                  autocomplete="off"
                  maxlength="60"
                  [placeholder]="creating() ? 'Nombre de la nueva categoría' : 'Nombre'"
                  [value]="draft().name"
                  [readOnly]="nameLocked()"
                  (input)="patch({ name: nameInput.value })"
                  (blur)="commitName()"
                />
              </div>
            </div>

            <fieldset>
              <legend>Color</legend>
              <div class="pairs">
                @for (pair of pairs; track pair.color) {
                  <button
                    type="button"
                    class="pair"
                    [style.background-color]="pair.color"
                    [style.color]="pair.iconColor"
                    [attr.aria-label]="'Combinación ' + ($index + 1)"
                    [attr.aria-pressed]="isPair(pair)"
                    (click)="pickLook(pair)"
                  >
                    A
                  </button>
                }
                <button
                  type="button"
                  class="pair custom-toggle"
                  aria-label="Colores propios"
                  title="Colores propios"
                  aria-controls="category-custom-colors"
                  [attr.aria-expanded]="customOpen()"
                  [attr.aria-pressed]="isCustom()"
                  (click)="customOpen.set(!customOpen())"
                >
                  <app-icon name="palette" />
                </button>
              </div>
              <div id="category-custom-colors" class="custom" [hidden]="!customOpen()">
                <label>
                  <input
                    #bg
                    type="color"
                    [value]="draft().color"
                    (input)="previewColor('color', bg.value)"
                    (change)="pickColor('color', bg.value)"
                  />
                  Fondo
                </label>
                <label>
                  <input
                    #fg
                    type="color"
                    [value]="draft().iconColor"
                    (input)="previewColor('iconColor', fg.value)"
                    (change)="pickColor('iconColor', fg.value)"
                  />
                  Icono
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend>Icono</legend>
              <label class="sr-only" for="category-icon-search">Buscar icono</label>
              <input
                #search
                id="category-icon-search"
                class="input"
                type="search"
                autocomplete="off"
                placeholder="Buscar icono: bolso, reloj, regalo…"
                [value]="query()"
                (input)="query.set(search.value)"
              />
              <div class="icons" appScrollFade>
                @for (icon of icons(); track icon) {
                  <button
                    type="button"
                    class="icon-choice"
                    [attr.aria-label]="'Icono ' + labels[icon]"
                    [title]="labels[icon]"
                    [attr.aria-pressed]="draft().icon === icon"
                    (click)="pickLook({ icon })"
                  >
                    <app-icon [name]="icon" />
                  </button>
                } @empty {
                  <p class="no-icons">Ningún icono con ese nombre.</p>
                }
              </div>
            </fieldset>

            <div class="foot">
              @if (creating()) {
                @if (categories().length) {
                  <button type="button" class="btn" [disabled]="busy()" (click)="cancelCreate()">
                    Cancelar
                  </button>
                }
                <button
                  type="submit"
                  class="btn primary"
                  [disabled]="busy() || !draft().name.trim()"
                >
                  Crear categoría
                </button>
              } @else {
                <span class="hint" aria-live="polite">
                  {{ busy() ? 'Guardando…' : 'Los cambios se guardan solos.' }}
                </span>
              }
            </div>
          </form>
        }
      </div>
    </p-dialog>
  `,
})
export class CategoriesDialog {
  private readonly confirmation = inject(ConfirmationService);

  readonly open = input(false);
  /** The category the editor starts on when it opens; the first one if there is none. */
  readonly focusId = input<string | null>(null);
  readonly categories = input.required<ManagedCategory[]>();
  /** How many things each category holds, by id, to say what deleting one affects. */
  readonly counts = input.required<ReadonlyMap<string, number>>();
  readonly ops = input.required<CategoryOps>();
  readonly texts = input.required<CategoryTexts>();

  readonly changed = output<void>();
  readonly closed = output<void>();

  protected readonly pairs = CATEGORY_COLOR_PAIRS;
  protected readonly labels = ICON_LABELS;
  protected readonly nameId = NAME_ID;

  /** The category in the editor, or `null` while creating one (or with nothing to edit). */
  private readonly selectedId = signal<string | null>(null);
  protected readonly creating = signal(false);
  protected readonly draft = signal<Draft>(NEW_DRAFT);
  protected readonly query = signal('');
  protected readonly customOpen = signal(false);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  private readonly selected = computed(() =>
    this.categories().find((category) => category.id === this.selectedId()),
  );
  /**
   * There is something in the editor: a new category or an existing one. A category just
   * created counts before the reloaded list brings it, so the editor does not blink.
   */
  protected readonly editing = computed(() => this.creating() || this.selectedId() !== null);
  /** The built-in category is in the editor: its name is fixed. */
  protected readonly nameLocked = computed(() => !this.creating() && !!this.selected()?.locked);
  protected readonly icons = computed(() => searchIcons(this.query()));
  /** The colors on screen are not one of the suggested pairs. */
  protected readonly isCustom = computed(() => !this.pairs.some((pair) => this.isPair(pair)));

  constructor() {
    // Each time it opens: the first category in the editor, or a new one when there are none.
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        this.error.set('');
        this.query.set('');
        const first =
          this.categories().find(({ id }) => id === this.focusId()) ?? this.categories()[0];
        if (first) this.edit(first);
        else this.startCreate();
      });
    });
  }

  protected isSelected(id: string): boolean {
    return !this.creating() && this.selectedId() === id;
  }

  /** The selected row shows what the editor holds, so a change is seen in the list at once. */
  protected shown(category: ManagedCategory): Draft {
    return this.isSelected(category.id) ? this.draft() : category;
  }

  protected isPair(pair: { color: string; iconColor: string }): boolean {
    const { color, iconColor } = this.draft();
    return pair.color === color && pair.iconColor === iconColor;
  }

  protected countLabel(id: string): string {
    return this.texts().count(this.counts().get(id) ?? 0);
  }

  // What is in the editor

  private edit(category: ManagedCategory): void {
    this.creating.set(false);
    this.selectedId.set(category.id);
    this.draft.set({
      name: category.name,
      icon: category.icon,
      color: category.color,
      iconColor: category.iconColor,
    });
    this.customOpen.set(this.isCustom());
  }

  protected select(category: ManagedCategory): void {
    if (this.isSelected(category.id)) return;
    this.error.set('');
    this.edit(category);
  }

  protected rename(category: ManagedCategory): void {
    this.select(category);
    this.focusName(true);
  }

  protected startCreate(): void {
    this.error.set('');
    this.creating.set(true);
    this.selectedId.set(null);
    this.draft.set(NEW_DRAFT);
    this.customOpen.set(false);
    if (!prefersNativePickers()) this.focusName(false);
  }

  protected cancelCreate(): void {
    const [first] = this.categories();
    if (first) this.edit(first);
  }

  /** The field only exists, or only holds the new name, after the next render. */
  private focusName(selectText: boolean): void {
    setTimeout(() => {
      const field = document.getElementById(NAME_ID) as HTMLInputElement | null;
      field?.focus();
      if (selectText) field?.select();
    });
  }

  protected patch(change: Partial<Draft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
  }

  // Saving

  /** An icon or a pair of colors: shown at once and, on an existing category, saved at once. */
  protected pickLook(change: Partial<Pick<Draft, 'icon' | 'color' | 'iconColor'>>): void {
    this.patch(change);
    if (!this.creating()) this.save(change);
  }

  /** While the system picker is being dragged the badge follows, without saving every step. */
  protected previewColor(key: 'color' | 'iconColor', value: string): void {
    if (HEX_COLOR_RE.test(value)) this.patch({ [key]: value.toLowerCase() });
  }

  protected pickColor(key: 'color' | 'iconColor', value: string): void {
    if (HEX_COLOR_RE.test(value)) this.pickLook({ [key]: value.toLowerCase() });
  }

  /** Leaving the name field saves it; an empty name goes back to the saved one. */
  protected commitName(): void {
    const category = this.selected();
    if (this.creating() || !category || category.locked) return;
    const name = this.draft().name.trim();
    if (!name) {
      this.patch({ name: category.name });
      return;
    }
    if (name !== category.name) this.save({ name });
  }

  private save(change: CategoryChanges): void {
    const id = this.selectedId();
    if (!id) return;
    this.error.set('');
    this.busy.set(true);
    this.ops()
      .update(id, change)
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(apiErrorMessage(error));
        },
      });
  }

  /** Enter in the form: creates the new category, or saves the name of the existing one. */
  protected submit(event: Event): void {
    event.preventDefault();
    if (!this.creating()) {
      this.commitName();
      return;
    }
    const draft = this.draft();
    const name = draft.name.trim();
    if (!name || this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    this.ops()
      .create({ ...draft, name })
      .subscribe({
        next: (created) => {
          this.busy.set(false);
          this.edit(created);
          this.changed.emit();
        },
        error: (error: unknown) => {
          this.busy.set(false);
          this.error.set(apiErrorMessage(error));
        },
      });
  }

  protected remove(category: ManagedCategory): void {
    const count = this.counts().get(category.id) ?? 0;
    const affected = this.texts().deleteEffect(count);
    this.confirmation.confirm({
      header: 'Eliminar categoría',
      message: `¿Eliminar «${category.name}»? ${affected}`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => {
        this.error.set('');
        this.busy.set(true);
        this.ops()
          .remove(category.id)
          .subscribe({
            next: () => {
              this.busy.set(false);
              // The editor moves on to another category, or to a new one if that was the last.
              if (this.selectedId() === category.id) {
                const next = this.categories().find(({ id }) => id !== category.id);
                if (next) this.edit(next);
                else this.startCreate();
              }
              this.changed.emit();
            },
            error: (error: unknown) => {
              this.busy.set(false);
              this.error.set(apiErrorMessage(error));
            },
          });
      },
    });
  }
}
