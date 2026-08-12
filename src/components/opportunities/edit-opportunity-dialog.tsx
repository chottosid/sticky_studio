'use client';

import * as React from 'react';
import { Loader2, Save } from 'lucide-react';
import { OpportunityInputSchema } from '@/domain/opportunity/schema';
import type { Opportunity, OpportunityDraftValue } from '@/lib/types';
import { updateOpportunityAction } from '@/lib/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { OpportunityFormFields } from './opportunity-form-fields';

type Props = {
  opportunity: Opportunity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
};

function editableValue(opportunity: Opportunity): OpportunityDraftValue {
  return OpportunityInputSchema.parse(opportunity);
}

export function EditOpportunityDialog({ opportunity, open, onOpenChange, onSuccess }: Props) {
  const [isSaving, setIsSaving] = React.useState(false);
  const [value, setValue] = React.useState<OpportunityDraftValue>(() => editableValue(opportunity));
  const { toast } = useToast();

  React.useEffect(() => {
    if (open) setValue(editableValue(opportunity));
  }, [open, opportunity]);

  const handleSave = async () => {
    const parsed = OpportunityInputSchema.safeParse(value);
    if (!parsed.success) {
      toast({ variant: 'destructive', title: 'Review required', description: parsed.error.issues[0]?.message });
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateOpportunityAction({ id: opportunity.id, opportunity: parsed.data });
      if (!result.success) throw new Error(result.message);
      toast({ title: 'Opportunity updated', description: result.message });
      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not update the opportunity.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Edit opportunity</DialogTitle>
          <DialogDescription>All extracted fields remain editable. Deadline is optional.</DialogDescription>
        </DialogHeader>
        <OpportunityFormFields value={value} onChange={setValue} />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
