import { DONE_VISIBLE_MS, type NoteBoard, type NoteCard, type NoteGroup } from '@rayrecords/shared';
import { ObjectId } from 'mongodb';
import { afterAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/harness';
import { listBoard, listDone } from './service';
import { migrateDailyNotes } from './migrate';

const h = await createHarness();

describe.skipIf(!h)('notas como tarjetas (integración)', () => {
  const { call } = h ?? ({} as Harness);
  const collections = h?.database.collections;

  afterAll(async () => {
    await h?.close();
  });

  const board = async () => (await call('GET', '/note-cards')).body as NoteBoard;

  describe('tarjetas', () => {
    it('crea con posición explícita y la guarda', async () => {
      const created = await call('POST', '/note-cards', { text: 'Llamar', x: 100, y: 200 });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        text: 'Llamar',
        x: 100,
        y: 200,
        groupId: null,
        doneAt: null,
      });
      const found = (await board()).cards.find((c) => c.id === created.body.id);
      expect(found).toMatchObject({ x: 100, y: 200 });
    });

    it('sin posición elige un hueco libre que no pisa a otra', async () => {
      const a = (await call('POST', '/note-cards', { text: 'a' })).body as NoteCard;
      const b = (await call('POST', '/note-cards', { text: 'b' })).body as NoteCard;
      expect([a.x, a.y]).not.toEqual([b.x, b.y]);
    });

    it('mover actualiza la posición y la trae al frente', async () => {
      const first = (await call('POST', '/note-cards', { text: 'p', x: 10, y: 10 })).body;
      const second = (await call('POST', '/note-cards', { text: 'q', x: 500, y: 10 })).body;
      const moved = await call('PATCH', `/note-cards/${first.id}`, { x: 40, y: 60 });
      expect(moved.body).toMatchObject({ x: 40, y: 60 });
      expect(moved.body.z).toBeGreaterThan(second.z);
    });

    it('rechaza coordenadas fuera de rango y cuerpos vacíos', async () => {
      const card = (await call('POST', '/note-cards', { text: 'r', x: 1, y: 1 })).body;
      expect((await call('PATCH', `/note-cards/${card.id}`, { x: -5 })).status).toBe(400);
      expect((await call('PATCH', `/note-cards/${card.id}`, { y: 99_999 })).status).toBe(400);
      expect((await call('PATCH', `/note-cards/${card.id}`, {})).status).toBe(400);
    });

    it('edita el texto y borra; una nota inexistente da 404', async () => {
      const card = (await call('POST', '/note-cards', { text: 'viejo', x: 1, y: 1 })).body;
      const edited = await call('PATCH', `/note-cards/${card.id}`, { text: 'nuevo' });
      expect(edited.body.text).toBe('nuevo');
      expect((await call('DELETE', `/note-cards/${card.id}`)).status).toBe(204);
      expect((await call('DELETE', `/note-cards/${card.id}`)).status).toBe(404);
      expect((await call('PATCH', `/note-cards/${card.id}`, { text: 'x' })).status).toBe(404);
    });

    it('mueve varias a la vez, y no toca nada si alguna no existe', async () => {
      const a = (await call('POST', '/note-cards', { text: 'm1', x: 1, y: 1 })).body;
      const b = (await call('POST', '/note-cards', { text: 'm2', x: 2, y: 2 })).body;
      const ok = await call('PATCH', '/note-cards', {
        moves: [
          { id: a.id, x: 300, y: 300 },
          { id: b.id, x: 400, y: 400 },
        ],
      });
      expect(ok.status).toBe(200);
      const after = (await board()).cards;
      expect(after.find((c) => c.id === a.id)).toMatchObject({ x: 300, y: 300 });
      expect(after.find((c) => c.id === b.id)).toMatchObject({ x: 400, y: 400 });

      const missing = await call('PATCH', '/note-cards', {
        moves: [
          { id: a.id, x: 9, y: 9 },
          { id: new ObjectId().toHexString(), x: 9, y: 9 },
        ],
      });
      expect(missing.status).toBe(404);
      expect((await board()).cards.find((c) => c.id === a.id)).toMatchObject({ x: 300, y: 300 });
    });
  });

  describe('hechas y ocultas a las 24 h', () => {
    it('marcar como hecha guarda la fecha; volver a marcar no la mueve; desmarcar la borra', async () => {
      const card = (await call('POST', '/note-cards', { text: 'tarea', x: 5, y: 5 })).body;
      const done = await call('PATCH', `/note-cards/${card.id}`, { done: true });
      expect(done.body.doneAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

      const again = await call('PATCH', `/note-cards/${card.id}`, { done: true });
      expect(again.body.doneAt).toBe(done.body.doneAt);

      const undone = await call('PATCH', `/note-cards/${card.id}`, { done: false });
      expect(undone.body.doneAt).toBeNull();
    });

    it('una hecha se ve hasta justo antes de las 24 h y se oculta exactamente a las 24 h', async () => {
      const card = (await call('POST', '/note-cards', { text: 'caduca', x: 7, y: 7 })).body;
      const doneAt = new Date('2026-11-04T10:00:00.000Z');
      await collections!.noteCards.updateOne({ _id: new ObjectId(card.id) }, { $set: { doneAt } });

      const justBefore = new Date(doneAt.getTime() + DONE_VISIBLE_MS - 1);
      const atLimit = new Date(doneAt.getTime() + DONE_VISIBLE_MS);

      const visibleBefore = (await listBoard(collections!, justBefore)).cards;
      expect(visibleBefore.some((c) => c._id.toHexString() === card.id)).toBe(true);

      const visibleAt = (await listBoard(collections!, atLimit)).cards;
      expect(visibleAt.some((c) => c._id.toHexString() === card.id)).toBe(false);

      // No se pierde: aparece en «terminadas» y se puede recuperar.
      const done = await listDone(collections!, atLimit);
      expect(done.some((c) => c._id.toHexString() === card.id)).toBe(true);
    });

    it('GET /note-cards/done lista las hechas hace más de 24 h y recuperarlas las devuelve al lienzo', async () => {
      const card = (await call('POST', '/note-cards', { text: 'vieja', x: 8, y: 8 })).body;
      await collections!.noteCards.updateOne(
        { _id: new ObjectId(card.id) },
        { $set: { doneAt: new Date(Date.now() - 3 * DONE_VISIBLE_MS) } },
      );
      expect((await board()).cards.some((c) => c.id === card.id)).toBe(false);
      const done = (await call('GET', '/note-cards/done')).body as NoteCard[];
      expect(done.some((c) => c.id === card.id)).toBe(true);

      await call('PATCH', `/note-cards/${card.id}`, { done: false });
      expect((await board()).cards.some((c) => c.id === card.id)).toBe(true);
    });
  });

  describe('grupos', () => {
    it('crea un grupo y mete y saca tarjetas con coordenadas relativas', async () => {
      const group = (await call('POST', '/note-groups', { title: 'Reforma', x: 50, y: 50 }))
        .body as NoteGroup;
      expect(group).toMatchObject({ title: 'Reforma', x: 50, y: 50, w: 420, h: 300 });

      const card = (await call('POST', '/note-cards', { text: 'dentro', x: 0, y: 0 })).body;
      const inside = await call('PATCH', `/note-cards/${card.id}`, {
        groupId: group.id,
        x: 16,
        y: 56,
      });
      expect(inside.body).toMatchObject({ groupId: group.id, x: 16, y: 56 });

      const out = await call('PATCH', `/note-cards/${card.id}`, { groupId: null, x: 900, y: 900 });
      expect(out.body.groupId).toBeNull();
    });

    it('una tarjeta no puede apuntar a un grupo que no existe', async () => {
      const card = (await call('POST', '/note-cards', { text: 'x', x: 0, y: 0 })).body;
      const response = await call('PATCH', `/note-cards/${card.id}`, {
        groupId: new ObjectId().toHexString(),
      });
      expect(response.status).toBe(404);
    });

    it('mover el grupo no cambia las coordenadas de sus tarjetas', async () => {
      const group = (await call('POST', '/note-groups', { x: 10, y: 10 })).body;
      const card = (
        await call('POST', '/note-cards', { text: 'hija', x: 30, y: 70, groupId: group.id })
      ).body;
      await call('PATCH', `/note-groups/${group.id}`, { x: 600, y: 400 });
      const after = (await board()).cards.find((c) => c.id === card.id);
      expect(after).toMatchObject({ x: 30, y: 70, groupId: group.id });
    });

    it('agrupar una selección: mover varias tarjetas al grupo de una vez', async () => {
      const group = (await call('POST', '/note-groups', { x: 100, y: 100 })).body;
      const a = (await call('POST', '/note-cards', { text: 'g1', x: 120, y: 140 })).body;
      const b = (await call('POST', '/note-cards', { text: 'g2', x: 160, y: 260 })).body;
      await call('PATCH', '/note-cards', {
        moves: [
          { id: a.id, x: 20, y: 40, groupId: group.id },
          { id: b.id, x: 60, y: 160, groupId: group.id },
        ],
      });
      const cards = (await board()).cards.filter((c) => c.groupId === group.id);
      expect(cards.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    });

    it('disolver un grupo deja sus tarjetas sueltas en el mismo sitio del lienzo', async () => {
      const group = (await call('POST', '/note-groups', { x: 200, y: 300 })).body;
      const card = (
        await call('POST', '/note-cards', { text: 'suelta', x: 16, y: 56, groupId: group.id })
      ).body;
      const dissolved = await call('DELETE', `/note-groups/${group.id}`);
      expect(dissolved.status).toBe(200);
      expect(dissolved.body[0]).toMatchObject({ id: card.id, groupId: null, x: 216, y: 356 });
      expect((await board()).groups.some((g) => g.id === group.id)).toBe(false);
      expect((await call('DELETE', `/note-groups/${group.id}`)).status).toBe(404);
    });

    it('valida el tamaño del grupo', async () => {
      expect((await call('POST', '/note-groups', { w: 10 })).status).toBe(400);
    });
  });

  describe('migración de las notas del día', () => {
    it('convierte cada nota con texto en una tarjeta y no se repite', async () => {
      const now = new Date('2026-11-04T09:00:00.000Z');
      await collections!.noteCards.deleteMany({});
      await collections!.dailyNotes.insertMany([
        {
          _id: new ObjectId(),
          date: '2026-11-03',
          content: 'Llamar al dentista',
          createdAt: now,
          updatedAt: now,
        },
        { _id: new ObjectId(), date: '2026-11-02', content: '', createdAt: now, updatedAt: now },
      ]);

      const first = await migrateDailyNotes(collections!, now);
      expect(first).toEqual({ migrated: 1, skippedBecauseNotEmpty: false });
      const cards = (await board()).cards;
      expect(cards).toHaveLength(1);
      expect(cards[0]!.text).toBe('2026-11-03\nLlamar al dentista');

      const second = await migrateDailyNotes(collections!, now);
      expect(second).toEqual({ migrated: 0, skippedBecauseNotEmpty: true });
      expect((await board()).cards).toHaveLength(1);
    });
  });
});
