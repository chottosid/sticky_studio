import { z } from 'zod';
import { isCalendarDate } from '@/lib/utils';

export const recruitingStatuses = ['unknown', 'taking', 'not_taking'] as const;
export const RecruitingStatusSchema = z.enum(recruitingStatuses);
export const recruitingStatusLabels: Record<(typeof recruitingStatuses)[number], string> = {
  unknown: 'Not checked', taking: 'Taking students', not_taking: 'Not taking',
};

const optionalText = (max: number) => z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().max(max).nullable(),
).default(null);
const optionalUrl = z.preprocess(
  (value) => typeof value === 'string' && value.trim() === '' ? null : value,
  z.string().trim().url().max(2_000).nullable(),
).default(null);

export const ProfessorInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(300),
  department: optionalText(500),
  homepage: optionalUrl,
  scholarUrl: optionalUrl,
  email: z.preprocess((value) => typeof value === 'string' && value.trim() === '' ? null : value, z.string().trim().email().max(320).nullable()).default(null),
  researchAreas: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  recruitingStatus: RecruitingStatusSchema.default('unknown'),
  recruitingCheckedOn: z.preprocess(
    (value) => value === '' || value === undefined ? null : value,
    z.string().refine(isCalendarDate, 'Date must be a real date (YYYY-MM-DD).').nullable(),
  ).default(null),
  recruitingSourceUrl: optionalUrl,
  notes: z.string().trim().max(5_000).default(''),
});

export const OrganizationInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(500),
  country: optionalText(200),
  website: optionalUrl,
  notes: z.string().trim().max(5_000).default(''),
});

export type ProfessorInput = z.infer<typeof ProfessorInputSchema>;
export type OrganizationInput = z.infer<typeof OrganizationInputSchema>;
export type RecruitingStatus = z.infer<typeof RecruitingStatusSchema>;

export type Professor = ProfessorInput & {
  id: string;
  opportunityIds: string[];
};

export type OrganizationSummary = {
  id: string; name: string; country: string | null;
  professors: number; taking: number; openings: number; nextDeadline: string | null;
};

export type OrganizationDetail = OrganizationSummary & {
  website: string | null; notes: string;
  professorList: Professor[];
  opportunities: { id: string; name: string; category: string; deadline: string | null; postingStatus: string | null }[];
};
