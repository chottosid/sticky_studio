'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil } from 'lucide-react';
import { OrganizationInputSchema, type OrganizationInput } from '@/domain/lab/schema';
import { saveOrganizationAction } from '@/lib/lab-actions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function OrganizationDialog({ organizationId, initial }: { organizationId: string; initial: OrganizationInput }) {
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const save = async () => {
    const parsed = OrganizationInputSchema.safeParse(value);
    if (!parsed.success) {
      toast({ variant: 'destructive', title: 'Check this field', description: parsed.error.issues[0]?.message });
      return;
    }
    setSaving(true);
    try {
      const result = await saveOrganizationAction({ organizationId, organization: parsed.data });
      if (!result.success) throw new Error(result.message);
      toast({ title: result.message });
      setOpen(false);
      router.refresh();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Could not save', description: error instanceof Error ? error.message : 'Try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setValue(initial); setOpen(true); }}><Pencil aria-hidden /> Edit university</Button>
      <Dialog open={open} onOpenChange={(next) => !saving && setOpen(next)}>
        <DialogContent className="sm:max-w-xl" onInteractOutside={(event) => event.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Edit university</DialogTitle>
            <DialogDescription>Renaming keeps the old spelling, so new openings under it still land here.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="org-name">Name</Label>
              <Input id="org-name" value={value.name} onChange={(event) => setValue({ ...value, name: event.target.value })} required /></div>
            <div className="space-y-2"><Label htmlFor="org-country">Country</Label>
              <Input id="org-country" value={value.country ?? ''} onChange={(event) => setValue({ ...value, country: event.target.value || null })} /></div>
            <div className="space-y-2"><Label htmlFor="org-site">Website</Label>
              <Input id="org-site" type="url" placeholder="https://" value={value.website ?? ''} onChange={(event) => setValue({ ...value, website: event.target.value || null })} /></div>
            <div className="space-y-2"><Label htmlFor="org-notes">Notes</Label>
              <Textarea id="org-notes" rows={4} value={value.notes} onChange={(event) => setValue({ ...value, notes: event.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="animate-spin" />}{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
