'use client';

import * as React from 'react';
import { Loader2, PlusCircle, Save } from 'lucide-react';
import { OpportunityInputSchema, type ExtractionSource } from '@/domain/opportunity/schema';
import type { ExtractionDraft, OpportunityDraftValue } from '@/lib/types';
import { addOpportunity } from '@/lib/actions';
import { extractOpportunityDraft } from '@/lib/extraction-actions';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { UnifiedImageInput, type FileData } from '@/components/ui/unified-image-input';
import { useToast } from '@/hooks/use-toast';
import { emptyOpportunity, OpportunityFormFields } from './opportunity-form-fields';

export function AddOpportunityDialog() {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<'input' | 'review'>('input');
  const [activeTab, setActiveTab] = React.useState<'files' | 'text'>('files');
  const [files, setFiles] = React.useState<FileData[]>([]);
  const [text, setText] = React.useState('');
  const [draft, setDraft] = React.useState<ExtractionDraft | null>(null);
  const [opportunity, setOpportunity] = React.useState<OpportunityDraftValue>(emptyOpportunity());
  const [sources, setSources] = React.useState<ExtractionSource[]>([]);
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const { toast } = useToast();

  const reset = React.useCallback(() => {
    setStep('input');
    setActiveTab('files');
    setFiles([]);
    setText('');
    setDraft(null);
    setOpportunity(emptyOpportunity());
    setSources([]);
    setIsExtracting(false);
    setIsSaving(false);
  }, []);

  React.useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const buildSources = (): ExtractionSource[] => {
    if (activeTab === 'text') {
      return text.trim() ? [{ id: 'source-1', kind: 'text', name: 'Pasted text', mimeType: 'text/plain', text: text.trim() }] : [];
    }
    return files.map((file, index) => ({
      id: `source-${index + 1}`,
      kind: file.type,
      name: file.name,
      mimeType: file.mimeType,
      dataUri: file.dataUri,
    }));
  };

  const handleExtract = async () => {
    const nextSources = buildSources();
    if (!nextSources.length) {
      toast({ variant: 'destructive', title: 'No input', description: 'Upload a document or paste opportunity text.' });
      return;
    }

    setIsExtracting(true);
    try {
      const result = await extractOpportunityDraft({ sources: nextSources });
      if (!result.success) throw new Error(result.message);
      setSources(nextSources);
      setDraft(result.draft);
      setOpportunity(result.draft.opportunity);
      setStep('review');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Extraction failed',
        description: error instanceof Error ? error.message : 'The source could not be extracted.',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    const parsed = OpportunityInputSchema.safeParse(opportunity);
    if (!parsed.success) {
      toast({
        variant: 'destructive',
        title: 'Review required',
        description: parsed.error.issues[0]?.message || 'Please check the opportunity fields.',
      });
      return;
    }

    setIsSaving(true);
    try {
      const result = await addOpportunity({
        opportunity: parsed.data,
        sources,
        discoveredSourceUrls: draft?.discoveredSourceUrls || [],
      });
      if (!result.success) throw new Error(result.message);
      toast({ title: 'Opportunity saved', description: result.message });
      setOpen(false);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error instanceof Error ? error.message : 'Could not save the opportunity.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1">
          <PlusCircle className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">Add Opportunity</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{step === 'input' ? 'Extract an opportunity' : 'Review every field'}</DialogTitle>
          <DialogDescription>
            {step === 'input'
              ? 'Extraction creates a draft only. Nothing is saved until you confirm it.'
              : 'Edit any value, including the category. Blank optional fields are accepted.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'input' ? (
          <>
            <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'files' | 'text')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="files">Files</TabsTrigger>
                <TabsTrigger value="text">Paste text</TabsTrigger>
              </TabsList>
              <TabsContent value="files" className="py-3">
                <UnifiedImageInput onFilesSelect={setFiles} selectedFiles={files} disabled={isExtracting} multiple />
              </TabsContent>
              <TabsContent value="text" className="space-y-2 py-3">
                <Label htmlFor="opportunity-source-text">Opportunity text</Label>
                <Textarea id="opportunity-source-text" rows={12} value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste the announcement and any useful links…" />
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
              <Button onClick={handleExtract} disabled={isExtracting}>
                {isExtracting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isExtracting ? 'Extracting and checking links…' : 'Extract draft'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {draft?.warnings.length ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Extraction notes</p>
                <ul className="mt-1 list-disc pl-5">{draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </div>
            ) : null}
            <OpportunityFormFields
              value={opportunity}
              onChange={setOpportunity}
              evidence={draft?.evidence}
              unresolvedFields={draft?.unresolvedFields}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('input')} disabled={isSaving}>Back</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? 'Saving…' : 'Save Opportunity'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
