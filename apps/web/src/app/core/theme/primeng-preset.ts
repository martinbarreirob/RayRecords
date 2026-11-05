import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * PrimeNG preset: starts from Aura and only sets the accent scale (charcoal grays). Surface, text and border
 * colors come from our tokens (styles/_primeng.scss), not from here, so there is a single source.
 */
export const RayRecordsPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#fafafa',
      100: '#f3f3f3',
      200: '#e4e4e4',
      300: '#cbcbcb',
      400: '#a1a1a1',
      500: '#686868',
      600: '#4a4a4a',
      700: '#2b2b2b',
      800: '#1c1c1c',
      900: '#121212',
      950: '#0a0a0a',
    },
  },
});
