import { generateOpaqueToken, hashToken } from '../lib/crypto.js';

export const MFA_TICKET_TTL_SECONDS = 300;

interface TicketRecord {
  userId: string;
  expiresAt: number;
}

/**
 * In-memory and single-use by design: tickets live 5 minutes and a restart
 * simply forces a fresh login. Moves to Redis when the API runs multi-instance.
 */
export class MfaTicketStore {
  #tickets = new Map<string, TicketRecord>();

  issue(userId: string): { ticket: string; expiresIn: number } {
    this.#sweep();
    const ticket = generateOpaqueToken(24);
    this.#tickets.set(hashToken(ticket), {
      userId,
      expiresAt: Date.now() + MFA_TICKET_TTL_SECONDS * 1000,
    });
    return { ticket, expiresIn: MFA_TICKET_TTL_SECONDS };
  }

  consume(ticket: string): string | null {
    this.#sweep();
    const key = hashToken(ticket);
    const record = this.#tickets.get(key);
    if (!record) return null;
    this.#tickets.delete(key);
    if (record.expiresAt <= Date.now()) return null;
    return record.userId;
  }

  #sweep() {
    const now = Date.now();
    for (const [key, record] of this.#tickets) {
      if (record.expiresAt <= now) this.#tickets.delete(key);
    }
  }
}
