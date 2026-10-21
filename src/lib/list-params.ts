import { opportunityCategories, type OpportunityCategory } from '@/domain/opportunity/schema';

/** The home list's filters, kept in the URL so Back and reloads restore the same view. */
export type ListParams = {
  category?: OpportunityCategory;
  status: 'upcoming' | 'past';
  sort: 'deadline' | 'added';
  q: string;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

export function parseListParams(raw: RawParams): ListParams {
  const category = first(raw.category);
  const params: ListParams = {
    status: first(raw.status) === 'past' ? 'past' : 'upcoming',
    sort: first(raw.sort) === 'added' ? 'added' : 'deadline',
    q: first(raw.q).trim(),
  };
  if ((opportunityCategories as readonly string[]).includes(category)) {
    params.category = category as OpportunityCategory;
  }
  return params;
}

export function listHref(params: ListParams): string {
  const search = new URLSearchParams();
  if (params.category) search.set('category', params.category);
  if (params.status !== 'upcoming') search.set('status', params.status);
  if (params.sort !== 'deadline') search.set('sort', params.sort);
  if (params.q) search.set('q', params.q);
  const query = search.toString();
  return query ? `/?${query}` : '/';
}

export function listOrder(params: ListParams): { sortBy: 'deadline' | 'created_at'; sortOrder: 'ASC' | 'DESC' } {
  if (params.sort === 'added') return { sortBy: 'created_at', sortOrder: 'DESC' };
  return { sortBy: 'deadline', sortOrder: params.status === 'past' ? 'DESC' : 'ASC' };
}

export const LIST_PAGE_SIZE = 20;

/** sessionStorage key: lets the detail page's back button return to the filtered list it came from. */
export const LIST_RETURN_KEY = 'opportunity-list-return';
