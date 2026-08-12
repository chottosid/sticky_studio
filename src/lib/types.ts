export type {
  ContestAttributes,
  EmploymentAttributes,
  Evidence,
  ExtractionDraft,
  ExtractionSource,
  DuplicateMatch,
  HigherStudyAttributes,
  OpportunityCategory,
  OpportunityDraftValue,
  OpportunityInput,
} from '@/domain/opportunity/schema';

import type { OpportunityInput } from '@/domain/opportunity/schema';

export type DocumentType = 'image' | 'pdf' | 'text' | 'unknown';

export type OpportunitySource = {
  id: string;
  sourceType: 'upload' | 'pasted-text' | 'submitted-url' | 'enriched-url';
  originalName: string | null;
  mimeType: string | null;
  storagePath: string | null;
  sourceUrl: string | null;
  signedUrl?: string | null;
};

export type Opportunity = OpportunityInput & {
  id: string;
  sources: OpportunitySource[];
  created_at?: string;
  updated_at?: string;
  /** Compatibility fields while legacy document_uri rows are migrated. */
  documentUri?: string;
  documentType?: DocumentType;
};
