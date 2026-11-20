import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { AddButton } from './add-button';
import { PageHeader } from './page-header';

@Component({
  imports: [PageHeader, AddButton],
  template: `
    <app-page-header title="T" [stretchActions]="stretch()">
      <app-add-button label="Nueva venta" [fillOnMobile]="fill()" />
    </app-page-header>
  `,
})
class Host {
  readonly stretch = signal(false);
  readonly fill = signal(false);
}

describe('PageHeader and AddButton phone layout', () => {
  it('opts in to stretched actions and filled add button, off by default', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.page-actions')!.classList.contains('stretch')).toBe(false);
    expect(root.querySelector('app-add-button')!.classList.contains('fill')).toBe(false);

    fixture.componentInstance.stretch.set(true);
    fixture.componentInstance.fill.set(true);
    fixture.detectChanges();
    expect(root.querySelector('.page-actions')!.classList.contains('stretch')).toBe(true);
    expect(root.querySelector('app-add-button')!.classList.contains('fill')).toBe(true);
  });
});
