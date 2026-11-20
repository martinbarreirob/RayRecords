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
import { DomSanitizer } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import {
  EMPTY_SHOP,
  PAPER_WIDTHS,
  buildReceipt,
  type PaperWidth,
  type ReceiptShop,
  type Ticket,
} from '@rayrecords/shared';
import { ConfirmationService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { imageToLogo } from '../../../core/print/logo';
import { PrintSettingsStore } from '../../../core/print/print-settings';
import { receiptHtml } from '../../../core/print/receipt-html';
import { RECEIPT_FORMAT } from '../../../core/print/ticket-printer';

/** What the preview shows the receipt with: made up, so editing never needs a real ticket. */
const SAMPLE_TICKET: Ticket = {
  id: '0'.repeat(24),
  number: 128,
  lines: [
    { productId: '1'.repeat(24), name: 'Café con leche', quantity: 2, unitPriceCents: 150 },
    { productId: '2'.repeat(24), name: 'Tostada con tomate', quantity: 1, unitPriceCents: 220 },
    { productId: '3'.repeat(24), name: 'Agua mineral 50 cl', quantity: 1, unitPriceCents: 100 },
  ],
  totalCents: 620,
  createdAt: new Date().toISOString(),
};

/** Printable width of each roll in mm, plus a little air for the preview's frame. */
const PREVIEW_MM: Record<PaperWidth, number> = { 58: 56, 80: 80 };

/**
 * The content of the receipts of this device: the logo, the title (name of the business), the
 * address, the tax id and the closing line, and the width of the roll. A preview shows the receipt
 * as it will print. Saved in the browser.
 */
@Component({
  selector: 'app-print-settings-dialog',
  imports: [DialogModule, FormsModule],
  styles: `
    .body {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-5);
      align-items: start;
    }

    form {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }

    .logo-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }

    .logo-thumb {
      max-width: 96px;
      max-height: 48px;
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
    }

    .hint {
      margin: 0;
      color: var(--muted);
      font-size: var(--text-xs);
    }

    .preview {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .preview h3 {
      margin: 0;
      color: var(--muted);
      font-size: var(--text-sm);
      font-weight: 500;
    }

    iframe {
      height: 420px;
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      background: #fff;
    }

    .foot {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      width: 100%;
    }

    @media (width <= 767px) {
      .body {
        grid-template-columns: 1fr;
      }

      .preview {
        min-width: 0;
        align-items: center;
      }

      iframe {
        max-width: 100%;
      }

      .logo-row .btn {
        min-height: var(--control-height);
      }

      .foot .btn {
        flex: 1;
      }
    }
  `,
  template: `
    <p-dialog
      header="Contenido del ticket"
      [visible]="open()"
      (visibleChange)="$event || closed.emit()"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: 'min(820px, 94vw)' }"
      [breakpoints]="{ '767px': '100vw' }"
      styleClass="print-settings-dialog"
    >
      <div class="body">
        <form id="print-settings-form" (ngSubmit)="save()">
          <div class="field">
            <span id="ticket-logo">Logo</span>
            <div class="logo-row">
              @if (draft().logo) {
                <img class="logo-thumb" alt="Logo actual" [src]="draft().logo" />
              }
              <label class="btn sm">
                {{ draft().logo ? 'Cambiar logo' : 'Elegir logo' }}
                <input
                  class="sr-only"
                  type="file"
                  accept="image/*"
                  aria-labelledby="ticket-logo"
                  (change)="pickLogo($event)"
                />
              </label>
              @if (draft().logo) {
                <button type="button" class="btn ghost sm" (click)="patch({ logo: '' })">
                  Quitar logo
                </button>
              }
            </div>
            @if (logoError(); as message) {
              <p class="alert" role="alert">{{ message }}</p>
            }
          </div>
          <label class="field">
            <span>Título</span>
            <input
              class="input"
              name="name"
              autocomplete="off"
              placeholder="Nombre del negocio"
              [ngModel]="draft().name"
              (ngModelChange)="patch({ name: $event })"
            />
          </label>
          <label class="field">
            <span>Dirección y datos del local</span>
            <input
              class="input"
              name="address"
              autocomplete="off"
              placeholder="Calle, ciudad, teléfono"
              [ngModel]="draft().address"
              (ngModelChange)="patch({ address: $event })"
            />
          </label>
          <label class="field">
            <span>NIF</span>
            <input
              class="input"
              name="taxId"
              autocomplete="off"
              [ngModel]="draft().taxId"
              (ngModelChange)="patch({ taxId: $event })"
            />
          </label>
          <label class="field">
            <span>Mensaje al pie</span>
            <input
              class="input"
              name="footer"
              autocomplete="off"
              placeholder="Gracias por su compra"
              [ngModel]="draft().footer"
              (ngModelChange)="patch({ footer: $event })"
            />
          </label>
          <div class="field">
            <span id="print-width">Ancho del papel</span>
            <div class="segmented" role="group" aria-labelledby="print-width">
              @for (option of widths; track option) {
                <button
                  type="button"
                  [attr.aria-pressed]="width() === option"
                  (click)="width.set(option)"
                >
                  {{ option }} mm
                </button>
              }
            </div>
          </div>
          <p class="hint">
            Se guarda en este navegador. Elige la impresora térmica en el diálogo de impresión; para
            que no aparezca cada vez, abre Chrome con el parámetro --kiosk-printing.
          </p>
        </form>

        <div class="preview">
          <h3>Vista previa</h3>
          <iframe
            title="Vista previa del ticket"
            [style.width.mm]="previewWidth()"
            [srcdoc]="preview()"
          ></iframe>
        </div>
      </div>

      <ng-template #footer>
        <div class="foot">
          <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
          <button type="submit" form="print-settings-form" class="btn primary">Guardar</button>
        </div>
      </ng-template>
    </p-dialog>
  `,
})
export class PrintSettingsDialog {
  private readonly store = inject(PrintSettingsStore);
  private readonly confirmation = inject(ConfirmationService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly widths = PAPER_WIDTHS;
  protected readonly draft = signal<ReceiptShop>(EMPTY_SHOP);
  protected readonly width = signal<PaperWidth>(80);
  protected readonly logoError = signal('');
  protected readonly previewWidth = computed(() => PREVIEW_MM[this.width()]);

  /** The receipt as it would print with what is typed so far (trusted: it is built here, escaped). */
  protected readonly preview = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      receiptHtml(buildReceipt(SAMPLE_TICKET, this.draft()), this.width(), RECEIPT_FORMAT),
    ),
  );

  constructor() {
    // Each opening starts from what is saved, not from what a cancelled one left typed.
    effect(() => {
      if (!this.open()) return;
      untracked(() => {
        const { shop, width } = this.store.settings();
        this.draft.set(shop);
        this.width.set(width);
        this.logoError.set('');
      });
    });
  }

  protected patch(changes: Partial<ReceiptShop>): void {
    this.draft.update((shop) => ({ ...shop, ...changes }));
  }

  protected async pickLogo(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.patch({ logo: await imageToLogo(file) });
      this.logoError.set('');
    } catch (error) {
      this.logoError.set(error instanceof Error ? error.message : 'No se pudo usar la imagen.');
    }
  }

  /** Asks before overwriting the receipt format: it is what every ticket will print. */
  protected save(): void {
    this.confirmation.confirm({
      header: 'Guardar formato de ticket',
      message:
        'Los tickets que imprimas a partir de ahora usarán este formato. ¿Guardar los cambios?',
      icon: 'pi pi-question-circle',
      acceptLabel: 'Guardar',
      rejectLabel: 'Cancelar',
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => {
        this.store.save({ shop: this.draft(), width: this.width() });
        this.closed.emit();
      },
    });
  }
}
