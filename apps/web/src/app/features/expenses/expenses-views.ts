import type { Router } from '@angular/router';

export type View = 'review' | 'movements' | 'import' | 'rules';

/** The views of the expenses page; the slug is what `?vista=` carries. */
export const VIEWS: readonly { id: View; slug: string; label: string }[] = [
  { id: 'movements', slug: 'movimientos', label: 'Movimientos' },
  { id: 'review', slug: 'revisar', label: 'Revisar' },
  { id: 'import', slug: 'importar', label: 'Importar' },
  { id: 'rules', slug: 'reglas', label: 'Reglas' },
];

/**
 * Goes to a view by changing `?vista=` only (the movements are the page without it). The tabs of
 * the page and the shortcuts inside a panel both use it.
 */
export function showView(router: Router, slug: string): void {
  void router.navigate([], {
    queryParams: { vista: slug === 'movimientos' ? null : slug },
    queryParamsHandling: 'merge',
    replaceUrl: true,
  });
}
