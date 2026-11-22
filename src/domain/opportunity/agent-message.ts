export type AgentMessageIntent = 'week' | 'research' | 'outreach' | 'revise' | 'help';

export function classifyAgentMessage(text: string, hasDraft: boolean): AgentMessageIntent {
  const input = text.toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ').trim();
  if (/^(?:please )?(?:make (?:it|this|the draft)|shorten|revise|rewrite|tighten|rephrase|polish)\b/.test(input) && hasDraft) return 'revise';
  if (/\b(?:draft|write|compose|prepare)\b.*\b(?:e-?mail|outreach|cold message)\b/.test(input) || /^outreach\b/.test(input)) return 'outreach';

  if (/^(?:help\b|what can you do\b|what are your capabilities\b)/.test(input)) return 'help';
  const savedLedger = /\b(?:saved|ledger|tracker)\b/.test(input);
  const due = /\b(?:deadlines?|due|prioriti[sz]\w*)\b/.test(input);
  if (savedLedger) return due ? 'week' : 'help';
  const weekly = /\b(?:plan (?:my|the) week|what(?:'s| is) due|what should i (?:apply|focus|prioriti[sz]e|do)|weekly (?:plan|priorities)|prioriti[sz]e (?:my|the|these)|deadlines? (?:this week|next week|in the next))\b/.test(input)
    || (due && /\b(?:my|do i have|what deadlines)\b/.test(input))
    || /^(?:show (?:me )?)?(?:upcoming )?deadlines?\??$/.test(input);
  const search = /^(?:(?:please|can you|could you)\s+)*(?:find|search|research|look for)\b/.test(input);
  const topic = /\b(?:funded phd|phd (?:openings?|positions?)|scholarships?|internships?|job openings?|research positions?)\b/.test(input);
  if (search && (topic || !weekly)) return 'research';
  if (weekly) return 'week';
  if (topic) return 'research';
  return 'help';
}

export function mentionedOpportunity(text: string, opportunities: { id: string; name: string }[]) {
  const id = /(?:^|\s)#(\d{1,9})\b/.exec(text)?.[1];
  if (id) return opportunities.find((item) => item.id === id);
  const quoted = /["“]([^"”]+)["”]/.exec(text)?.[1];
  const request = (quoted ?? text.match(/\b(?:about|for)\b (.+)$/i)?.[1])?.trim().replace(/[?.!]+$/, '').toLowerCase();
  if (!request) return undefined;
  const matches = opportunities.filter((item) => item.name.trim().replace(/[?.!]+$/, '').toLowerCase() === request);
  return matches.length === 1 ? matches[0] : undefined;
}
