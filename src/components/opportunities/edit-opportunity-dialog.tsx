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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save } from 'lucide-react';
import { updateOpportunityAction } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { Opportunity, OpportunityCategory } from '@/lib/types';

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
  const [name, setName] = React.useState(opportunity.name);
  const [details, setDetails] = React.useState(opportunity.details);
  const [deadline, setDeadline] = React.useState(opportunity.deadline || '');
  const [selectedCategory, setSelectedCategory] = React.useState<OpportunityCategory>(opportunity.category || 'job');
  const { toast } = useToast();

  // Sync state when opportunity prop changes (e.g., when dialog opens with different opportunity)
  React.useEffect(() => {
    if (open) {
      setName(opportunity.name);
      setDetails(opportunity.details);
      setDeadline(opportunity.deadline || '');
      setSelectedCategory(opportunity.category || 'job');
    }
  }, [open, opportunity]);

  const handleSave = async () => {
    setIsSaving(true);

    const opportunityData = {
      id: opportunity.id,
      name: name,
      details: details,
      deadline: deadline && deadline.trim() !== '' ? deadline : undefined,
      category: selectedCategory,
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

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Opportunity Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-details">Details</Label>
            <Textarea
              id="edit-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              required
              rows={6}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-deadline">Deadline (YYYY-MM-DD)</Label>
            <Input
              id="edit-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              placeholder="No deadline"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-category">Category</Label>
            <Select
              value={selectedCategory}
              onValueChange={(value) => setSelectedCategory(value as OpportunityCategory)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="job">Job</SelectItem>
                <SelectItem value="internship">Internship</SelectItem>
                <SelectItem value="contest">Contest</SelectItem>
                <SelectItem value="higher-study">Higher Study</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

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
