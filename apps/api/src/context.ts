import type { AppConfig } from './config.js';
import type { Database } from './db/client.js';
import type { MailSender } from './lib/mailer.js';
import type { MfaTicketStore } from './services/mfa-tickets.js';

export interface AppContext {
  config: AppConfig;
  db: Database;
  mail: MailSender;
  mfaTickets: MfaTicketStore;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
    requireAuth: import('fastify').preHandlerHookHandler;
  }
  interface FastifyRequest {
    auth?: { userId: string; sessionId: string; region: string };
  }
}
