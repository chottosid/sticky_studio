import { opportunityCategories, type OpportunityCategory } from '@/domain/opportunity/schema';
import { CandidateIdSchema, PriorityTierSchema, type CandidateId, type PriorityTier } from '@/domain/opportunity/assessment';

/** The home list's filters, kept in the URL so Back and reloads restore the same view. */
export type ListParams = {
  category?: OpportunityCategory;
  status: 'upcoming' | 'past';
  sort: 'deadline' | 'added' | 'priority';
  q: string;
  candidate?: CandidateId;
  priority?: PriorityTier;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

export function parseListParams(raw: RawParams): ListParams {
  const category = first(raw.category);
  const params: ListParams = {
    status: first(raw.status) === 'past' ? 'past' : 'upcoming',
    sort: first(raw.sort) === 'added' ? 'added' : first(raw.sort) === 'priority' ? 'priority' : 'deadline',
    q: first(raw.q).trim(),
  };
  if ((opportunityCategories as readonly string[]).includes(category)) {
    params.category = category as OpportunityCategory;
  }
  const candidate = CandidateIdSchema.safeParse(first(raw.candidate));
  const priority = PriorityTierSchema.safeParse(first(raw.priority));
  if (candidate.success) params.candidate = candidate.data;
  if (priority.success) {
    params.priority = priority.data;
    params.candidate ||= 'swarup';
  }
  if (params.sort === 'priority') params.candidate ||= 'swarup';
  return params;
}

export function listHref(params: ListParams): string {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.status !== 'upcoming') search.set('status', params.status);
  if (params.sort !== 'deadline') search.set('sort', params.sort);
  if (params.q) search.set('q', params.q);
  if (params.candidate) search.set('candidate', params.candidate);
  if (params.priority) search.set('priority', params.priority);
  const query = search.toString();
  return query ? `/?${query}` : '/';
}

export function listOrder(params: ListParams): { sortBy: 'deadline' | 'created_at' | 'priority'; sortOrder: 'ASC' | 'DESC' } {
  if (params.sort === 'priority') return { sortBy: 'priority', sortOrder: 'ASC' };
  if (params.sort === 'added') return { sortBy: 'created_at', sortOrder: 'DESC' };
  return { sortBy: 'deadline', sortOrder: params.status === 'past' ? 'DESC' : 'ASC' };
}

export const LIST_PAGE_SIZE = 20;

/** sessionStorage key: lets the detail page's back button return to the filtered list it came from. */
export const LIST_RETURN_KEY = 'opportunity-list-return';
