import { describe, expect, it } from 'vitest';
import { classifyAgentMessage, mentionedOpportunity } from './agent-message';

describe('agent chat routing', () => {
  it.each(['Plan my week', 'What’s due this week?', 'What are my internship deadlines?', 'Upcoming deadlines', 'Prioritize my saved opportunities'])
    ('plans from the ledger for %s', (prompt) => expect(classifyAgentMessage(prompt, false)).toBe('week'));

  it('keeps an explicit web search topical and gives help for unsupported saved-record requests', () => {
    expect(classifyAgentMessage('Find funded PhD positions with deadlines this week', false)).toBe('research');
    expect(classifyAgentMessage('Find internships in my saved ledger', false)).toBe('help');
    expect(classifyAgentMessage('What can you do for internships?', false)).toBe('help');
  });

  it('routes drafting and contextual revisions separately', () => {
    expect(classifyAgentMessage('Draft a cold email for #42', false)).toBe('outreach');
    expect(classifyAgentMessage('Make it shorter', true)).toBe('revise');
    expect(classifyAgentMessage('Make it shorter', false)).toBe('help');
  });
});

it('resolves only an explicit ID or a unique exact saved title', () => {
  const opportunities = [{ id: '41', name: 'ML internship' }, { id: '42', name: 'Funded PhD' }, { id: '43', name: 'ML internship' }];
  expect(mentionedOpportunity('Draft an email for #42', opportunities)?.id).toBe('42');
  expect(mentionedOpportunity('Write an email for “Funded PhD”', opportunities)?.id).toBe('42');
  expect(mentionedOpportunity('Draft outreach for ML internship', opportunities)).toBeUndefined();
  expect(mentionedOpportunity('Draft outreach for PhD', opportunities)).toBeUndefined();
});
