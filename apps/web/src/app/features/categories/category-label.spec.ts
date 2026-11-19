import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import type { CategoryLook } from './category-badge';
import { CategoryLabel } from './category-label';
import { UNCATEGORIZED_LOOK } from './uncategorized';

@Component({
  imports: [CategoryLabel],
  template: `<app-category-label [look]="look" [name]="name" [plain]="plain" />`,
})
class Host {
  look: CategoryLook | null = null;
  name = 'Sin categoría';
  plain = false;
}

describe('CategoryLabel', () => {
  function render(setup: (host: Host) => void) {
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws the badge of the category with its name', () => {
    const el = render((host) => {
      host.look = { icon: 'car', color: '#e8effc', iconColor: '#1d4fb8' };
      host.name = 'Coche';
    });
    expect(el.querySelector('app-category-badge')).not.toBeNull();
    expect(el.querySelector('.name')?.textContent).toBe('Coche');
    const badge = el.querySelector<HTMLElement>('app-category-badge')!;
    expect(badge.style.backgroundColor).toBe('rgb(232, 239, 252)');
  });

  it('gives "Sin categoría" a badge of its own instead of leaving it bare', () => {
    const el = render(() => undefined);
    const badge = el.querySelector<HTMLElement>('app-category-badge');
    expect(badge).not.toBeNull();
    expect(badge!.style.color).toBe('rgb(180, 83, 9)');
    expect(badge!.querySelector('svg path')).not.toBeNull();
    expect(UNCATEGORIZED_LOOK.icon).toBe('help-circle');
  });

  it('leaves the badge out when it is plain, as in the "Todas" entry of a filter', () => {
    const el = render((host) => {
      host.plain = true;
      host.name = 'Todas';
    });
    expect(el.querySelector('app-category-badge')).toBeNull();
    expect(el.textContent?.trim()).toBe('Todas');
  });
});
