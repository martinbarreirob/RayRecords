import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth/auth.store';
import { adjacentSection } from './core/palette/go-shortcuts';
import { PaletteService } from './core/palette/palette.service';
import { ThemeService } from './core/theme/theme.service';
import { CommandPalette } from './features/palette/command-palette';

/** Shell de la aplicación: navegación superior ligera, captura rápida (solo con sesión) y la pantalla activa. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommandPalette],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthStore);
  protected readonly palette = inject(PaletteService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected logout(): void {
    // Con error de red también se sale de la UI; la sesión caducará sola en el servidor.
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login']),
    });
  }

  /** Ctrl+K (Cmd+K en Mac) abre y cierra la paleta de comandos desde cualquier pantalla. */
  protected onKeydown(event: KeyboardEvent): void {
    if (!this.auth.user()) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.palette.toggle();
      return;
    }
    // Alt+← / Alt+→ recorren las secciones en el orden de la barra (Notas, Listas, Calendario, Gastos,
    // Gastos). Sustituyen al «atrás/adelante» del navegador, que saltaba por el historial.
    const plainAlt = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (plainAlt && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      if (this.palette.isOpen() || document.querySelector('[aria-modal="true"]')) return;
      const target = adjacentSection(this.router.url, event.key === 'ArrowRight' ? 1 : -1);
      if (target) void this.router.navigateByUrl(target);
    }
  }
}
