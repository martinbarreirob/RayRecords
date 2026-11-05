import { Component, input, output } from '@angular/core';

/** Round «done» checkbox. On mobile it looks 22 px but the touch area is 44 px. */
@Component({
  selector: 'app-note-check',
  styles: `
    :host {
      display: flex;
      flex: none;
      margin-top: 1px;
    }

    .check {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: 1.5px solid var(--muted);
      border-radius: 50%;
      background: transparent;
      color: var(--on-accent);
      font-size: 11px;
      line-height: 1;
      cursor: pointer;
      transition:
        background-color 0.12s,
        border-color 0.12s;
    }

    .check:hover {
      border-color: var(--accent);
    }

    .check.on {
      border-color: var(--accent);
      background: var(--accent);
    }

    .check.on:hover {
      border-color: var(--accent-hover);
      background: var(--accent-hover);
    }

    @media (width <= 767px) {
      :host {
        margin-top: 0;
      }

      .check {
        width: 22px;
        height: 22px;
        font-size: 12px;
      }

      .check::after {
        content: '';
        position: absolute;
        inset: -13px;
      }
    }
  `,
  template: `
    <button
      type="button"
      class="check"
      role="checkbox"
      [class.on]="checked()"
      [attr.aria-checked]="checked()"
      [attr.aria-label]="label()"
      (pointerdown)="$event.stopPropagation()"
      (dblclick)="$event.stopPropagation()"
      (click)="toggled.emit()"
    >
      @if (checked()) {
        <span aria-hidden="true">✓</span>
      }
    </button>
  `,
})
export class NoteCheck {
  readonly checked = input(false);
  readonly label = input('Hecha');
  readonly toggled = output<void>();
}
