import { NgTemplateOutlet } from '@angular/common';
import { Component, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from './core/auth/auth.store';
import { adjacentSection } from './core/palette/go-shortcuts';
import { PaletteService } from './core/palette/palette.service';
import { ThemeService } from './core/theme/theme.service';
import { CommandPalette } from './features/palette/command-palette';

/** App shell: top navigation, command palette (only with a session) and the active screen. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, CommandPalette],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthStore);
  protected readonly palette = inject(PaletteService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  /** On a phone the brand opens a menu with the theme toggle and logout. */
  protected readonly isMobile = signal(false);
  protected readonly menuOpen = signal(false);

  constructor() {
    // `matchMedia` does not exist in jsdom (tests); the layout stays the desktop one there.
    const query = window.matchMedia?.('(width <= 767px)');
    if (query) {
      this.isMobile.set(query.matches);
      query.addEventListener('change', (event) => {
        this.isMobile.set(event.matches);
        this.menuOpen.set(false);
      });
    }

    // A tap anywhere outside the brand and the menu closes it. The listener exists only while the
    // menu is open, so ordinary clicks do not run any handler.
    effect((onCleanup) => {
      if (!this.menuOpen()) return;
      const close = (event: MouseEvent) => {
        if (!(event.target as Element | null)?.closest('.start')) this.menuOpen.set(false);
      };
      document.addEventListener('click', close);
      onCleanup(() => document.removeEventListener('click', close));
    });
  }

  protected toggleTheme(): void {
    this.theme.toggle();
    this.menuOpen.set(false);
  }

  protected logout(): void {
    this.menuOpen.set(false);
    // On a network error the UI is left anyway; the session expires on its own on the server.
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/login']),
      error: () => void this.router.navigate(['/login']),
    });
  }

  /** Ctrl+K (Cmd+K on Mac) toggles the command palette from any screen. */
  protected onKeydown(event: KeyboardEvent): void {
    if (!this.auth.user()) return;
    if (event.key === 'Escape' && this.menuOpen()) {
      this.menuOpen.set(false);
      return;
    }
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
