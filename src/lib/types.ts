export type OpportunityCategory = 'job' | 'internship' | 'contest' | 'higher-study';

export type Opportunity = {
  id: string;
  name: string;
  details: string;
  deadline?: string | null;
  documentUri: string;
  documentType: 'image' | 'pdf' | 'text' | 'unknown';
  category: OpportunityCategory;
  created_at?: string;
};
