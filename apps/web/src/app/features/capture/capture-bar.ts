import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { parseQuickCapture } from '@rayrecords/shared';
import { ListsStore } from '../lists/lists.store';
import { describeCapture } from './capture-preview';

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)
  );
}

/** Campo de captura rápida, visible en todas las pantallas. Atajos: Ctrl/Cmd+K o «/». */
@Component({
  selector: 'app-capture-bar',
  host: { '(document:keydown)': 'onGlobalKeydown($event)' },
  template: `
    <form (submit)="submit($event)">
      <label for="capture-input">Captura rápida</label>
      <input
        #field
        id="capture-input"
        type="text"
        autocomplete="off"
        placeholder="peli: título #tag · compra: título @categoría 89€ · hoy: tarea"
        [value]="text()"
        (input)="onInput(field.value)"
      />
      <small>Ctrl+K o /</small>
    </form>
    <p aria-live="polite">{{ feedback() }}</p>
  `,
})
export class CaptureBar {
  private readonly store = inject(ListsStore);
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  protected readonly text = signal('');
  private readonly status = signal('');

  private readonly result = computed(() =>
    parseQuickCapture(this.text(), { aliases: this.store.aliases() }),
  );
  protected readonly feedback = computed(
    () => this.status() || describeCapture(this.result(), this.store.lists()),
  );

  protected onInput(value: string): void {
    this.text.set(value);
    this.status.set('');
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const result = this.result();
    if (result.kind === 'empty') return;
    // Pendiente: enviar a la API (POST /api/capture). Hasta entonces solo se interpreta.
    this.status.set(
      `Entendido → ${describeCapture(result, this.store.lists())} (aún sin guardar: falta conectar la API)`,
    );
    this.text.set('');
  }

  protected onGlobalKeydown(event: KeyboardEvent): void {
    const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
    const isSlash =
      event.key === '/' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !isEditable(event.target);
    if (!isShortcut && !isSlash) return;

    event.preventDefault();
    const input = this.field().nativeElement;
    input.focus();
    input.select();
  }
}
