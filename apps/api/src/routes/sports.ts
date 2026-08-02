import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { SPORT_CATEGORIES, SPORT_META, SPORT_TYPES, sportsResponseSchema } from '@apex/shared';

const payload = {
  categories: [...SPORT_CATEGORIES],
  sports: SPORT_TYPES.map((sportType) => ({ sportType, ...SPORT_META[sportType] })),
};

const sportRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/sports',
    {
      schema: {
        tags: ['sports'],
        summary: 'The full sport taxonomy with category metadata',
        description:
          "Superset of Strava's sport types. Clients drive their sport picker from this " +
          'rather than hardcoding a list, so adding a sport never needs an app release.',
        response: { 200: sportsResponseSchema },
      },
    },
    async () => payload,
  );
};

export default sportRoutes;
