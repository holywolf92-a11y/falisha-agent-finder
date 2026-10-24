// Email outreach via Google Workspace SMTP (Gmail). Sends from the configured
// Workspace address (e.g. info@falishamanpower.com) using a Gmail App Password.
// Optional — when SMTP_USER / SMTP_PASSWORD are absent, Send-email is disabled.

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';
import { logger } from '../logger.js';

let transporter: Transporter | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(env.SMTP_USER && env.SMTP_PASSWORD);
}

export function emailFrom(): string {
  const addr = env.SMTP_USER || '';
  return env.SMTP_FROM_NAME ? `"${env.SMTP_FROM_NAME}" <${addr}>` : addr;
}

function getTransport(): Transporter {
  if (transporter) return transporter;
  if (!isEmailConfigured()) throw new Error('Email not configured (SMTP_USER / SMTP_PASSWORD)');
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,       // 465 = implicit TLS
    requireTLS: env.SMTP_PORT === 587,   // 587 = STARTTLS
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  });
  return transporter;
}

export async function sendEmail(to: string, subject: string, body: string): Promise<{ messageId: string }> {
  const t = getTransport();
  // Plain-text body + a minimal HTML version (escaped, newlines -> <br>).
  const html = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  const info = await t.sendMail({ from: emailFrom(), to, subject, text: body, html });
  return { messageId: info.messageId || '' };
}

/** Verify the SMTP connection (used by the Settings/test path). */
export async function verifyEmail(): Promise<boolean> {
  try {
    await getTransport().verify();
    return true;
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'smtp verify failed');
    return false;
  }
}
