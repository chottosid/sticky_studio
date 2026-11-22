'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowUp, ArrowUpRight, CalendarDays, CircleHelp, Loader2, Mail, Plus, Search, Sparkles } from 'lucide-react';
import { classifyAgentMessage, mentionedOpportunity } from '@/domain/opportunity/agent-message';
import type { AgentRequest, AgentResult } from '@/domain/opportunity/agent';
import { candidates, type CandidateId } from '@/domain/opportunity/assessment';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { runAgent } from '@/lib/agent-actions';
import { AgentResponse } from './agent-response';

type SavedOpportunity = { id: string; name: string };

type Reply =
  | { kind: 'help' | 'choose' }
  | { kind: 'working'; task: AgentRequest['kind'] }
  | { kind: 'error'; message: string }
  | { kind: 'answer'; result: AgentResult; opportunityId?: string };

type Turn = { id: number; text: string; candidate: CandidateId; reply: Reply };

const prompts = [
  { title: 'Plan my week', detail: 'Prioritize saved deadlines', icon: CalendarDays, text: 'Plan my week' },
  { title: 'Find opportunities', detail: 'Search and review sources', icon: Search, text: 'Find ' },
  { title: 'Draft outreach', detail: 'Write a message to send yourself', icon: Mail, text: 'Draft an outreach email' },
] as const;

const progress = { week: 'Reading the ledger', research: 'Looking for public sources', outreach: 'Writing your draft' };

export function AgentWorkspace({ opportunities, aiConfigured, initialOpportunityId }: {
  opportunities: SavedOpportunity[];
  aiConfigured: boolean;
  initialOpportunityId?: string;
}) {
  const initialOpportunity = opportunities.find((item) => item.id === initialOpportunityId);
  const [candidate, setCandidate] = useState<CandidateId>('swarup');
  const [text, setText] = useState(initialOpportunity ? `Draft an outreach email for #${initialOpportunity.id}` : '');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const nextTurn = useRef(0);
  const conversation = useRef<HTMLDivElement>(null);
  const latestTurn = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const log = conversation.current;
    if (log && latestTurn.current) {
      log.scrollTop += latestTurn.current.getBoundingClientRect().top - log.getBoundingClientRect().top - 16;
    }
  }, [turns]);

  async function execute(id: number, request: AgentRequest) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    const update = (reply: Reply) => setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, reply } : turn));
    update({ kind: 'working', task: request.kind });
    try {
      const response = await runAgent(request);
      update(response.success
        ? { kind: 'answer', result: response.result, opportunityId: request.kind === 'outreach' ? request.opportunityId : undefined }
        : { kind: 'error', message: response.message });
    } catch {
      update({ kind: 'error', message: 'Could not reach Sticky Studio. Send the request again to retry.' });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function send(message: string) {
    const prompt = message.trim();
    if (sending.current || prompt.length < 3 || prompt.length > 500) return;
    const previous = turns[turns.length - 1];
    const draft = previous?.candidate === candidate && previous.reply.kind === 'answer'
      && previous.reply.result.kind === 'outreach' && previous.reply.opportunityId ? previous.reply : undefined;
    const intent = classifyAgentMessage(prompt, Boolean(draft));
    const id = nextTurn.current++;
    let request: AgentRequest | undefined;
    let reply: Reply = { kind: 'help' };

    if (intent === 'week') request = { kind: 'week', candidate };
    if (intent === 'research') request = { kind: 'research', candidate, query: prompt };
    if (intent === 'outreach') {
      const opportunity = mentionedOpportunity(prompt, opportunities);
      if (opportunity) request = { kind: 'outreach', candidate, opportunityId: opportunity.id, instructions: prompt };
      else reply = { kind: 'choose' };
    }
    if (intent === 'revise' && draft?.result.kind === 'outreach' && draft.opportunityId) {
      request = { kind: 'outreach', candidate, opportunityId: draft.opportunityId, instructions: prompt,
        previousDraft: { subject: draft.result.subject, body: draft.result.body } };
    }

    setText('');
    setTurns((current) => [...current, { id, text: prompt, candidate, reply }]);
    if (request) void execute(id, request);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    send(text);
  }

  return (
    <section aria-labelledby="agent-heading" className="flex min-h-[34rem] flex-col overflow-hidden rounded-3xl border bg-card shadow-sm sm:h-[min(760px,calc(100dvh-8rem))] sm:min-h-[36rem]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
        <h1 id="agent-heading" className="font-display text-2xl font-semibold tracking-tight sm:text-[1.75rem]">Agent</h1>
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden text-xs text-muted-foreground sm:inline">Applicant</span>
          <Select value={candidate} onValueChange={(value) => setCandidate(value as CandidateId)} disabled={busy}>
            <SelectTrigger aria-label="Applicant" className="h-9 w-[7.5rem] bg-background sm:w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {candidates.map(({ id, name }) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" variant="ghost" size="sm" aria-label="New chat" title="New chat" disabled={busy || !turns.length}
            onClick={() => { setTurns([]); setText(''); composer.current?.focus(); }}>
            <Plus aria-hidden /><span className="hidden sm:inline">New chat</span>
          </Button>
        </div>
      </div>

      <div ref={conversation} role="log" aria-label="Agent conversation" tabIndex={0} className="max-h-[65dvh] min-h-0 flex-1 overflow-y-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:max-h-none">
        {turns.length === 0 ? (
          <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-4 py-8 sm:px-9 sm:py-12">
            <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-primary"><Sparkles size={24} aria-hidden /></span>
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">What are you working on?</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">Ask in plain language or start with a suggested task.</p>
            <div className="mt-6 grid gap-2.5 sm:grid-cols-3">
              {prompts.map(({ title, detail, icon: Icon, text: prompt }) => (
                <button key={title} type="button" className="group rounded-2xl border bg-background/70 p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-4"
                  onClick={() => {
                    if (prompt === 'Find ') { setText(prompt); composer.current?.focus(); }
                    else send(prompt);
                  }}>
                  <span className="flex items-center gap-2 text-sm font-semibold sm:flex-wrap"><Icon size={16} className="shrink-0 text-primary" aria-hidden /> {title}<ArrowUpRight size={13} aria-hidden className="ml-auto shrink-0 text-muted-foreground/70 group-hover:text-primary" /></span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{detail}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-7 px-4 py-5 sm:px-8 sm:py-7">
            {turns.map((turn, index) => (
              <div key={turn.id} ref={index === turns.length - 1 ? latestTurn : undefined} className="space-y-4">
                <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-sm bg-accent px-4 py-2.5 text-accent-foreground sm:max-w-[78%]">
                  <span className="sr-only">You</span>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{turn.text}</p>
                </div>
                <div className="flex items-start gap-2.5 sm:gap-3.5">
                  <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles size={15} aria-hidden /></span>
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <p className="text-xs font-medium text-muted-foreground">Agent · {candidates.find((item) => item.id === turn.candidate)?.name}</p>
                    {turn.reply.kind === 'working' && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} aria-hidden className="animate-spin" /> {progress[turn.reply.task]}…</p>}
                    {turn.reply.kind === 'error' && <p role="alert" className="break-words rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">{turn.reply.message}</p>}
                    {turn.reply.kind === 'answer' && <AgentResponse result={turn.reply.result} />}
                    {turn.reply.kind === 'help' && <div className="space-y-2 text-sm leading-relaxed">
                      <p>I can plan upcoming deadlines, research new opportunities, and draft an email for a saved opportunity.</p>
                      <p className="text-muted-foreground">Try “What’s due this week?”, “Find funded PhDs in computer vision”, or “Draft a cold email”.</p>
                    </div>}
                    {turn.reply.kind === 'choose' && (
                      opportunities.length ? <>
                        <p className="text-sm">Choose a saved opportunity for this draft.</p>
                        {index === turns.length - 1 && <OpportunityChooser opportunities={opportunities} disabled={busy}
                          onChoose={(opportunityId) => void execute(turn.id, { kind: 'outreach', candidate: turn.candidate, opportunityId, instructions: turn.text })} />}
                      </> : <p className="text-sm">Save an opportunity in the ledger first, then ask for an outreach draft.</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t bg-card px-3 py-3 sm:px-6 sm:py-4">
        <form onSubmit={submit} className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-2xl border border-input bg-background p-1.5 focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/15">
            <Textarea ref={composer} aria-label="Message the agent" placeholder="Ask about deadlines, research, or outreach…"
              rows={2} value={text} maxLength={500} onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              className="min-h-[3.25rem] resize-none border-0 bg-transparent px-2.5 py-2 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" />
            <Button type="submit" size="icon" aria-label="Send message" title="Send message" disabled={busy || text.trim().length < 3} className="size-9 shrink-0 rounded-xl">
              <ArrowUp aria-hidden />
            </Button>
          </div>
          {!aiConfigured && <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"><CircleHelp size={13} className="mt-0.5 shrink-0" aria-hidden /> Research and outreach need a configured OpenRouter agent key.</p>}
        </form>
      </div>
    </section>
  );
}

function OpportunityChooser({ opportunities, disabled, onChoose }: {
  opportunities: SavedOpportunity[]; disabled: boolean; onChoose: (id: string) => void;
}) {
  const [selected, setSelected] = useState('');
  return (
    <div className="flex flex-wrap gap-2">
      <Select value={selected} onValueChange={setSelected} disabled={disabled}>
        <SelectTrigger aria-label="Saved opportunity" className="h-9 w-full max-w-xs"><SelectValue placeholder="Select an opportunity" /></SelectTrigger>
        <SelectContent>
          {opportunities.map(({ id, name }) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button type="button" size="sm" disabled={disabled || !selected} onClick={() => onChoose(selected)}>Write draft</Button>
    </div>
  );
}
