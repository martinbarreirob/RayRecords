import { describe, expect, it } from 'vitest';
import { isOriginAllowed } from './origin';

describe('isOriginAllowed', () => {
  it('skips safe methods', () => {
    expect(isOriginAllowed('GET', 'https://evil.example', 'app.ts.net')).toBe(true);
  });

  it('accepts requests without Origin (not from a browser)', () => {
    expect(isOriginAllowed('POST', undefined, 'app.ts.net')).toBe(true);
  });

  it('accepts the same host, with and without a port', () => {
    expect(isOriginAllowed('POST', 'https://app.ts.net', 'app.ts.net')).toBe(true);
    expect(isOriginAllowed('POST', 'http://localhost:4300', 'localhost:4300')).toBe(true);
  });

  it('rejects other hosts and malformed origins', () => {
    expect(isOriginAllowed('POST', 'https://evil.example', 'app.ts.net')).toBe(false);
    expect(isOriginAllowed('DELETE', 'null', 'app.ts.net')).toBe(false);
  });

  it('accepts origins from the explicit list', () => {
    expect(
      isOriginAllowed('PATCH', 'https://other.example', 'app.ts.net', ['https://other.example']),
    ).toBe(true);
  });
});
