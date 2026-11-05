import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { CategorizationRule, RuleMatchType } from '@rayrecords/shared';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import type { Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { RefreshBus } from '../../core/refresh';
import { FinanceStore } from './finance.store';
import { categoryKeyError, keyFromName, patternError } from './rules-logic';

const MATCH_LABELS: Record<RuleMatchType, string> = {
  contains: 'contiene',
  startsWith: 'empieza por',
  regex: 'expresión regular',
};

@Component({
  selector: 'app-rules-panel',
  imports: [FormsModule, SelectModule, ToggleSwitchModule, InputNumberModule],
  styleUrl: './rules-panel.scss',
  template: `
    @if (error(); as message) {
      <p class="alert" role="alert">{{ message }}</p>
    }
    @if (notice(); as message) {
      <p class="alert success" role="status">{{ message }}</p>
    }

    <section class="card" aria-labelledby="rules-title">
      <div class="head">
        <div>
          <h2 id="rules-title">Reglas de categorización</h2>
          <p class="muted">
            Se evalúan de mayor a menor prioridad sobre la descripción, sin acentos ni mayúsculas.
            La primera que coincide gana, y nunca pisan una categoría corregida a mano.
          </p>
        </div>
        <button type="button" class="btn" [disabled]="busy()" (click)="apply()">
          {{ applying() ? 'Aplicando…' : 'Reaplicar a los movimientos sin categoría' }}
        </button>
      </div>

      @if (!rulesLoaded()) {
        <div aria-busy="true">
          <p class="sr-only" role="status">Cargando reglas…</p>
          <ul class="rules skel-in" aria-hidden="true">
            @for (width of ghostRules; track $index) {
              <li>
                <span class="skeleton ghost-pattern" [style.width.px]="width"></span>
                <span class="skeleton pill ghost-badge"></span>
                <span class="skeleton pill ghost-badge"></span>
                <span class="spacer"></span>
                <span class="skeleton pill ghost-toggle"></span>
                <span class="skeleton ghost-del"></span>
              </li>
            }
          </ul>
        </div>
      } @else if (rules().length) {
        <ul class="rules">
          @for (rule of rules(); track rule.id) {
            <li [class.inactive]="!rule.active">
              <span class="pattern">«{{ rule.pattern }}»</span>
              <span class="badge">{{ labels[rule.matchType] }}</span>
              <span class="arrow" aria-hidden="true">→</span>
              <span class="badge accent">{{ store.categoryName(rule.categoryKey) }}</span>
              <span class="muted priority" title="Las de mayor prioridad se evalúan antes">
                prioridad {{ rule.priority }}
              </span>
              <span class="spacer"></span>
              <p-toggleswitch
                [ngModel]="rule.active"
                (ngModelChange)="toggle(rule, $event)"
                [disabled]="busy()"
                [ariaLabel]="'Regla «' + rule.pattern + '» activa'"
              />
              <button
                type="button"
                class="btn sm danger"
                [attr.aria-label]="'Borrar la regla «' + rule.pattern + '»'"
                [disabled]="busy()"
                (click)="remove(rule)"
              >
                Borrar
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="empty">Todavía no hay reglas. Añade la primera abajo.</p>
      }

      <form class="add" (submit)="addRule($event)" novalidate>
        <h3>Nueva regla</h3>
        <div class="grid">
          <label class="field pattern-field">
            <span>Patrón</span>
            <input
              class="input"
              type="text"
              [ngModel]="pattern()"
              (ngModelChange)="pattern.set($event)"
              name="pattern"
              placeholder="p. ej. mercadona"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              [attr.aria-invalid]="patternProblem() ? 'true' : null"
              aria-describedby="rule-pattern-help"
            />
            <small id="rule-pattern-help" class="help" [class.error]="patternProblem()">
              {{ patternProblem() || 'Sin acentos ni mayúsculas; se busca en la descripción.' }}
            </small>
          </label>
          <div class="field">
            <span>Tipo</span>
            <p-select
              [options]="matchTypes"
              optionLabel="label"
              optionValue="value"
              [ngModel]="matchType()"
              (ngModelChange)="matchType.set($event)"
              [ngModelOptions]="{ standalone: true }"
              ariaLabel="Tipo de coincidencia"
              appendTo="body"
            />
          </div>
          <div class="field">
            <span>Categoría</span>
            <p-select
              [options]="categoryOptions()"
              optionLabel="label"
              optionValue="value"
              [ngModel]="effectiveCategory()"
              (ngModelChange)="categoryKey.set($event)"
              [ngModelOptions]="{ standalone: true }"
              ariaLabel="Categoría de la regla"
              appendTo="body"
              [filter]="categoryOptions().length > 8"
            />
          </div>
          <div class="field priority-field">
            <span id="rule-priority-label">Prioridad</span>
            <p-inputnumber
              [ngModel]="priority()"
              (ngModelChange)="priority.set($event ?? 0)"
              [ngModelOptions]="{ standalone: true }"
              [showButtons]="true"
              buttonLayout="horizontal"
              incrementButtonIcon="pi pi-plus"
              decrementButtonIcon="pi pi-minus"
              [step]="1"
              [min]="-999"
              [max]="999"
              [useGrouping]="false"
              ariaLabelledBy="rule-priority-label"
              inputStyleClass="num"
            />
            <small class="help">Mayor = se evalúa antes.</small>
          </div>
          <button
            type="submit"
            class="btn primary submit"
            [disabled]="busy() || !pattern().trim() || !effectiveCategory() || !!patternProblem()"
          >
            Añadir regla
          </button>
        </div>
      </form>
    </section>

    <section class="card" aria-labelledby="cats-title">
      <h2 id="cats-title">Categorías</h2>
      <p class="muted">
        La clave identifica la categoría y no se puede cambiar. Una categoría en uso por reglas o
        movimientos no se puede borrar.
      </p>

      @if (!store.ready()) {
        <div aria-busy="true">
          <p class="sr-only" role="status">Cargando categorías…</p>
          <ul class="cats skel-in" aria-hidden="true">
            @for (width of ghostCats; track $index) {
              <li class="skeleton ghost-cat" [style.width.px]="width"></li>
            }
          </ul>
        </div>
      } @else if (store.categories().length) {
        <ul class="cats">
          @for (category of store.categories(); track category.key) {
            <li class="chip">
              <span>{{ category.name }}</span>
              <small class="muted">{{ category.key }}</small>
              <button
                type="button"
                class="btn ghost sm icon-only"
                [attr.aria-label]="'Borrar la categoría ' + category.name"
                [disabled]="busy()"
                (click)="removeCategory(category.key)"
              >
                <i class="pi pi-times" aria-hidden="true"></i>
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="empty">Todavía no hay categorías.</p>
      }

      <form class="add" (submit)="addCategory($event)" novalidate>
        <h3>Nueva categoría</h3>
        <div class="grid cat-grid">
          <label class="field">
            <span>Nombre</span>
            <input
              class="input"
              type="text"
              [ngModel]="catName()"
              (ngModelChange)="onCatName($event)"
              name="catName"
              placeholder="p. ej. Mascotas"
              autocomplete="off"
            />
          </label>
          <label class="field">
            <span>Clave</span>
            <input
              class="input"
              type="text"
              [ngModel]="catKey()"
              (ngModelChange)="onCatKey($event)"
              name="catKey"
              placeholder="p. ej. mascotas"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              [attr.aria-invalid]="keyProblem() ? 'true' : null"
              aria-describedby="cat-key-help"
            />
            <small id="cat-key-help" class="help" [class.error]="keyProblem()">
              {{ keyProblem() || 'Se propone a partir del nombre; sin espacios ni acentos.' }}
            </small>
          </label>
          <button
            type="submit"
            class="btn primary submit"
            [disabled]="busy() || !catKey().trim() || !catName().trim() || !!keyProblem()"
          >
            Añadir categoría
          </button>
        </div>
      </form>
    </section>
  `,
})
export class RulesPanel {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly store = inject(FinanceStore);

  protected readonly labels = MATCH_LABELS;
  protected readonly matchTypes = Object.entries(MATCH_LABELS).map(([value, label]) => ({
    value,
    label,
  }));
  protected readonly rules = signal<CategorizationRule[]>([]);
  /** Ya llegaron las reglas (o falló): antes de eso no se puede decir que no hay ninguna. */
  protected readonly rulesLoaded = signal(false);
  protected readonly ghostRules = [150, 112, 132];
  protected readonly ghostCats = [128, 104, 140, 116, 124, 98];
  protected readonly error = signal('');
  protected readonly notice = signal('');
  /** Hay una petición en curso: se bloquean los botones para no repetirla. */
  protected readonly busy = signal(false);
  protected readonly applying = signal(false);

  protected readonly pattern = signal('');
  protected readonly matchType = signal<RuleMatchType>('contains');
  protected readonly categoryKey = signal('');
  protected readonly priority = signal(0);
  protected readonly catKey = signal('');
  protected readonly catName = signal('');
  /** Mientras no se edite a mano, la clave se propone a partir del nombre. */
  private keyEdited = false;

  protected readonly patternProblem = computed(() =>
    patternError(this.matchType(), this.pattern()),
  );
  protected readonly keyProblem = computed(() =>
    categoryKeyError(
      this.catKey(),
      this.store.categories().map((c) => c.key),
    ),
  );

  protected readonly categoryOptions = computed(() =>
    this.store.categories().map((c) => ({ label: c.name, value: c.key })),
  );

  protected effectiveCategory(): string {
    return this.categoryKey() || this.store.categories()[0]?.key || '';
  }

  constructor() {
    effect(() => {
      this.bus.version();
      untracked(() =>
        this.api.rules().subscribe({
          next: (rules) => {
            this.rules.set(rules);
            this.rulesLoaded.set(true);
          },
          error: (error: unknown) => {
            this.rulesLoaded.set(true);
            this.show('error', apiErrorMessage(error));
          },
        }),
      );
    });
  }

  /** Un error puede quedar fuera de pantalla si se actuó abajo: se trae a la vista. Los avisos de éxito no mueven la página. */
  private show(kind: 'error' | 'notice', message: string): void {
    this.error.set(kind === 'error' ? message : '');
    this.notice.set(kind === 'notice' ? message : '');
    if (kind !== 'error') return;
    afterNextRender(
      () => this.host.nativeElement.querySelector('.alert')?.scrollIntoView({ block: 'nearest' }),
      { injector: this.injector },
    );
  }

  /** Lanza una petición bloqueando los botones; al terminar avisa de lo hecho y refresca las pantallas. */
  private run(request: Observable<unknown>, success: string, onSuccess?: () => void): void {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    request.subscribe({
      next: () => {
        onSuccess?.();
        this.busy.set(false);
        this.show('notice', success);
        this.bus.changed();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.show('error', apiErrorMessage(error));
      },
    });
  }

  protected addRule(event: Event): void {
    event.preventDefault();
    const pattern = this.pattern().trim();
    if (this.busy() || !pattern || this.patternProblem()) return;
    this.run(
      this.api.createRule({
        pattern,
        matchType: this.matchType(),
        categoryKey: this.effectiveCategory(),
        priority: this.priority(),
        active: true,
      }),
      `Regla «${pattern}» añadida. «Reaplicar» la usa con los movimientos sin categoría.`,
      () => this.pattern.set(''),
    );
  }

  protected toggle(rule: CategorizationRule, active: boolean): void {
    this.run(
      this.api.updateRule(rule.id, { active }),
      '', // el propio interruptor ya muestra el cambio
    );
  }

  protected remove(rule: CategorizationRule): void {
    this.run(this.api.deleteRule(rule.id), `Regla «${rule.pattern}» borrada.`);
  }

  protected apply(): void {
    this.error.set('');
    this.notice.set('');
    this.busy.set(true);
    this.applying.set(true);
    this.api.applyRules().subscribe({
      next: ({ updated }) => {
        this.busy.set(false);
        this.applying.set(false);
        this.show(
          'notice',
          updated === 0
            ? 'Ningún movimiento sin categoría coincide con las reglas.'
            : updated === 1
              ? '1 movimiento categorizado.'
              : `${updated} movimientos categorizados.`,
        );
        this.bus.changed();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.applying.set(false);
        this.show('error', apiErrorMessage(error));
      },
    });
  }

  protected onCatName(value: string): void {
    this.catName.set(value);
    if (!this.keyEdited) this.catKey.set(keyFromName(value));
  }

  protected onCatKey(value: string): void {
    this.catKey.set(value);
    // Vaciar la clave devuelve el control al nombre.
    this.keyEdited = value.trim() !== '';
  }

  protected addCategory(event: Event): void {
    event.preventDefault();
    const key = this.catKey().trim();
    const name = this.catName().trim();
    if (this.busy() || !key || !name || this.keyProblem()) return;
    this.run(this.api.createCategory({ key, name }), `Categoría «${name}» creada.`, () => {
      this.catKey.set('');
      this.catName.set('');
      this.keyEdited = false;
    });
  }

  protected removeCategory(key: string): void {
    this.run(this.api.deleteCategory(key), `Categoría «${this.store.categoryName(key)}» borrada.`);
  }
}
