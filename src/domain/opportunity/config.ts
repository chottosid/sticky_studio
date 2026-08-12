import type { OpportunityCategory } from './schema';

export const opportunityCategoryLabels: Record<OpportunityCategory, string> = {
  job: 'Job',
  internship: 'Internship',
  contest: 'Contest',
  'higher-study': 'Higher Study',
};

export const opportunityCategoryDescriptions: Record<OpportunityCategory, string> = {
  job: 'Full-time employment and career positions',
  internship: 'Internships, co-ops, and student placements',
  contest: 'Competitions, hackathons, challenges, and awards',
  'higher-study': 'Graduate study, scholarships, fellowships, and research positions',
};

export const opportunityCategoryOptions = Object.entries(opportunityCategoryLabels).map(
  ([value, label]) => ({ value: value as OpportunityCategory, label }),
);

