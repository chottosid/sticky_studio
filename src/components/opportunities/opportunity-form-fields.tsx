'use client';

import * as React from 'react';
import type { Evidence, OpportunityCategory, OpportunityDraftValue } from '@/lib/types';
import { opportunityCategoryOptions } from '@/domain/opportunity/config';
import { parseListText } from '@/domain/opportunity/form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Props = {
  value: OpportunityDraftValue;
  onChange: (value: OpportunityDraftValue) => void;
  evidence?: Evidence[];
  unresolvedFields?: string[];
};

type CommonField = 'name' | 'details' | 'deadline' | 'organizationName' | 'organizationType'
  | 'location' | 'applicationUrl' | 'contactEmail' | 'eligibility' | 'requirements';

export function emptyOpportunity(category: OpportunityCategory = 'job'): OpportunityDraftValue {
  const common = {
    name: '', details: '', deadline: null, organizationName: null, organizationType: null,
    location: null, applicationUrl: null, contactEmail: null, eligibility: null, requirements: [],
  };
  if (category === 'higher-study') {
    return {
      ...common, category,
      attributes: {
        programName: null, degreeLevel: null, department: null, professorNames: [],
        labName: null, researchAreas: [], funding: null, startTerm: null,
      },
    };
  }
  if (category === 'contest') {
    return { ...common, category, attributes: { theme: null, prize: null, eventDate: null } };
  }
  return {
    ...common, category,
    attributes: {
      roleTitle: null, employmentType: null, workplaceMode: null,
      compensation: null, skills: [], duration: null,
    },
  };
}

function valueOrEmpty(value: string | null) {
  return value || '';
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((item, index) => item === b[index]);

/**
 * One item per line. The raw text is kept while typing (spaces, a trailing new line), and only
 * the parsed list is reported up, so typing never fights the cursor or splits an item.
 */
function ListTextarea({ id, value, onChange, rows = 3 }: {
  id: string; value: string[]; onChange: (value: string[]) => void; rows?: number;
}) {
  const [text, setText] = React.useState(() => value.join('\n'));
  // Re-sync only when the list changed from outside (another draft item, a category switch).
  React.useEffect(() => {
    setText((current) => (sameList(parseListText(current), value) ? current : value.join('\n')));
  }, [value]);
  return (
    <Textarea
      id={id}
      rows={rows}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(parseListText(event.target.value));
      }}
    />
  );
}

/** Where the extraction found this value, or that it found nothing. */
function FieldStatus({ field, evidence = [], unresolved = [] }: {
  field: string; evidence?: Evidence[]; unresolved?: string[];
}) {
  const item = evidence.find((entry) => entry.field === field);
  if (item) {
    return (
      <span className="ml-2 text-xs font-normal text-muted-foreground" title={item.excerpt || undefined}>
        {item.confidence === 'high' ? 'from the post' : `from the post, ${item.confidence} confidence`}
      </span>
    );
  }
  if (unresolved.includes(field)) {
    return <span className="ml-2 text-xs font-normal text-muted-foreground">not found in the post</span>;
  }
  return null;
}

export function OpportunityFormFields({ value, onChange, evidence = [], unresolvedFields = [] }: Props) {
  const updateCommon = (field: CommonField, nextValue: string | string[] | null) => {
    onChange({ ...value, [field]: nextValue } as OpportunityDraftValue);
  };
  const updateAttribute = (field: string, nextValue: string | string[] | null) => {
    onChange({
      ...value,
      attributes: { ...value.attributes, [field]: nextValue },
    } as OpportunityDraftValue);
  };
  const changeCategory = (category: OpportunityCategory) => {
    const empty = emptyOpportunity(category);
    onChange({
      ...empty,
      name: value.name,
      details: value.details,
      deadline: value.deadline,
      organizationName: value.organizationName,
      organizationType: value.organizationType,
      location: value.location,
      applicationUrl: value.applicationUrl,
      contactEmail: value.contactEmail,
      eligibility: value.eligibility,
      requirements: value.requirements,
    } as OpportunityDraftValue);
  };
  const label = (htmlFor: string, text: string, field = htmlFor) => (
    <Label htmlFor={htmlFor} className="flex flex-wrap items-baseline">
      {text}<FieldStatus field={field} evidence={evidence} unresolved={unresolvedFields} />
    </Label>
  );

  return (
    <div className="grid gap-5 py-2 md:grid-cols-2">
      <div className="space-y-2 md:col-span-2">
        {label('opportunity-name', 'Opportunity name')}
        <Input id="opportunity-name" value={value.name} onChange={(event) => updateCommon('name', event.target.value)} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="opportunity-category">Category</Label>
        <Select value={value.category} onValueChange={(category) => changeCategory(category as OpportunityCategory)}>
          <SelectTrigger id="opportunity-category"><SelectValue /></SelectTrigger>
          <SelectContent>
            {opportunityCategoryOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        {label('opportunity-deadline', 'Deadline (optional)', 'deadline')}
        <Input id="opportunity-deadline" type="date" value={valueOrEmpty(value.deadline)} onChange={(event) => updateCommon('deadline', event.target.value || null)} />
      </div>

      <div className="space-y-2">
        {label('organization-name', value.category === 'higher-study' ? 'University / institution' : value.category === 'contest' ? 'Organizer' : 'Company', 'organizationName')}
        <Input id="organization-name" value={valueOrEmpty(value.organizationName)} onChange={(event) => updateCommon('organizationName', event.target.value || null)} />
      </div>

      <div className="space-y-2">
        {label('organization-type', 'Organization type', 'organizationType')}
        <Input id="organization-type" value={valueOrEmpty(value.organizationType)} onChange={(event) => updateCommon('organizationType', event.target.value || null)} />
      </div>

      <div className="space-y-2">
        {label('location', 'Location')}
        <Input id="location" value={valueOrEmpty(value.location)} onChange={(event) => updateCommon('location', event.target.value || null)} />
      </div>

      <div className="space-y-2">
        {label('application-url', 'Application URL', 'applicationUrl')}
        <Input id="application-url" type="url" value={valueOrEmpty(value.applicationUrl)} onChange={(event) => updateCommon('applicationUrl', event.target.value || null)} />
      </div>

      <div className="space-y-2">
        {label('contact-email', 'Contact email', 'contactEmail')}
        <Input id="contact-email" type="email" value={valueOrEmpty(value.contactEmail)} onChange={(event) => updateCommon('contactEmail', event.target.value || null)} />
      </div>

      {value.category === 'higher-study' && (
        <>
          <div className="space-y-2">
            {label('program-name', 'Program / position', 'attributes.programName')}
            <Input id="program-name" value={valueOrEmpty(value.attributes.programName)} onChange={(event) => updateAttribute('programName', event.target.value || null)} />
          </div>
          <div className="space-y-2">
            {label('degree-level', 'Degree level', 'attributes.degreeLevel')}
            <Input id="degree-level" value={valueOrEmpty(value.attributes.degreeLevel)} onChange={(event) => updateAttribute('degreeLevel', event.target.value || null)} />
          </div>
          <div className="space-y-2">
            {label('department', 'Department', 'attributes.department')}
            <Input id="department" value={valueOrEmpty(value.attributes.department)} onChange={(event) => updateAttribute('department', event.target.value || null)} />
          </div>
          <div className="space-y-2">
            {label('lab-name', 'Lab / research group', 'attributes.labName')}
            <Input id="lab-name" value={valueOrEmpty(value.attributes.labName)} onChange={(event) => updateAttribute('labName', event.target.value || null)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            {label('professor-names', 'Professor names (one per line)', 'attributes.professorNames')}
            <ListTextarea id="professor-names" rows={2} value={value.attributes.professorNames} onChange={(list) => updateAttribute('professorNames', list)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            {label('research-areas', 'Research areas (one per line)', 'attributes.researchAreas')}
            <ListTextarea id="research-areas" rows={2} value={value.attributes.researchAreas} onChange={(list) => updateAttribute('researchAreas', list)} />
          </div>
          <div className="space-y-2">
            {label('funding', 'Funding / stipend', 'attributes.funding')}
            <Input id="funding" value={valueOrEmpty(value.attributes.funding)} onChange={(event) => updateAttribute('funding', event.target.value || null)} />
          </div>
          <div className="space-y-2">
            {label('start-term', 'Start term', 'attributes.startTerm')}
            <Input id="start-term" value={valueOrEmpty(value.attributes.startTerm)} onChange={(event) => updateAttribute('startTerm', event.target.value || null)} />
          </div>
        </>
      )}

      {(value.category === 'job' || value.category === 'internship') && (
        <>
          <div className="space-y-2">
            {label('role-title', 'Role title', 'attributes.roleTitle')}
            <Input id="role-title" value={valueOrEmpty(value.attributes.roleTitle)} onChange={(event) => updateAttribute('roleTitle', event.target.value || null)} />
          </div>
          <div className="space-y-2">
            {label('employment-type', 'Employment type', 'attributes.employmentType')}
            <Input id="employment-type" value={valueOrEmpty(value.attributes.employmentType)} onChange={(event) => updateAttribute('employmentType', event.target.value || null)} />
          </div>
          <div className="space-y-2">
            {label('workplace-mode', 'Workplace mode', 'attributes.workplaceMode')}
            <Input id="workplace-mode" value={valueOrEmpty(value.attributes.workplaceMode)} onChange={(event) => updateAttribute('workplaceMode', event.target.value || null)} />
          </div>
          <div className="space-y-2">
            {label('compensation', 'Compensation', 'attributes.compensation')}
            <Input id="compensation" value={valueOrEmpty(value.attributes.compensation)} onChange={(event) => updateAttribute('compensation', event.target.value || null)} />
          </div>
          <div className="space-y-2 md:col-span-2">
            {label('skills', 'Skills (one per line)', 'attributes.skills')}
            <ListTextarea id="skills" rows={2} value={value.attributes.skills} onChange={(list) => updateAttribute('skills', list)} />
          </div>
          {value.category === 'internship' && (
            <div className="space-y-2">
              {label('duration', 'Duration', 'attributes.duration')}
              <Input id="duration" value={valueOrEmpty(value.attributes.duration)} onChange={(event) => updateAttribute('duration', event.target.value || null)} />
            </div>
          )}
        </>
      )}

      {value.category === 'contest' && (
        <>
          <div className="space-y-2">
            {label('contest-theme', 'Theme', 'attributes.theme')}
            <Input id="contest-theme" value={valueOrEmpty(value.attributes.theme)} onChange={(event) => updateAttribute('theme', event.target.value || null)} />
          </div>
          <div className="space-y-2">
            {label('contest-prize', 'Prize', 'attributes.prize')}
            <Input id="contest-prize" value={valueOrEmpty(value.attributes.prize)} onChange={(event) => updateAttribute('prize', event.target.value || null)} />
          </div>
          <div className="space-y-2">
            {label('event-date', 'Event date', 'attributes.eventDate')}
            <Input id="event-date" value={valueOrEmpty(value.attributes.eventDate)} onChange={(event) => updateAttribute('eventDate', event.target.value || null)} />
          </div>
        </>
      )}

      <div className="space-y-2 md:col-span-2">
        {label('eligibility', 'Eligibility')}
        <Textarea id="eligibility" rows={3} value={valueOrEmpty(value.eligibility)} onChange={(event) => updateCommon('eligibility', event.target.value || null)} />
      </div>
      <div className="space-y-2 md:col-span-2">
        {label('requirements', 'Requirements (one per line)')}
        <ListTextarea id="requirements" value={value.requirements} onChange={(list) => updateCommon('requirements', list)} />
      </div>
      <div className="space-y-2 md:col-span-2">
        {label('details', 'Summary / notes')}
        <Textarea id="details" rows={6} value={value.details} onChange={(event) => updateCommon('details', event.target.value)} />
      </div>
    </div>
  );
}
