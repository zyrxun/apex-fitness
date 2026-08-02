export interface OutboundMail {
  to: string;
  subject: string;
  text: string;
  meta?: Record<string, unknown>;
}

export interface MailSender {
  send(mail: OutboundMail): Promise<void>;
  /** Only populated by the in-memory sender used in tests. */
  readonly sent?: OutboundMail[];
}

export function createConsoleMailSender(from: string): MailSender {
  return {
    async send(mail) {
      // eslint-disable-next-line no-console
      console.log(
        `\n--- MAIL (dev) ---\nfrom: ${from}\nto:   ${mail.to}\nsubj: ${mail.subject}\n\n${mail.text}\n------------------\n`,
      );
    },
  };
}

export function createNoopMailSender(): MailSender {
  return { async send() {} };
}

export function createMemoryMailSender(): MailSender & { sent: OutboundMail[] } {
  const sent: OutboundMail[] = [];
  return {
    sent,
    async send(mail) {
      sent.push(mail);
    },
  };
}

export function createMailSender(transport: string, from: string): MailSender {
  switch (transport) {
    case 'noop':
      return createNoopMailSender();
    case 'memory':
      return createMemoryMailSender();
    default:
      return createConsoleMailSender(from);
  }
}
