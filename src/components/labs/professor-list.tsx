'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { ExternalLink, GraduationCap, Loader2, Mail, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  ProfessorInputSchema, recruitingStatuses, recruitingStatusLabels,
  type Professor, type ProfessorInput, type RecruitingStatus,
} from '@/domain/lab/schema';
import { parseListText } from '@/domain/opportunity/form';
import { deleteProfessorAction, saveProfessorAction } from '@/lib/lab-actions';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Opening = { id: string; name: string };
type Props = { organizationId: string; professors: Professor[]; openings: Opening[] };

const statusStyle: Record<RecruitingStatus, string> = {
  taking: 'bg-primary/10 text-primary',
  not_taking: 'bg-destructive/10 text-destructive',
  unknown: 'bg-secondary text-muted-foreground',
};

const blank: ProfessorInput = {
  name: '', department: null, homepage: null, scholarUrl: null, email: null, researchAreas: [],
  recruitingStatus: 'unknown', recruitingCheckedOn: null, recruitingSourceUrl: null, notes: '',
};

const toInput = (p: Professor): ProfessorInput => ({
  name: p.name, department: p.department, homepage: p.homepage, scholarUrl: p.scholarUrl, email: p.email,
  researchAreas: p.researchAreas, recruitingStatus: p.recruitingStatus, recruitingCheckedOn: p.recruitingCheckedOn,
  recruitingSourceUrl: p.recruitingSourceUrl, notes: p.notes,
});

export function ProfessorList({ organizationId, professors, openings }: Props) {
  const [editing, setEditing] = React.useState<{ professor?: Professor } | null>(null);
  const [removing, setRemoving] = React.useState<Professor | null>(null);
  const [filter, setFilter] = React.useState<'all' | RecruitingStatus>('all');
  const names = new Map(openings.map((o) => [o.id, o.name]));
  const shown = professors.filter((p) => filter === 'all' || p.recruitingStatus === filter);

  return (
    <section aria-labelledby="professors-heading" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="professors-heading" className="font-display text-2xl font-semibold">Professors <span className="text-base font-normal text-muted-foreground">({professors.length})</span></h2>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Filter by recruiting status" className="flex gap-1 rounded-xl border bg-card p-1 text-sm">
            {(['all', ...recruitingStatuses] as const).map((value) => (
              <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
                className={cn('rounded-lg px-2.5 py-1 font-medium text-muted-foreground hover:text-foreground', filter === value && 'bg-accent text-accent-foreground')}>
                {value === 'all' ? 'All' : recruitingStatusLabels[value]}
              </button>
            ))}
          </div>
          <Button onClick={() => setEditing({})}><Plus aria-hidden /> Add professor</Button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
          {professors.length === 0 ? 'No professors tracked here yet. Add one to start a list for this university.' : 'No professors match this filter.'}
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {shown.map((p) => (
            <li key={p.id} className="min-w-0 rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-semibold leading-snug">{p.name}</h3>
                  {p.department && <p className="text-sm text-muted-foreground">{p.department}</p>}
                </div>
                <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold', statusStyle[p.recruitingStatus])}>
                  {recruitingStatusLabels[p.recruitingStatus]}
                </span>
              </div>
              {p.recruitingCheckedOn && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Checked {format(parseISO(p.recruitingCheckedOn), 'd MMM yyyy')}
                  {p.recruitingSourceUrl && <> · <a href={p.recruitingSourceUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">source</a></>}
                </p>
              )}
              {p.researchAreas.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Research areas">
                  {p.researchAreas.map((area) => <li key={area} className="rounded-md bg-secondary px-2 py-0.5 text-xs">{area}</li>)}
                </ul>
              )}
              {p.notes && <p className="mt-3 whitespace-pre-wrap break-words text-sm">{p.notes}</p>}
              {p.opportunityIds.length > 0 && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Openings: {p.opportunityIds.map((id, index) => (
                    <React.Fragment key={id}>{index > 0 && ', '}<Link href={`/opportunity/${id}`} className="text-primary underline-offset-4 hover:underline">{names.get(id) ?? `#${id}`}</Link></React.Fragment>
                  ))}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-1 border-t pt-3">
                {p.homepage && <Button asChild variant="ghost" size="sm"><a href={p.homepage} target="_blank" rel="noreferrer"><ExternalLink aria-hidden /> Homepage</a></Button>}
                {p.scholarUrl && <Button asChild variant="ghost" size="sm"><a href={p.scholarUrl} target="_blank" rel="noreferrer"><GraduationCap aria-hidden /> Scholar</a></Button>}
                {p.email && <Button asChild variant="ghost" size="sm"><a href={`mailto:${p.email}`}><Mail aria-hidden /> Email</a></Button>}
                <span className="ml-auto flex gap-1">
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Edit ${p.name}`} onClick={() => setEditing({ professor: p })}><Pencil aria-hidden /></Button>
                  <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" aria-label={`Remove ${p.name}`} onClick={() => setRemoving(p)}><Trash2 aria-hidden /></Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && <ProfessorDialog organizationId={organizationId} professor={editing.professor} onClose={() => setEditing(null)} />}
      {removing && <RemoveProfessorDialog organizationId={organizationId} professor={removing} onClose={() => setRemoving(null)} />}
    </section>
  );
}

function ProfessorDialog({ organizationId, professor, onClose }: { organizationId: string; professor?: Professor; onClose: () => void }) {
  const [value, setValue] = React.useState<ProfessorInput>(() => (professor ? toInput(professor) : blank));
  const [areas, setAreas] = React.useState(() => (professor?.researchAreas ?? []).join(', '));
  const [saving, setSaving] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const set = <K extends keyof ProfessorInput>(key: K, next: ProfessorInput[K]) => setValue((current) => ({ ...current, [key]: next }));
  const text = (key: 'department' | 'homepage' | 'scholarUrl' | 'email' | 'recruitingSourceUrl') => ({
    value: value[key] ?? '', onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value || null),
  });

  const save = async () => {
    const parsed = ProfessorInputSchema.safeParse({ ...value, researchAreas: parseListText(areas.replace(/,/g, '\n')) });
    if (!parsed.success) {
      toast({ variant: 'destructive', title: 'Check this field', description: parsed.error.issues[0]?.message });
      return;
    }
    setSaving(true);
    try {
      const result = await saveProfessorAction({ organizationId, professorId: professor?.id, professor: parsed.data });
      if (!result.success) throw new Error(result.message);
      toast({ title: result.message });
      onClose();
      router.refresh();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not save', description: error instanceof Error ? error.message : 'Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{professor ? 'Edit professor' : 'Add professor'}</DialogTitle>
          <DialogDescription>Only the name is required. Record where you confirmed that they are taking students.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2"><Label htmlFor="prof-name">Name</Label>
            <Input id="prof-name" value={value.name} onChange={(event) => set('name', event.target.value)} required /></div>
          <div className="space-y-2"><Label htmlFor="prof-dept">Department or lab</Label><Input id="prof-dept" {...text('department')} /></div>
          <div className="space-y-2"><Label htmlFor="prof-email">Email</Label><Input id="prof-email" type="email" {...text('email')} /></div>
          <div className="space-y-2"><Label htmlFor="prof-home">Homepage</Label><Input id="prof-home" type="url" placeholder="https://" {...text('homepage')} /></div>
          <div className="space-y-2"><Label htmlFor="prof-scholar">Google Scholar</Label><Input id="prof-scholar" type="url" placeholder="https://" {...text('scholarUrl')} /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="prof-areas">Research areas (comma separated)</Label>
            <Input id="prof-areas" value={areas} onChange={(event) => setAreas(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="prof-status">Taking students?</Label>
            <select id="prof-status" value={value.recruitingStatus} onChange={(event) => set('recruitingStatus', event.target.value as RecruitingStatus)}
              className="h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {recruitingStatuses.map((status) => <option key={status} value={status}>{recruitingStatusLabels[status]}</option>)}
            </select></div>
          <div className="space-y-2"><Label htmlFor="prof-checked">Checked on</Label>
            <Input id="prof-checked" type="date" value={value.recruitingCheckedOn ?? ''} onChange={(event) => set('recruitingCheckedOn', event.target.value || null)} /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="prof-source">Where you checked (URL)</Label>
            <Input id="prof-source" type="url" placeholder="https://" {...text('recruitingSourceUrl')} /></div>
          <div className="space-y-2 md:col-span-2"><Label htmlFor="prof-notes">Notes</Label>
            <Textarea id="prof-notes" rows={4} value={value.notes} onChange={(event) => set('notes', event.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />}{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RemoveProfessorDialog({ organizationId, professor, onClose }: { organizationId: string; professor: Professor; onClose: () => void }) {
  const [removing, setRemoving] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const remove = async () => {
    setRemoving(true);
    try {
      const result = await deleteProfessorAction({ organizationId, professorId: professor.id });
      if (!result.success) throw new Error(result.message);
      toast({ title: result.message });
      onClose();
      router.refresh();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not remove', description: error instanceof Error ? error.message : 'Try again.' });
      setRemoving(false);
    }
  };
  return (
    <AlertDialog open onOpenChange={(open) => !open && !removing && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {professor.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Their notes and status are deleted. Openings that mention them stay, but are no longer linked to this person. If an opening still lists
            the name, saving that opening again recreates the entry.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={(event) => { event.preventDefault(); void remove(); }} disabled={removing}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {removing ? <Loader2 className="animate-spin" /> : <Trash2 />} Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
