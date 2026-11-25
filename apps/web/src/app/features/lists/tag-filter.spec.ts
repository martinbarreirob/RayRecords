import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TestBed } from '@angular/core/testing';
import { SelectModule } from 'primeng/select';

/** The label filter of a list: PrimeNG reads the `item` and `selectedItem` template references. */
@Component({
  imports: [SelectModule, FormsModule],
  template: `
    <p-select [options]="tags" [ngModel]="'web'" appendTo="body">
      <ng-template #selectedItem let-label>
        <span class="tag-chip">{{ label }}</span>
      </ng-template>
      <ng-template #item let-label>
        <span class="tag-chip">{{ label }}</span>
      </ng-template>
    </p-select>
  `,
})
class Host {
  tags = ['web', 'cliente'];
}

describe('label filter', () => {
  beforeEach(() => {
    // The overlay of the select asks for it; the test environment has none.
    window.matchMedia ??= (() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });

  it('shows the chosen label and the options as label chips', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.tag-chip')!.textContent).toContain('web');
    root.querySelector<HTMLElement>('.p-select')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const options = [...document.body.querySelectorAll('.p-select-option .tag-chip')];
    expect(options.map((o) => o.textContent!.trim())).toEqual(['web', 'cliente']);
  });
});
