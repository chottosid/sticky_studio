export type Opportunity = {
  id: string;
  name: string;
  details: string;
  deadline?: string | null;
  documentUri: string;
  documentType: 'image' | 'pdf' | 'text' | 'unknown';
  created_at?: string;
};
