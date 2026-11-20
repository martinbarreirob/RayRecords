import { AREAS, areaById, areaOf, navDirection, sectionOf } from './areas';

describe('sectionOf', () => {
  it('finds the section, including its sub-pages and ignoring the query', () => {
    expect(sectionOf('/listas')?.label).toBe('Listas');
    expect(sectionOf('/listas/compras?vista=tabla')?.url).toBe('/listas');
    expect(sectionOf('/gestion/stock')?.label).toBe('Stock');
  });

  it('returns nothing for an address that is not a section', () => {
    expect(sectionOf('/')).toBeUndefined();
    expect(sectionOf('/listas-viejas')).toBeUndefined();
    expect(sectionOf('/gestion')).toBeUndefined();
  });
});

describe('areaOf', () => {
  it('everything under /gestion is management', () => {
    expect(areaOf('/gestion')).toBe('gestion');
    expect(areaOf('/gestion/stock')).toBe('gestion');
    expect(areaOf('/gestion/stock?q=cable#top')).toBe('gestion');
  });

  it('the other sections, the root and the unknown are personal', () => {
    expect(areaOf('/notas')).toBe('personal');
    expect(areaOf('/listas/compras')).toBe('personal');
    expect(areaOf('/')).toBe('personal');
    expect(areaOf('/login')).toBe('personal');
  });

  it('a section that only starts with the word is not management', () => {
    expect(areaOf('/gestions')).toBe('personal');
  });
});

describe('AREAS', () => {
  it('each area home is one of its own sections', () => {
    for (const area of AREAS) {
      expect(area.sections.map((s) => s.url)).toContain(area.home);
    }
  });

  it('every section address belongs to the area that lists it', () => {
    for (const area of AREAS) {
      for (const section of area.sections) expect(areaOf(section.url)).toBe(area.id);
    }
  });

  it('areaById finds the area', () => {
    expect(areaById('gestion').label).toBe('Gestión');
  });
});

describe('navDirection', () => {
  it('goes forward or back along the tabs of the same area', () => {
    expect(navDirection('/notas', '/listas')).toBe('forward');
    expect(navDirection('/gastos', '/calendario')).toBe('back');
    expect(navDirection('/gestion/dashboard', '/gestion/tickets')).toBe('forward');
    expect(navDirection('/gestion/ventas', '/gestion/stock')).toBe('back');
  });

  it('just fades between areas, within one section and for unknown addresses', () => {
    expect(navDirection('/notas', '/gestion/dashboard')).toBe('fade');
    expect(navDirection('/gestion/stock', '/gastos')).toBe('fade');
    expect(navDirection('/listas', '/listas/compras')).toBe('fade');
    expect(navDirection('/', '/notas')).toBe('fade');
    expect(navDirection('/login', '/notas')).toBe('fade');
  });
});
