import { Component, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthStore } from './core/auth/auth.store';
import { AREAS, areaById, areaOf, sectionOf, type AreaId } from './core/nav/areas';
import { adjacentSection } from './core/palette/go-shortcuts';
import { PaletteService } from './core/palette/palette.service';
import { ThemeService } from './core/theme/theme.service';
import { PAGE_SCROLLER_ID } from './core/ui/page-scroll';
import { CommandPalette } from './features/palette/command-palette';
import { Icon } from './core/ui/icon';

/** App shell: top navigation, command palette (only with a session) and the active screen. */
@Component({
  selector: 'app-root',
  imports: [Icon, RouterOutlet, RouterLink, RouterLinkActive, CommandPalette],
  host: { '(document:keydown)': 'onKeydown($event)' },
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthStore);
  protected readonly palette = inject(PaletteService);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  /** Two levels: the top bar picks the area and the second bar lists that area's sections. */
  protected readonly areas = AREAS;
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );
  protected readonly currentArea = computed(() => areaOf(this.url()));
  protected readonly sections = computed(() => areaById(this.currentArea()).sections);
  /** Last section visited in each area, so switching back returns to where you were. */
  private readonly lastSection = signal<Record<AreaId, string>>({
    personal: areaById('personal').home,
    gestion: areaById('gestion').home,
  });

  /** The user button, next to the search, opens a menu with the theme toggle and logout. */
  protected readonly menuOpen = signal(false);

  /** Where the area tab goes: the last section seen there, or its home the first time. */
  protected areaTarget(id: AreaId): string {
    return this.lastSection()[id];
  }

  /** The screens scroll inside `<main>`; the header above it never moves. */
  protected readonly scrollerId = PAGE_SCROLLER_ID;
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly path = computed(() => this.url().split(/[?#]/)[0] ?? '');

  constructor() {
    // A new screen starts at its top: the scroller is shared and would keep the old position.
    effect(() => {
      this.path();
      const content = this.content()?.nativeElement;
      if (content) content.scrollTop = 0;
    });

    effect(() => {
      const section = sectionOf(this.url());
      if (section) {
        const area = areaOf(section.url);
        this.lastSection.update((last) => ({ ...last, [area]: section.url }));
      }
    });

    // A tap anywhere outside the user button and the menu closes it. The listener exists only while the
    // menu is open, so ordinary clicks do not run any handler.
    effect((onCleanup) => {
      if (!this.menuOpen()) return;
      const close = (event: MouseEvent) => {
        if (!(event.target as Element | null)?.closest('.user-menu')) this.menuOpen.set(false);
      };
      document.addEventListener('click', close);
      onCleanup(() => document.removeEventListener('click', close));
    });
  }

  protected toggleTheme(): void {
    this.theme.toggle();
    this.menuOpen.set(false);
  }

  /** Stops using a fixed theme and follows the device again. */
  protected useSystemTheme(): void {
    this.theme.set('system');
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
