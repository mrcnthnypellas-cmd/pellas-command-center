import type { EmailProvider, EmailMessage } from './types';

export type { EmailProvider, EmailMessage } from './types';

class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<{ id: string }> {
    // Dev-only stand-in — no live provider account is configured yet (spec §10/§5.12).
    console.info('[email:console]', { to: message.to, subject: message.subject });
    return { id: `console-${Date.now()}` };
  }
}

class ResendEmailProvider implements EmailProvider {
  constructor(private readonly apiKey: string, private readonly from: string) {}

  async send(message: EmailMessage): Promise<{ id: string }> {
    const { Resend } = await import('resend');
    const resend = new Resend(this.apiKey);
    const result = await resend.emails.send({
      from: this.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });
    if (result.error) throw new Error(result.error.message);
    return { id: result.data?.id ?? 'unknown' };
  }
}

let provider: EmailProvider | null = null;

export function emailProvider(): EmailProvider {
  if (provider) return provider;

  const driver = process.env.EMAIL_DRIVER ?? 'console';
  if (driver === 'resend') {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('RESEND_API_KEY is required when EMAIL_DRIVER=resend');
    provider = new ResendEmailProvider(apiKey, process.env.EMAIL_FROM ?? 'no-reply@pellas.local');
    return provider;
  }

  provider = new ConsoleEmailProvider();
  return provider;
}
