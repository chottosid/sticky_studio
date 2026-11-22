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

import type { Evidence, OpportunityInput } from '@/domain/opportunity/schema';
import type { ProfileAssessments } from '@/domain/opportunity/assessment';

export type DocumentType = 'image' | 'pdf' | 'text' | 'unknown';

export type OpportunitySource = {
  id: string;
  sourceType: 'upload' | 'pasted-text' | 'submitted-url' | 'enriched-url';
  originalName: string | null;
  mimeType: string | null;
  storagePath: string | null;
  sourceUrl: string | null;
};

export type Opportunity = OpportunityInput & {
  id: string;
  sources: OpportunitySource[];
  created_at?: string;
  updated_at?: string;
  contentRevision?: number;
  /** The organizations row this opportunity belongs to; null until resolved. */
  organizationId?: string | null;
  profileAssessments?: ProfileAssessments;
  fieldEvidence?: Evidence[];
  /** Compatibility fields while legacy document_uri rows are migrated. */
  documentUri?: string;
  documentType?: DocumentType;
};

export type OpportunityListRow = Pick<Opportunity, 'id' | 'name' | 'category' | 'deadline' | 'postingStatus' | 'organizationName' | 'location'> & {
  actions: Partial<Record<import('@/domain/opportunity/assessment').CandidateId, import('@/domain/opportunity/workflow').NextAction>>;
};
