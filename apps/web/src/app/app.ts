import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth/auth.store';
import { adjacentSection } from './core/palette/go-shortcuts';
import { PaletteService } from './core/palette/palette.service';
import { ThemeService } from './core/theme/theme.service';
import { CommandPalette } from './features/palette/command-palette';

/** App shell: top navigation, command palette (only with a session) and the active screen. */
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
    // On a network error the UI is left anyway; the session expires on its own on the server.
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login']),
    });
  }

  /** Ctrl+K (Cmd+K on Mac) toggles the command palette from any screen. */
  protected onKeydown(event: KeyboardEvent): void {
    if (!this.auth.user()) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.palette.toggle();
      return;
    }
    // Alt+Left / Alt+Right walk the sections in navbar order. They replace the browser back/forward,
    // which jumped through the history.
    const plainAlt = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
    if (plainAlt && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      if (this.palette.isOpen() || document.querySelector('[aria-modal="true"]')) return;
      const target = adjacentSection(this.router.url, event.key === 'ArrowRight' ? 1 : -1);
      if (target) void this.router.navigateByUrl(target);
    }
  }
}
