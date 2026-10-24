// Meta WhatsApp Cloud API client — mirrors the proven send path in the Falisha
// recruitment portal (whatsappService.ts) and adds template listing + typed
// Meta error parsing. Credentials are read from env (the same WHATSAPP_* values
// the portal backend already uses); when they're absent the outreach routes
// report "not configured" and the UI disables sending.

import { env } from '../env.js';
import { logger } from '../logger.js';

export interface WhatsAppTemplate {
  name: string;
  language: string;
  status: string;   // APPROVED | PENDING | REJECTED | PAUSED | ...
  category: string; // MARKETING | UTILITY | AUTHENTICATION
}

/** Meta error codes we special-case. */
export const META_NOT_ON_WHATSAPP = 131026; // recipient can't receive (not a WA user / incapable)
export const META_RATE_LIMITS = new Set([131049, 131056, 130429, 131048]); // throttle / quality / pair-rate

export class WhatsAppSendError extends Error {
  code?: number;
  subcode?: number;
  raw?: unknown;
  constructor(message: string, opts?: { code?: number; subcode?: number; raw?: unknown }) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.code = opts?.code;
    this.subcode = opts?.subcode;
    this.raw = opts?.raw;
  }
}

export function isConfigured(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
}

export function templatesConfigured(): boolean {
  return Boolean(env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_WABA_ID);
}

export function defaultTemplateLanguage(): string {
  return env.WHATSAPP_TEMPLATE_LANG || 'en';
}

function graphBase(): string {
  return `https://graph.facebook.com/${env.WHATSAPP_GRAPH_VERSION || 'v20.0'}`;
}

function requireCreds(): { token: string; phoneNumberId: string } {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    throw new WhatsAppSendError('WhatsApp Cloud API not configured (WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing)');
  }
  return { token: env.WHATSAPP_ACCESS_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID };
}

function parseMetaError(status: number, body: unknown): WhatsAppSendError {
  const err = (body as { error?: { message?: string; code?: number; error_subcode?: number } })?.error;
  const message = err?.message || `WhatsApp API error (HTTP ${status})`;
  return new WhatsAppSendError(message, { code: err?.code, subcode: err?.error_subcode, raw: body });
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

/**
 * Send an approved template to a WhatsApp number (E.164 digits, no '+').
 * Returns the Meta message id. Throws WhatsAppSendError (with .code) on failure.
 */
export async function sendTemplate(
  to: string,
  template: { name: string; language: string; components?: unknown[] },
): Promise<{ messageId: string }> {
  const { token, phoneNumberId } = requireCreds();
  const res = await fetch(`${graphBase()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: template.name,
        language: { code: template.language },
        ...(template.components ? { components: template.components } : {}),
      },
    }),
  });

  const body = await readJson(res);
  if (!res.ok) {
    const e = parseMetaError(res.status, body);
    logger.warn({ to, template: template.name, code: e.code, subcode: e.subcode }, 'template send failed');
    throw e;
  }
  const messageId = (body as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? '';
  return { messageId };
}

/** Send a free-form text message (only valid inside the 24h service window). */
export async function sendText(to: string, text: string): Promise<{ messageId: string }> {
  const { token, phoneNumberId } = requireCreds();
  const res = await fetch(`${graphBase()}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
  });
  const body = await readJson(res);
  if (!res.ok) throw parseMetaError(res.status, body);
  const messageId = (body as { messages?: Array<{ id?: string }> })?.messages?.[0]?.id ?? '';
  return { messageId };
}

/**
 * List message templates from the WhatsApp Business Account. Returns [] when
 * WHATSAPP_WABA_ID isn't set (the caller surfaces a "set WABA id" hint).
 */
export async function listTemplates(): Promise<WhatsAppTemplate[]> {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_WABA_ID) return [];
  const url = `${graphBase()}/${env.WHATSAPP_WABA_ID}/message_templates?fields=name,status,language,category&limit=200`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` } });
  const body = await readJson(res);
  if (!res.ok) {
    throw parseMetaError(res.status, body);
  }
  const data = (body as { data?: Array<{ name: string; language: string; status: string; category: string }> })?.data ?? [];
  return data.map((t) => ({ name: t.name, language: t.language, status: t.status, category: t.category }));
}
