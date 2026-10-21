import type { ZodIssue } from 'zod';

/** One item per line; commas stay inside items ("Python, Java, and C++" is one requirement). */
export function parseListText(text: string): string[] {
  return Array.from(new Set(text.split('\n').map((item) => item.trim()).filter(Boolean)));
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  details: 'Summary',
  deadline: 'Deadline',
  organizationName: 'Organization',
  organizationType: 'Organization type',
  location: 'Location',
  applicationUrl: 'Application URL',
  contactEmail: 'Contact email',
  eligibility: 'Eligibility',
  requirements: 'Requirements',
  'attributes.roleTitle': 'Role title',
  'attributes.compensation': 'Compensation',
  'attributes.skills': 'Skills',
  'attributes.programName': 'Program',
  'attributes.professorNames': 'Professors',
  'attributes.researchAreas': 'Research areas',
  'attributes.funding': 'Funding',
  'attributes.theme': 'Theme',
  'attributes.prize': 'Prize',
};

/** "Application URL: Invalid url" instead of a bare "Invalid url" from a 20-field form. */
export function describeIssue(issue: Pick<ZodIssue, 'path' | 'message'>): string {
  const label = FIELD_LABELS[issue.path.join('.')];
  return label ? `${label}: ${issue.message}` : issue.message;
}
