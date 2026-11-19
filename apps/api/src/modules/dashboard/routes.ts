import {
  DEFAULT_TIME_ZONE,
  DashboardQuerySchema,
  DashboardSchema,
  addDays,
  startOfDayIn,
  todayIn,
} from '@rayrecords/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { summarize } from './summary';

export const dashboardRoutes: FastifyPluginAsyncZod = async (app) => {
  const c = app.data;

  /**
   * The management dashboard in one request: sales of the last `days` days (7, 30 or 90) against
   * the same span before, best sellers, sales by category and the state of the stock.
   */
  app.get(
    '/dashboard',
    { schema: { querystring: DashboardQuerySchema, response: { 200: DashboardSchema } } },
    async (request) => {
      const { days } = request.query;
      const now = new Date();
      // The period and the one before it; the newest tickets of all are among them, or there
      // are none (a shop with no sale in twice the period shows no recent tickets).
      const since = startOfDayIn(
        addDays(todayIn(DEFAULT_TIME_ZONE, now), -(2 * days - 1)),
        DEFAULT_TIME_ZONE,
      );
      const [tickets, products] = await Promise.all([
        c.tickets.find({ createdAt: { $gte: since } }).toArray(),
        c.products.find().toArray(),
      ]);
      return summarize(tickets, products, days, DEFAULT_TIME_ZONE, now);
    },
  );
};
