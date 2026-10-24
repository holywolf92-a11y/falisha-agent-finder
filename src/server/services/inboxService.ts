// Agency inbox — reads the Falisha portal's shared WhatsApp tables
// (whatsapp_conversations / whatsapp_messages, same Supabase project) and
// surfaces the conversations that belong to swept agencies. Read-only for
// viewing; two writes are intentional and approved:
//   • markConversationHuman — flags an agency's conversation reply_mode='human'
//     when we send it a template, so the portal's candidate AI bot never
//     auto-replies to a recruitment agency.
//   • sendReply — sends a free-form reply inside the 24h window and records the
//     outbound message so it shows in both this inbox and the portal's.

import { db } from '../db.js';
import { logger } from '../logger.js';
import { sendText } from './whatsappCloud.js';

const digitsOnly = (s: string | null | undefined) => (s || '').replace(/\D/g, '');

export interface InboxConversation {
  agency_id: string;
  agency_name: string;
  phone: string;
  conversation_id: string;
  display_name: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  reply_mode: string | null;
}

export interface InboxMessage {
  id: string;
  direction: string;
  body: string | null;
  is_template: boolean;
  template_name: string | null;
  status: string | null;
  created_at: string;
}

type ConversationRow = {
  id: string;
  phone_number: string;
  display_name: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  reply_mode: string | null;
};

const AGENCY_CAP = 400;

/** Fetch swept agencies that have a resolved WhatsApp number (digits -> agency). */
async function agenciesByPhone(): Promise<Map<string, { id: string; name: string; phone: string }>> {
  const { data, error } = await db()
    .from('agencies')
    .select('id, name, wa_phone')
    .not('wa_phone', 'is', null)
    .is('deleted_at', null)
    .limit(AGENCY_CAP);
  if (error) throw new Error(`inbox agencies query failed: ${error.message}`);
  const map = new Map<string, { id: string; name: string; phone: string }>();
  for (const a of (data ?? []) as Array<{ id: string; name: string; wa_phone: string }>) {
    const key = digitsOnly(a.wa_phone);
    if (key) map.set(key, { id: a.id, name: a.name, phone: a.wa_phone });
  }
  return map;
}

/** Look up the portal conversations for a set of phone numbers (both +/no-+). */
async function conversationsFor(phones: string[]): Promise<ConversationRow[]> {
  if (!phones.length) return [];
  const variants = [...new Set(phones.flatMap((p) => [p, `+${p}`]))];
  const { data, error } = await db()
    .from('whatsapp_conversations')
    .select('id, phone_number, display_name, last_message_preview, last_message_at, last_inbound_at, unread_count, reply_mode')
    .in('phone_number', variants)
    .order('last_message_at', { ascending: false });
  if (error) throw new Error(`inbox conversations query failed: ${error.message}`);
  return (data ?? []) as ConversationRow[];
}

/** List agency conversations (agencies we've messaged that have a thread). */
export async function listAgencyInbox(): Promise<InboxConversation[]> {
  const byPhone = await agenciesByPhone();
  if (byPhone.size === 0) return [];
  const convos = await conversationsFor([...byPhone.keys()]);

  const out: InboxConversation[] = [];
  for (const c of convos) {
    const agency = byPhone.get(digitsOnly(c.phone_number));
    if (!agency) continue;
    out.push({
      agency_id: agency.id,
      agency_name: agency.name,
      phone: agency.phone,
      conversation_id: c.id,
      display_name: c.display_name,
      last_message_preview: c.last_message_preview,
      last_message_at: c.last_message_at,
      last_inbound_at: c.last_inbound_at,
      unread_count: c.unread_count ?? 0,
      reply_mode: c.reply_mode,
    });
  }
  return out;
}

async function conversationForAgency(agencyId: string): Promise<{ phone: string; convo: ConversationRow | null; agencyName: string }> {
  const { data: agency, error } = await db()
    .from('agencies')
    .select('id, name, wa_phone')
    .eq('id', agencyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!agency || !(agency as { wa_phone: string | null }).wa_phone) {
    return { phone: '', convo: null, agencyName: (agency as { name?: string } | null)?.name ?? '' };
  }
  const phone = (agency as { wa_phone: string }).wa_phone;
  const convos = await conversationsFor([digitsOnly(phone)]);
  return { phone, convo: convos[0] ?? null, agencyName: (agency as { name: string }).name };
}

/** Full thread (messages) for one agency. */
export async function getAgencyThread(agencyId: string): Promise<{
  agencyName: string;
  phone: string;
  conversationId: string | null;
  replyMode: string | null;
  windowOpen: boolean;
  messages: InboxMessage[];
}> {
  const { phone, convo, agencyName } = await conversationForAgency(agencyId);
  if (!convo) return { agencyName, phone, conversationId: null, replyMode: null, windowOpen: false, messages: [] };

  const { data, error } = await db()
    .from('whatsapp_messages')
    .select('id, direction, body, is_template, template_name, status, created_at')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw new Error(`inbox messages query failed: ${error.message}`);

  const windowOpen = convo.last_inbound_at
    ? Date.now() - new Date(convo.last_inbound_at).getTime() < 24 * 3600 * 1000
    : false;

  return {
    agencyName,
    phone,
    conversationId: convo.id,
    replyMode: convo.reply_mode,
    windowOpen,
    messages: (data ?? []) as InboxMessage[],
  };
}

/**
 * Flag an agency's conversation human-only so the portal's candidate bot stays
 * quiet. Upserts the conversation row (created on first contact if needed).
 */
export async function markConversationHuman(phone: string): Promise<void> {
  const digits = digitsOnly(phone);
  if (!digits) return;
  try {
    await db()
      .from('whatsapp_conversations')
      .upsert({ phone_number: digits, reply_mode: 'human' }, { onConflict: 'phone_number' });
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'markConversationHuman failed');
  }
}

/** Send a free-form reply (24h window) and record it in the shared thread. */
export async function sendReply(agencyId: string, text: string): Promise<{ ok: true; messageId: string }> {
  const { phone, convo } = await conversationForAgency(agencyId);
  if (!phone) throw new Error('agency has no WhatsApp number');
  if (!convo) throw new Error('no conversation yet — send a template first');
  const windowOpen = convo.last_inbound_at
    ? Date.now() - new Date(convo.last_inbound_at).getTime() < 24 * 3600 * 1000
    : false;
  if (!windowOpen) throw new Error('outside the 24h reply window — send a template instead');

  const { messageId } = await sendText(digitsOnly(phone), text);

  // Record the outbound message in the shared thread (best-effort).
  try {
    await db().from('whatsapp_messages').insert({
      conversation_id: convo.id,
      direction: 'outbound',
      message_type: 'text',
      to_number: digitsOnly(phone),
      body: text,
      meta_message_id: messageId || null,
      status: 'sent',
      is_template: false,
    });
    await db()
      .from('whatsapp_conversations')
      .update({ last_message_preview: text.slice(0, 120), last_message_at: new Date().toISOString(), reply_mode: 'human' })
      .eq('id', convo.id);
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, 'record outbound reply failed');
  }

  return { ok: true, messageId };
}
