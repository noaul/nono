import nodemailer from 'nodemailer';
import type { Mailer, MailMessage } from './types.js';

export function createSmtpMailer(): Mailer {
  const sent: MailMessage[] = [];

  return {
    sent,
    async send(message) {
      const host = process.env.SMTP_HOST;
      const port = Number(process.env.SMTP_PORT ?? 587);
      const user = process.env.SMTP_USER;
      const pass = process.env.SMTP_PASS;

      if (!host) {
        throw new Error('SMTP_HOST is not configured');
      }

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user && pass ? { user, pass } : undefined
      });

      await transporter.sendMail(message);
      sent.push(message);
    }
  };
}
