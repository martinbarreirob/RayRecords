import { DestroyRef, inject, signal, type Signal } from '@angular/core';

/** The phone layout, with the same breakpoint as the style files. */
export const PHONE_QUERY = '(width <= 767px)';

/**
 * Whether the window is a phone's, kept up to date while the component lives. It is `false` where
 * `matchMedia` does not exist (jsdom). Call it in an injection context, as a field initializer.
 */
export function injectIsPhone(): Signal<boolean> {
  const phone = signal(false);
  if (typeof matchMedia === 'function') {
    const query = matchMedia(PHONE_QUERY);
    const sync = () => phone.set(!!query?.matches);
    sync();
    query?.addEventListener?.('change', sync);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => query?.removeEventListener?.('change', sync));
  }
  return phone;
}

/** The user asked for less motion: animations are skipped or made instant. */
export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === 'function' && !!matchMedia('(prefers-reduced-motion: reduce)')?.matches
  );
}
