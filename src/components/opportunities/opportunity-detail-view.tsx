'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, CalendarDays, Edit, ExternalLink, Trash2 } from 'lucide-react';
import type { Opportunity } from '@/lib/types';
import { opportunityCategoryLabels } from '@/domain/opportunity/config';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useDeadlineStatus } from '@/hooks/use-deadline-status';
import { EditOpportunityDialog } from './edit-opportunity-dialog';
import { DeleteOpportunityDialog } from './delete-opportunity-dialog';

type Props = { opportunity: Opportunity };

function Field({ label, value }: { label: string; value: string | string[] | null | undefined }) {
  if (!value || (Array.isArray(value) && value.length === 0)) return null;
  return (
    <div>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 whitespace-pre-wrap">{Array.isArray(value) ? value.join(', ') : value}</dd>
    </div>
  );
}

export default function OpportunityDetailView({ opportunity }: Props) {
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const router = useRouter();
  const { isPast } = useDeadlineStatus(opportunity.deadline);
  const deadline = opportunity.deadline ? format(parseISO(opportunity.deadline), 'MMMM do, yyyy') : null;
  const sourceLinks = opportunity.sources.length
    ? opportunity.sources.map((source) => ({
      id: source.id,
      label: source.originalName || source.sourceUrl || 'Source',
      url: source.signedUrl || source.sourceUrl,
    }))
    : opportunity.documentUri
      ? [{ id: 'legacy', label: 'Legacy source document', url: opportunity.documentUri }]
      : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button variant="outline" onClick={() => router.back()}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>
      <Card>
        <CardHeader>
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <CardTitle className="text-3xl">{opportunity.name}</CardTitle>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge variant="outline">{opportunityCategoryLabels[opportunity.category]}</Badge>
                <Badge variant={isPast ? 'destructive' : 'secondary'}>
                  <CalendarDays className="mr-1 h-3.5 w-3.5" />
                  {deadline ? `${isPast ? 'Closed' : 'Deadline'}: ${deadline}` : 'No deadline'}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}><Edit className="mr-2 h-4 w-4" />Edit</Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteDialogOpen(true)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <section>
            <h2 className="mb-4 text-xl font-semibold">Key information</h2>
            <dl className="grid gap-5 md:grid-cols-2">
              <Field label="Organization" value={opportunity.organizationName} />
              <Field label="Organization type" value={opportunity.organizationType} />
              <Field label="Location" value={opportunity.location} />
              <Field label="Contact" value={opportunity.contactEmail} />
              <Field label="Application URL" value={opportunity.applicationUrl} />
              {opportunity.category === 'higher-study' && (
                <>
                  <Field label="Program / position" value={opportunity.attributes.programName} />
                  <Field label="Degree level" value={opportunity.attributes.degreeLevel} />
                  <Field label="Department" value={opportunity.attributes.department} />
                  <Field label="Professors" value={opportunity.attributes.professorNames} />
                  <Field label="Lab / research group" value={opportunity.attributes.labName} />
                  <Field label="Research areas" value={opportunity.attributes.researchAreas} />
                  <Field label="Funding / stipend" value={opportunity.attributes.funding} />
                  <Field label="Start term" value={opportunity.attributes.startTerm} />
                </>
              )}
              {(opportunity.category === 'job' || opportunity.category === 'internship') && (
                <>
                  <Field label="Role" value={opportunity.attributes.roleTitle} />
                  <Field label="Employment type" value={opportunity.attributes.employmentType} />
                  <Field label="Workplace mode" value={opportunity.attributes.workplaceMode} />
                  <Field label="Compensation" value={opportunity.attributes.compensation} />
                  <Field label="Skills" value={opportunity.attributes.skills} />
                  {opportunity.category === 'internship' && <Field label="Duration" value={opportunity.attributes.duration} />}
                </>
              )}
              {opportunity.category === 'contest' && (
                <>
                  <Field label="Theme" value={opportunity.attributes.theme} />
                  <Field label="Prize" value={opportunity.attributes.prize} />
                  <Field label="Event date" value={opportunity.attributes.eventDate} />
                </>
              )}
              <Field label="Eligibility" value={opportunity.eligibility} />
              <Field label="Requirements" value={opportunity.requirements} />
            </dl>
          </section>

          {opportunity.details && (
            <section>
              <h2 className="mb-2 text-xl font-semibold">Summary / notes</h2>
              <p className="whitespace-pre-wrap text-foreground/80">{opportunity.details}</p>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-xl font-semibold">Sources</h2>
            {sourceLinks.length ? (
              <div className="flex flex-wrap gap-2">
                {sourceLinks.map((source) => source.url && (
                  <Button key={source.id} variant="outline" asChild>
                    <a href={source.url} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />{source.label}</a>
                  </Button>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground">No source document is attached.</p>}
          </section>
        </CardContent>
      </Card>

      <EditOpportunityDialog
        opportunity={opportunity}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={() => router.refresh()}
      />
      <DeleteOpportunityDialog
        opportunity={opportunity}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={() => router.push('/')}
      />
    </div>
  );
}
