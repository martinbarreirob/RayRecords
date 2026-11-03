import type { CaptureResult, List } from '@rayrecords/shared';

const euros = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

/** Resumen legible de cómo se ha interpretado una captura, para mostrarlo mientras se escribe. */
export function describeCapture(result: CaptureResult, lists: readonly List[] | null): string {
  switch (result.kind) {
    case 'empty':
      return result.reason === 'no_title' ? 'Falta el título' : '';
    case 'daily_note':
      return `Nota del día ${result.date}`;
    case 'item': {
      const listName =
        lists?.find((list) => list.captureAlias === result.list)?.name ?? result.list;
      const parts = [`${listName}: ${result.title}`];
      if (result.dueDate) parts.push(`para el ${result.dueDate}`);
      if (result.tags.length) parts.push(result.tags.map((tag) => `#${tag}`).join(' '));
      if (result.category) parts.push(`@${result.category}`);
      if (result.priceCents !== undefined) parts.push(euros.format(result.priceCents / 100));
      if (result.url) parts.push('con enlace');
      return parts.join(' · ');
    }
  }
}
