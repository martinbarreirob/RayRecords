import { Component, input, output } from '@angular/core';
import { completion, type PrefixOption } from '../capture/capture-prefix';
import type { CapturePreview } from '../capture/capture-preview';

/** What is shown after saving: what was added, where to see it and how to undo it. */
export interface CaptureFeedback {
  message: string;
  /** Screen where the saved item is; `null` if unknown (or after undo). */
  link: string | null;
  /** What was just saved can be deleted. */
  canUndo: boolean;
}

/** Examples for the capture mode help (what is typed and what it does). */
const EXAMPLES: readonly { text: string; effect: string }[] = [
  { text: 'compra: leche semidesnatada', effect: 'se añade a la lista con ese prefijo' },
  { text: 'mañana: llamar al dentista', effect: 'tarea con fecha (también hoy:)' },
  { text: 'peli: Dune #scifi', effect: 'con #etiquetas, @categoría, 89€ y enlaces' },
  { text: 'una idea suelta', effect: 'sin prefijo, tarjeta suelta en el lienzo' },
];

/**
 * Visible part of the "write a note or task" palette mode: the preview of what will be saved and
 * where, the error notice, the confirmation of what was saved, the prefix suggestions and the help
 * with examples. It saves nothing: it only draws what the palette gives it and reports what was chosen.
 */
@Component({
  selector: 'app-palette-capture',
  styleUrl: './palette-capture.scss',
  templateUrl: './palette-capture.html',
})
export class PaletteCapture {
  readonly preview = input<CapturePreview | null>(null);
  readonly suggestions = input<readonly PrefixOption[]>([]);
  readonly prefixes = input<readonly PrefixOption[]>([]);
  readonly feedback = input<CaptureFeedback | null>(null);
  readonly error = input('');
  readonly saving = input(false);

  readonly picked = output<PrefixOption>();
  readonly submitted = output<void>();
  readonly undone = output<void>();
  readonly opened = output<string>();

  protected readonly examples = EXAMPLES;

  /** "compra:", as typed and shown. */
  protected completion(option: PrefixOption): string {
    return completion(option).trim();
  }
}
