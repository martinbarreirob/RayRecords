import { fileProblem, formatFileSize, isCsvFile } from './import-logic';

describe('formatFileSize', () => {
  it('usa la unidad que toca', () => {
    expect(formatFileSize(842)).toBe('842 B');
    expect(formatFileSize(12_400)).toBe('12,4 kB');
    expect(formatFileSize(1_300_000)).toBe('1,3 MB');
  });
});

describe('isCsvFile', () => {
  it('acepta por extensión (sin mirar mayúsculas) o por tipo', () => {
    expect(isCsvFile({ name: 'extracto.CSV', type: '' })).toBe(true);
    expect(isCsvFile({ name: 'datos', type: 'text/csv' })).toBe(true);
    expect(isCsvFile({ name: 'foto.png', type: 'image/png' })).toBe(false);
  });
});

describe('fileProblem', () => {
  it('rechaza lo que no es CSV y lo vacío', () => {
    expect(fileProblem({ name: 'a.pdf', type: 'application/pdf', size: 10 })).toMatch(
      /no es un CSV/,
    );
    expect(fileProblem({ name: 'a.csv', type: 'text/csv', size: 0 })).toMatch(/vacío/);
    expect(fileProblem({ name: 'a.csv', type: 'text/csv', size: 10 })).toBeNull();
  });
});
