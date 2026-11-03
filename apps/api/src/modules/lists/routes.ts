import { ListSchema } from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { toList } from './mapper';

/**
 * Plantilla de módulo: cada módulo es un plugin de Fastify con sus rutas y su mapper.
 * Aquí solo hay lectura; el CRUD completo llega en la siguiente fase.
 */
export const listsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/lists', { schema: { response: { 200: z.array(ListSchema) } } }, async () => {
    const docs = await app.db.collections.lists
      .find({ archived: false })
      .sort({ order: 1 })
      .toArray();
    return docs.map(toList);
  });
};
