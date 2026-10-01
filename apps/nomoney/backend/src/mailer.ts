import nodemailer from 'nodemailer';
import type { Mailer, MailMessage } from './types.js';

type SmtpOverrides = { smtpHost?: string; smtpPort?: number; smtpUser?: string };

/**
 * SMTP settings come from the environment; the host, port and user saved in
 * Settings fill in whatever the environment leaves empty. The password is
 * only ever read from the environment.
 */
export function createSmtpMailer(readSettings: () => SmtpOverrides = () => ({})): Mailer {
  const sent: MailMessage[] = [];

  return {
    sent,
    async send(message) {
      const saved = readSettings();
      const host = process.env.SMTP_HOST || saved.smtpHost;
      const port = Number(process.env.SMTP_PORT || saved.smtpPort || 587);
      const user = process.env.SMTP_USER || saved.smtpUser;
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
