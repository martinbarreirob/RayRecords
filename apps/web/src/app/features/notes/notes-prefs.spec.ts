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
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('shortcut bar preference', () => {
  it('it is visible by default', () => {
    expect(readHintsOpen(memory())).toBe(true);
  });

  it('remembers it was hidden and shown again', () => {
    const store = memory();

    writeHintsOpen(false, store);
    expect(store.data.get(HINTS_KEY)).toBe('0');
    expect(readHintsOpen(store)).toBe(false);

    writeHintsOpen(true, store);
    expect(readHintsOpen(store)).toBe(true);
  });

  it('without storage (or if it throws) it does not fail and stays visible', () => {
    expect(readHintsOpen(null)).toBe(true);
    expect(readHintsOpen(broken)).toBe(true);
    expect(() => writeHintsOpen(false, broken)).not.toThrow();
    expect(() => writeHintsOpen(false, null)).not.toThrow();
  });
});

describe('layout lock preference', () => {
  it('it is locked by default', () => {
    expect(readLayoutLocked(memory())).toBe(true);
  });

  it('remembers it was unlocked and locked again', () => {
    const store = memory();

    writeLayoutLocked(false, store);
    expect(store.data.get(LOCK_KEY)).toBe('0');
    expect(readLayoutLocked(store)).toBe(false);

    writeLayoutLocked(true, store);
    expect(readLayoutLocked(store)).toBe(true);
  });

  it('without storage (or if it throws) it does not fail and stays locked', () => {
    expect(readLayoutLocked(null)).toBe(true);
    expect(readLayoutLocked(broken)).toBe(true);
    expect(() => writeLayoutLocked(false, broken)).not.toThrow();
    expect(() => writeLayoutLocked(false, null)).not.toThrow();
  });
});
