import { describe, expect, it } from 'vitest';
import { listHref, listOrder, parseListParams } from './list-params';

describe('parseListParams', () => {
  it('falls back to defaults for missing or unknown values', () => {
    expect(parseListParams({})).toEqual({ status: 'upcoming', sort: 'deadline', q: '' });
    expect(parseListParams({ category: 'pirate', status: 'later', sort: 'x', q: ['a', 'b'] }))
      .toEqual({ status: 'upcoming', sort: 'deadline', q: 'a' });
  });

  it('keeps valid filters', () => {
    expect(parseListParams({ category: 'higher-study', status: 'past', sort: 'added', q: ' phd ' }))
      .toEqual({ category: 'higher-study', status: 'past', sort: 'added', q: 'phd' });
  });
});

describe('listHref', () => {
  it('omits defaults so the plain home URL means the default view', () => {
    expect(listHref({ status: 'upcoming', sort: 'deadline', q: '' })).toBe('/');
    expect(listHref({ category: 'job', status: 'past', sort: 'added', q: 'data & ai' }))
      .toBe('/?category=job&status=past&sort=added&q=data+%26+ai');
  });
});

describe('listOrder', () => {
  it('shows the nearest deadline first for upcoming and the latest first for past', () => {
    expect(listOrder({ status: 'upcoming', sort: 'deadline', q: '' })).toEqual({ sortBy: 'deadline', sortOrder: 'ASC' });
    expect(listOrder({ status: 'past', sort: 'deadline', q: '' })).toEqual({ sortBy: 'deadline', sortOrder: 'DESC' });
    expect(listOrder({ status: 'upcoming', sort: 'added', q: '' })).toEqual({ sortBy: 'created_at', sortOrder: 'DESC' });
  });
});
