'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save } from 'lucide-react';
import { updateOpportunityAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { Opportunity } from '@/lib/types';

interface EditOpportunityDialogProps {
  opportunity: Opportunity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function EditOpportunityDialog({
  opportunity,
  open,
  onOpenChange,
  onSuccess,
}: EditOpportunityDialogProps) {
  const [isSaving, setIsSaving] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  const handleSave = async () => {
    if (!formRef.current) return;

    setIsSaving(true);
    const formData = new FormData(formRef.current);
    
    // Get form values and handle null/empty cases properly
    const name = formData.get('name');
    const details = formData.get('details');
    const deadline = formData.get('deadline');
    
    const opportunityData = {
      id: opportunity.id,
      name: typeof name === 'string' ? name : '',
      details: typeof details === 'string' ? details : '',
      deadline: typeof deadline === 'string' && deadline.trim() !== '' ? deadline : undefined,
    };

    try {
      const result = await updateOpportunityAction(opportunityData);
      if (result.success) {
        toast({
          title: 'Success!',
          description: result.message,
        });
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast({
          variant: 'destructive',
          title: 'An error occurred',
          description: result.message,
        });
      }
    } catch (error) {
      console.error('Save failed:', error);
      toast({
        variant: 'destructive',
        title: 'Save Failed',
        description: 'Could not update the opportunity.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Opportunity</DialogTitle>
          <DialogDescription>
            Update the details of your opportunity.
          </DialogDescription>
        </DialogHeader>

        <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Opportunity Name</Label>
              <Input
                id="edit-name"
                name="name"
                defaultValue={opportunity.name}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-details">Details</Label>
              <Textarea
                id="edit-details"
                name="details"
                defaultValue={opportunity.details}
                required
                rows={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-deadline">Deadline (YYYY-MM-DD)</Label>
              <Input
                id="edit-deadline"
                name="deadline"
                type="date"
                defaultValue={opportunity.deadline || ''}
                placeholder="No deadline"
              />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}