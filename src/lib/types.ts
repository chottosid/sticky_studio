export type Opportunity = {
  id: string;
  name: string;
  details: string;
  deadline?: string;
  documentUri: string;
  documentType: 'image' | 'pdf' | 'text' | 'unknown';
};
