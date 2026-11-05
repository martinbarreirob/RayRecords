import { Component, input, output } from '@angular/core';
import { completion, type PrefixOption } from '../capture/capture-prefix';
import type { CapturePreview } from '../capture/capture-preview';

/** Lo que se enseña tras guardar: qué se añadió, adónde ir a verlo y cómo deshacerlo. */
export interface CaptureFeedback {
  message: string;
  /** Pantalla donde está lo guardado; `null` si no se sabe (o tras deshacer). */
  link: string | null;
  /** Se puede borrar lo que se acaba de guardar. */
  canUndo: boolean;
}

/** Ejemplos de la ayuda del modo captura (lo que se escribe y qué hace). */
const EXAMPLES: readonly { text: string; effect: string }[] = [
  { text: 'compra: leche semidesnatada', effect: 'se añade a la lista con ese prefijo' },
  { text: 'mañana: llamar al dentista', effect: 'tarea con fecha (también hoy:)' },
  { text: 'peli: Dune #scifi', effect: 'con #etiquetas, @categoría, 89€ y enlaces' },
  { text: 'una idea suelta', effect: 'sin prefijo, tarjeta suelta en el lienzo' },
];

/**
 * Parte visible del modo «escribir una nota o tarea» de la paleta: la vista previa de lo que se va a
 * guardar y adónde, el aviso de errores, la confirmación de lo guardado, las sugerencias de prefijo y
 * la ayuda con ejemplos. No guarda nada: solo pinta lo que le da la paleta y le avisa de lo elegido.
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

  /** «compra:», como se escribe y se enseña. */
  protected completion(option: PrefixOption): string {
    return completion(option).trim();
  }
}
