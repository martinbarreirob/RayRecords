import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from './origin';

describe('isOriginAllowed', () => {
  it('no comprueba los métodos seguros', () => {
    expect(isOriginAllowed('GET', 'https://malo.example', 'app.ts.net')).toBe(true);
  });

  it('acepta peticiones sin Origin (no vienen de un navegador)', () => {
    expect(isOriginAllowed('POST', undefined, 'app.ts.net')).toBe(true);
  });

  it('acepta el mismo host, con y sin puerto', () => {
    expect(isOriginAllowed('POST', 'https://app.ts.net', 'app.ts.net')).toBe(true);
    expect(isOriginAllowed('POST', 'http://localhost:4300', 'localhost:4300')).toBe(true);
  });

  it('rechaza otro host y orígenes mal formados', () => {
    expect(isOriginAllowed('POST', 'https://malo.example', 'app.ts.net')).toBe(false);
    expect(isOriginAllowed('DELETE', 'null', 'app.ts.net')).toBe(false);
  });

  it('acepta los orígenes de la lista explícita', () => {
    expect(
      isOriginAllowed('PATCH', 'https://otro.example', 'app.ts.net', ['https://otro.example']),
    ).toBe(true);
  });
});
