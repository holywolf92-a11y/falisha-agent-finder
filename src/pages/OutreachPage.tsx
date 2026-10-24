// Agency Inbox — WhatsApp conversations with swept agencies. Reads the Falisha
// portal's shared WhatsApp tables (same number, same webhook) filtered to agency
// numbers. Reply is possible inside the 24h service window; outside it, you
// re-open with a template from the Agencies tab.

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageSquare, Send, Loader2, Clock, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';

type Conversation = {
  agency_id: string;
  agency_name: string;
  phone: string;
  display_name: string | null;
  last_message_preview: string | null;
  last_message_at: string | null;
  unread_count: number;
  reply_mode: string | null;
};
type Message = {
  id: string;
  direction: string; // inbound | outbound | ai
  body: string | null;
  is_template: boolean;
  template_name: string | null;
  status: string | null;
  created_at: string;
};
type Thread = {
  agencyName: string;
  phone: string;
  conversationId: string | null;
  replyMode: string | null;
  windowOpen: boolean;
  messages: Message[];
};

export function OutreachPage() {
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function loadList(keepSelection = true) {
    setLoadingList(true);
    try {
      const d = await api.get<{ conversations: Conversation[] }>('/inbox');
      setConvos(d.conversations);
      if ((!keepSelection || !selected) && d.conversations[0]) setSelected(d.conversations[0].agency_id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load inbox');
    } finally {
      setLoadingList(false);
    }
  }
  useEffect(() => { void loadList(false); /* eslint-disable-next-line */ }, []);

  async function loadThread(agencyId: string) {
    setLoadingThread(true);
    try {
      setThread(await api.get<Thread>(`/inbox/${agencyId}`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load conversation');
      setThread(null);
    } finally {
      setLoadingThread(false);
    }
  }
  useEffect(() => { if (selected) void loadThread(selected); /* eslint-disable-next-line */ }, [selected]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [thread]);

  async function doReply() {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/inbox/${selected}/reply`, { text: reply.trim() });
      setReply('');
      await loadThread(selected);
      await loadList();
      toast.success('Reply sent');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Reply failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            WhatsApp replies from agencies you've messaged. Replies route through Falisha's shared number.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => loadList()} disabled={loadingList}>
          {loadingList ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
        </Button>
      </div>

      {!loadingList && convos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="h-12 w-12 mx-auto rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <MessageSquare className="h-6 w-6" strokeWidth={1.5} />
            </div>
            <h3 className="mt-4 text-base font-medium">No agency conversations yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Send a template from the <strong>Agencies</strong> tab — replies will show up here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4 min-h-[60vh]">
          {/* Conversation list */}
          <Card className="overflow-hidden">
            <CardContent className="p-0 divide-y divide-border max-h-[70vh] overflow-y-auto">
              {convos.map((c) => (
                <button
                  key={c.agency_id}
                  onClick={() => setSelected(c.agency_id)}
                  className={
                    'w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors ' +
                    (selected === c.agency_id ? 'bg-muted' : '')
                  }
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[13px] truncate">{c.agency_name || c.display_name || c.phone}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{fmtRel(c.last_message_at)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-[12px] text-muted-foreground truncate">{c.last_message_preview || '—'}</span>
                    {c.unread_count > 0 && (
                      <span className="shrink-0 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold flex items-center justify-center">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </button>
              ))}
              {loadingList && <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">Loading…</div>}
            </CardContent>
          </Card>

          {/* Thread */}
          <Card className="overflow-hidden flex flex-col">
            {!selected ? (
              <CardContent className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Select a conversation
              </CardContent>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{thread?.agencyName || '…'}</div>
                    <div className="text-[12px] text-muted-foreground font-mono">{thread?.phone}</div>
                  </div>
                  {thread && !thread.windowOpen && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-warning">
                      <Clock className="h-3 w-3" /> 24h window closed
                    </span>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-2 max-h-[55vh]">
                  {loadingThread ? (
                    <div className="text-center text-[12px] text-muted-foreground py-6">Loading…</div>
                  ) : thread && thread.messages.length > 0 ? (
                    thread.messages.map((m) => <Bubble key={m.id} m={m} />)
                  ) : (
                    <div className="text-center text-[12px] text-muted-foreground py-6">No messages.</div>
                  )}
                  <div ref={bottomRef} />
                </div>

                <div className="border-t border-border p-3">
                  {thread?.windowOpen ? (
                    <form
                      onSubmit={(e) => { e.preventDefault(); void doReply(); }}
                      className="flex items-center gap-2"
                    >
                      <input
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Type a reply…"
                        className="flex-1 h-9 px-3 rounded-md border border-input bg-background text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      />
                      <Button type="submit" disabled={sending || !reply.trim()} size="sm">
                        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </form>
                  ) : (
                    <p className="text-[12px] text-muted-foreground text-center">
                      Outside the 24h reply window — send a template from the <strong>Agencies</strong> tab to re-open.
                    </p>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  const outbound = m.direction === 'outbound' || m.direction === 'ai';
  return (
    <div className={outbound ? 'flex justify-end' : 'flex justify-start'}>
      <div
        className={
          'max-w-[75%] rounded-lg px-3 py-2 text-[13px] ' +
          (outbound ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground')
        }
      >
        {m.is_template && (
          <div className={'text-[10px] uppercase tracking-wide mb-0.5 ' + (outbound ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
            Template{m.template_name ? ` · ${m.template_name}` : ''}
          </div>
        )}
        <div className="whitespace-pre-wrap break-words">{m.body || '—'}</div>
        <div className={'text-[10px] mt-0.5 ' + (outbound ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground')}>
          {fmtTime(m.created_at)}{outbound && m.status ? ` · ${m.status}` : ''}
        </div>
      </div>
    </div>
  );
}

function fmtRel(iso: string | null) {
  if (!iso) return '';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return new Date(iso).toLocaleDateString();
}
function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}
