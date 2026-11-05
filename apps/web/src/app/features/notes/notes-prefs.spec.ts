import {
  HINTS_KEY,
  LOCK_KEY,
  readHintsOpen,
  readLayoutLocked,
  writeHintsOpen,
  writeLayoutLocked,
} from './notes-prefs';

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const broken = {
  getItem: () => {
    throw new Error('bloqueado');
  },
  setItem: () => {
    throw new Error('bloqueado');
  },
};

describe('preferencia de la barra de atajos', () => {
  it('por defecto está visible', () => {
    expect(readHintsOpen(memory())).toBe(true);
  });

  it('recuerda que se ocultó y que se volvió a mostrar', () => {
    const store = memory();

    writeHintsOpen(false, store);
    expect(store.data.get(HINTS_KEY)).toBe('0');
    expect(readHintsOpen(store)).toBe(false);

    writeHintsOpen(true, store);
    expect(readHintsOpen(store)).toBe(true);
  });

  it('sin almacenamiento (o si lanza) no falla y se queda visible', () => {
    expect(readHintsOpen(null)).toBe(true);
    expect(readHintsOpen(broken)).toBe(true);
    expect(() => writeHintsOpen(false, broken)).not.toThrow();
    expect(() => writeHintsOpen(false, null)).not.toThrow();
  });
});

describe('preferencia de bloqueo de la disposición', () => {
  it('por defecto está bloqueada', () => {
    expect(readLayoutLocked(memory())).toBe(true);
  });

  it('recuerda que se desbloqueó y que se volvió a bloquear', () => {
    const store = memory();

    writeLayoutLocked(false, store);
    expect(store.data.get(LOCK_KEY)).toBe('0');
    expect(readLayoutLocked(store)).toBe(false);

    writeLayoutLocked(true, store);
    expect(readLayoutLocked(store)).toBe(true);
  });

  it('sin almacenamiento (o si lanza) no falla y se queda bloqueada', () => {
    expect(readLayoutLocked(null)).toBe(true);
    expect(readLayoutLocked(broken)).toBe(true);
    expect(() => writeLayoutLocked(false, broken)).not.toThrow();
    expect(() => writeLayoutLocked(false, null)).not.toThrow();
  });
});
