import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DEFAULT_TIME_ZONE,
  todayIn,
  type ImportBatch,
  type ImportResult,
} from '@rayrecords/shared';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { map, of, switchMap, tap, type Observable } from 'rxjs';
import { ApiClient } from '../../core/api/api-client';
import { apiErrorMessage } from '../../core/api/errors';
import { formatCents } from '../../core/format';
import { RefreshBus } from '../../core/refresh';
import { FinanceStore } from './finance.store';
import { fileProblem, formatFileSize } from './import-logic';
import { formatDay } from './movements-logic';

@Component({
  selector: 'app-import-panel',
  imports: [RouterLink, ConfirmDialogModule],
  providers: [ConfirmationService],
  styleUrl: './import-panel.scss',
  template: `
    <section class="card form" aria-labelledby="imp-title">
      <h2 id="imp-title">Importar extracto (CSV)</h2>
      <p class="muted intro">
        Elige el fichero del banco. Primero se ve una vista previa; los movimientos que ya existen
        se omiten, así que puedes reimportar extractos solapados sin miedo.
      </p>

      @if (!store.ready()) {
        <div aria-busy="true">
          <p class="sr-only" role="status">Cargando…</p>
          <div class="skel-in" aria-hidden="true">
            <div class="drop">
              <span class="skeleton circle ghost-icon"></span>
              <div class="drop-text">
                <span class="ghost-row"><span class="skeleton ghost-drop-title"></span></span>
                <span class="ghost-row small"><span class="skeleton ghost-drop-sub"></span></span>
              </div>
              <div class="drop-actions"><span class="skeleton ghost-btn"></span></div>
            </div>
            <div class="actions">
              <span class="step"><span class="skeleton ghost-step"></span></span>
              <span class="skeleton ghost-btn small"></span>
              <span class="skeleton ghost-btn small"></span>
            </div>
          </div>
        </div>
      } @else {
        <div
          class="drop"
          role="group"
          aria-label="Fichero del extracto"
          [class.dragging]="dragging()"
          [class.has-file]="!!file()"
          (dragover)="onDragOver($event)"
          (dragleave)="dragging.set(false)"
          (drop)="onDrop($event)"
        >
          <input
            #fileInput
            type="file"
            accept=".csv,text/csv"
            hidden
            (change)="pick($any($event.target).files)"
          />
          @if (file(); as current) {
            <i class="pi pi-file drop-icon" aria-hidden="true"></i>
            <div class="drop-text">
              <strong class="drop-name" [title]="current.name">{{ current.name }}</strong>
              <span class="muted">{{ size(current) }}</span>
            </div>
            <div class="drop-actions">
              <button type="button" class="btn sm" [disabled]="!!busy()" (click)="browse()">
                Cambiar
              </button>
              <button type="button" class="btn sm ghost" [disabled]="!!busy()" (click)="clear()">
                Quitar
              </button>
            </div>
          } @else {
            <i class="pi pi-upload drop-icon" aria-hidden="true"></i>
            <div class="drop-text">
              <strong>Extracto del banco (CSV)</strong>
              <span class="muted">Arrástralo aquí o elígelo desde tu dispositivo</span>
            </div>
            <div class="drop-actions">
              <button type="button" class="btn" (click)="browse()">Elegir fichero</button>
            </div>
          }
        </div>

        @if (error(); as message) {
          <p class="alert" role="alert">{{ message }}</p>
        }

        <div class="actions">
          <p class="step muted" aria-live="polite">{{ stepHint() }}</p>
          <button type="button" class="btn" [disabled]="!file() || !!busy()" (click)="run(true)">
            {{ busy() === 'preview' ? 'Leyendo…' : 'Vista previa' }}
          </button>
          <button
            type="button"
            class="btn primary"
            [disabled]="!file() || !!busy() || !previewed()"
            (click)="run(false)"
          >
            {{ busy() === 'import' ? 'Importando…' : 'Importar' }}
          </button>
        </div>
      }
    </section>

    @if (result(); as r) {
      <section class="card result" aria-live="polite" aria-labelledby="imp-result">
        <h2 id="imp-result">{{ r.dryRun ? 'Vista previa' : 'Importado' }} · {{ r.fileName }}</h2>
        <div class="stats">
          <span class="badge">{{ r.parsed }} leídos</span>
          <span class="badge success">
            {{ r.imported }} {{ r.dryRun ? 'nuevos' : 'importados' }}
          </span>
          <span class="badge">{{ r.skipped }} duplicados omitidos</span>
          <span class="badge" [class.warning]="r.uncategorized > 0">
            {{ r.uncategorized }} sin categoría
          </span>
        </div>

        @if (r.warnings.length) {
          <details class="warnings">
            <summary>{{ r.warnings.length }} avisos</summary>
            <ul>
              @for (warning of r.warnings; track $index) {
                <li>{{ warning }}</li>
              }
            </ul>
          </details>
        }

        <div class="scroll" tabindex="0" role="region" aria-label="Filas del extracto">
          <table class="table">
            <thead>
              <tr>
                <th scope="col">Fecha</th>
                <th scope="col">Descripción</th>
                <th scope="col" class="num">Importe</th>
                <th scope="col">Categoría</th>
                <th scope="col">Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (row of r.preview; track $index) {
                <tr [class.is-duplicate]="row.duplicate">
                  <td class="muted">{{ row.date }}</td>
                  <td class="desc" [title]="row.description">{{ row.description }}</td>
                  <td class="num" [class.positive]="row.amountCents > 0">
                    {{ money(row.amountCents) }}
                  </td>
                  <td>
                    <span class="badge" [class.warning]="row.category === null">
                      {{ store.categoryName(row.category) }}
                    </span>
                  </td>
                  <td>
                    <span class="badge" [class.success]="!row.duplicate">
                      {{ row.duplicate ? 'duplicado' : 'nuevo' }}
                    </span>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (r.parsed > r.preview.length) {
          <p class="muted note">Se muestran los primeros {{ r.preview.length }} movimientos.</p>
        }
        @if (!r.dryRun) {
          <p class="done">
            @if (r.uncategorized > 0) {
              <a class="btn sm primary" routerLink="/gastos" [queryParams]="{ vista: 'revisar' }">
                Revisar {{ r.uncategorized }} sin categoría
              </a>
            }
            <a class="btn sm" routerLink="/gastos">Ver movimientos</a>
          </p>
        }
      </section>
    }

    <section class="card batches" aria-labelledby="imp-history">
      <h2 id="imp-history">Importaciones anteriores</h2>
      @if (!batchesLoaded()) {
        <div aria-busy="true">
          <p class="sr-only" role="status">Cargando importaciones anteriores…</p>
          <ul class="skel-in" aria-hidden="true">
            @for (width of ghostBatches; track $index) {
              <li>
                <span class="skeleton ghost-batch-date"></span>
                <span class="batch-name"
                  ><span class="skeleton ghost-batch-name" [style.width.%]="width"></span
                ></span>
                <span class="skeleton pill ghost-batch-badge"></span>
                <span class="skeleton ghost-batch-btn"></span>
              </li>
            }
          </ul>
        </div>
      } @else if (batches().length) {
        <ul>
          @for (batch of batches(); track batch.id) {
            <li>
              <span class="muted num batch-date">{{ batchDate(batch) }}</span>
              <span class="batch-name" [title]="batch.fileName">{{ batch.fileName }}</span>
              <span class="badge">{{ batch.imported }} movimientos</span>
              <button
                type="button"
                class="btn sm danger"
                [attr.aria-label]="'Deshacer la importación de ' + batch.fileName"
                [disabled]="!!busy()"
                (click)="undo(batch)"
              >
                Deshacer
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="empty">Todavía no has importado ningún extracto.</p>
      }
    </section>

    <p-confirmdialog defaultFocus="reject" [style]="{ width: 'min(440px, calc(100vw - 32px))' }" />
  `,
})
export class ImportPanel {
  private readonly api = inject(ApiClient);
  private readonly bus = inject(RefreshBus);
  private readonly confirmation = inject(ConfirmationService);
  protected readonly store = inject(FinanceStore);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');

  protected readonly money = formatCents;
  protected readonly file = signal<File | null>(null);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly batches = signal<ImportBatch[]>([]);
  /** Ya llegó el historial (o falló): antes de eso no se puede decir que no hay importaciones. */
  protected readonly batchesLoaded = signal(false);
  protected readonly ghostBatches = [64, 48, 72];
  protected readonly error = signal('');
  /** Qué petición está en curso: la vista previa o la importación de verdad. */
  protected readonly busy = signal<'preview' | 'import' | null>(null);
  protected readonly dragging = signal(false);
  /** Solo se puede importar tras ver la vista previa del fichero seleccionado. */
  protected readonly previewed = signal(false);
  private readonly currentYear = Number(todayIn(DEFAULT_TIME_ZONE).slice(0, 4));

  /** Qué toca hacer ahora, para que el orden «vista previa → importar» no sea un misterio. */
  protected readonly stepHint = computed(() => {
    if (!this.file()) return 'Elige un fichero para empezar.';
    if (!this.previewed()) return 'Mira la vista previa primero: no guarda nada.';
    return 'Todo listo. Revisa la vista previa y pulsa Importar.';
  });

  constructor() {
    effect(() => {
      this.bus.version();
      untracked(() =>
        this.api.imports().subscribe({
          next: (batches) => {
            this.batches.set(batches);
            this.batchesLoaded.set(true);
          },
          error: (error: unknown) => {
            this.batchesLoaded.set(true);
            this.error.set(apiErrorMessage(error));
          },
        }),
      );
    });
  }

  protected size(file: File): string {
    return formatFileSize(file.size);
  }

  protected batchDate(batch: ImportBatch): string {
    return formatDay(batch.createdAt.slice(0, 10), this.currentYear);
  }

  protected browse(): void {
    this.fileInput()?.nativeElement.click();
  }

  protected clear(): void {
    this.setFile(null);
  }

  protected pick(files: FileList | null): void {
    this.setFile(files?.item(0) ?? null);
  }

  protected onDragOver(event: DragEvent): void {
    // Sin esto el navegador abriría el fichero en la pestaña en lugar de dejarlo caer aquí.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.busy()) return;
    this.setFile(event.dataTransfer?.files?.item(0) ?? null);
  }

  private setFile(file: File | null): void {
    this.resetInput();
    this.result.set(null);
    this.previewed.set(false);
    const problem = file ? fileProblem(file) : null;
    this.error.set(problem ?? '');
    this.file.set(problem ? null : file);
  }

  /** Vaciar el campo permite volver a elegir el mismo fichero y que `change` se dispare. */
  private resetInput(): void {
    const input = this.fileInput()?.nativeElement;
    if (input) input.value = '';
  }

  /**
   * Hay una sola cuenta: se usa la primera y, si todavía no existe, se crea al importar por primera vez.
   */
  private accountId(): Observable<string> {
    const existing = this.store.accounts()?.find((a) => !a.archived) ?? this.store.accounts()?.[0];
    if (existing) return of(existing.id);
    return this.api
      .createAccount({
        name: 'Cuenta',
        type: 'checking',
        currency: 'EUR',
        openingBalanceCents: 0,
        openingDate: todayIn(DEFAULT_TIME_ZONE),
      })
      .pipe(
        tap(() => this.store.load()),
        map((account) => account.id),
      );
  }

  protected run(dryRun: boolean): void {
    const file = this.file();
    if (!file || this.busy()) return;
    this.busy.set(dryRun ? 'preview' : 'import');
    this.error.set('');
    this.accountId()
      .pipe(switchMap((accountId) => this.api.importStatement(accountId, file, dryRun)))
      .subscribe({
        next: (result) => {
          this.result.set(result);
          this.busy.set(null);
          if (dryRun) {
            this.previewed.set(true);
          } else {
            // Importado: el fichero ya está dentro; se suelta para no repetirlo por error.
            this.previewed.set(false);
            this.file.set(null);
            this.resetInput();
            this.bus.changed();
          }
        },
        error: (error: unknown) => {
          this.error.set(apiErrorMessage(error));
          this.busy.set(null);
        },
      });
  }

  protected undo(batch: ImportBatch): void {
    this.confirmation.confirm({
      header: 'Deshacer importación',
      message: `¿Deshacer la importación de «${batch.fileName}»? Se borrarán sus ${batch.imported} movimientos.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Deshacer',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonStyleClass: 'p-button-secondary p-button-text',
      defaultFocus: 'reject',
      accept: () =>
        this.api.undoImport(batch.id).subscribe({
          next: () => this.bus.changed(),
          error: (error: unknown) => this.error.set(apiErrorMessage(error)),
        }),
    });
  }
}
