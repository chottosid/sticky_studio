'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Plus, Save, X } from 'lucide-react';
import { OpportunityInputSchema, type ExtractionSource } from '@/domain/opportunity/schema';
import { describeIssue } from '@/domain/opportunity/form';
import type { DuplicateMatch, ExtractionDraft, OpportunityDraftValue, OpportunityInput } from '@/lib/types';
import { addOpportunity } from '@/lib/actions';
import { extractOpportunityDraft } from '@/lib/extraction-actions';
import { saveTelegramDraft } from '@/lib/telegram-actions';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Asserted, not just annotated: the ternary's type is subtype-reduced (dropping the duplicate-warning
// variant), and an annotation alone narrows to that reduced type on assignment.
type SaveResult =
  | Awaited<ReturnType<typeof addOpportunity>>
  | Awaited<ReturnType<typeof saveTelegramDraft>>;

type DuplicateWarning = {
  matches: DuplicateMatch[];
  token: string;
};

type AddOpportunityDialogProps = {
  /** Opens straight into review for a Telegram inbox draft; sources stay on the server. */
  inboxItem?: { id: number; draft: ExtractionDraft | null };
  trigger?: React.ReactNode;
  onSaved?: () => void;
};

export function AddOpportunityDialog({ inboxItem, trigger, onSaved }: AddOpportunityDialogProps = {}) {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<'input' | 'review'>('input');
  const [activeTab, setActiveTab] = React.useState<'files' | 'text'>('files');
  const [files, setFiles] = React.useState<FileData[]>([]);
  const [text, setText] = React.useState('');
  const [draft, setDraft] = React.useState<ExtractionDraft | null>(null);
  const [items, setItems] = React.useState<OpportunityDraftValue[]>([emptyOpportunity()]);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [sources, setSources] = React.useState<ExtractionSource[]>([]);
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [duplicateWarning, setDuplicateWarning] = React.useState<DuplicateWarning | null>(null);
  const { toast } = useToast();
  // Bumped on every reset, so an extraction that finishes after the dialog closed is ignored.
  const session = React.useRef(0);

  const reset = React.useCallback(() => {
    session.current += 1;
    setStep('input');
    setActiveTab('files');
    setFiles([]);
    setText('');
    setDraft(null);
    setItems([emptyOpportunity()]);
    setActiveIndex(0);
    setSources([]);
    setIsExtracting(false);
    setIsSaving(false);
    setDuplicateWarning(null);
    if (inboxItem?.draft) {
      setDraft(inboxItem.draft);
      setItems(inboxItem.draft.opportunities.map((item) => item.opportunity));
      setStep('review');
    }
  }, [inboxItem]);

  // Also runs on mount (open=false), so an inbox dialog is already in review before it opens — no flash of the input step.
  React.useEffect(() => {
    reset();
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
    const started = session.current;
    try {
      const result = await extractOpportunityDraft({ sources: nextSources });
      if (started !== session.current) return;
      if (!result.success) throw new Error(result.message);
      if (!result.draft.opportunities.length) {
        toast({ title: 'No opportunities found', description: 'No opportunities found in these sources.' });
        return;
      }
      setSources(nextSources);
      setDraft(result.draft);
      setItems(result.draft.opportunities.map((item) => item.opportunity));
      setActiveIndex(0);
      setStep('review');
    } catch (error) {
      if (started !== session.current) return;
      toast({
        variant: 'destructive',
        title: 'Could not read the source',
        description: error instanceof Error ? error.message : 'The source could not be extracted.',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const removeItem = (index: number) => {
    if (!draft || items.length <= 1 || isSaving) return;
    const next = items.filter((_, itemIndex) => itemIndex !== index);
    setItems(next);
    // Keep draft entries aligned with items so evidence/unresolved fields stay on the right one.
    setDraft({ ...draft, opportunities: draft.opportunities.filter((_, itemIndex) => itemIndex !== index) });
    setActiveIndex((active) => Math.min(active > index ? active - 1 : active, next.length - 1));
  };

  const handleSave = async (duplicateConfirmationToken?: string) => {
    const parsedItems: OpportunityInput[] = [];
    for (const [index, item] of items.entries()) {
      const parsed = OpportunityInputSchema.safeParse(item);
      if (!parsed.success) {
        setActiveIndex(index);
        toast({
          variant: 'destructive',
          title: items.length > 1 ? `Check opportunity ${index + 1}` : 'Check this field',
          description: parsed.error.issues[0] ? describeIssue(parsed.error.issues[0]) : 'Some fields need attention.',
        });
        return;
      }
      parsedItems.push(parsed.data);
    }

    setIsSaving(true);
    try {
      const result = (inboxItem
        ? await saveTelegramDraft({
          telegramMessageId: inboxItem.id,
          opportunities: parsedItems,
          duplicateConfirmationToken,
        })
        : await addOpportunity({
          opportunities: parsedItems,
          sources,
          discoveredSourceUrls: draft?.discoveredSourceUrls || [],
          duplicateConfirmationToken,
        })) as SaveResult;
      if (!result.success && 'code' in result && result.code === 'DUPLICATE_WARNING') {
        setDuplicateWarning({
          matches: result.duplicateMatches,
          token: result.duplicateConfirmationToken,
        });
        return;
      }
      if (!result.success) throw new Error(result.message);
      toast({ title: result.message });
      setOpen(false);
      onSaved?.();
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
        {trigger ?? (
          <Button size="sm">
            <Plus aria-hidden />
            <span>Add<span className="sr-only sm:not-sr-only"> opportunity</span></span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"
        // Reviewed edits are easy to lose: only Cancel or the close button may discard them.
        onInteractOutside={(event) => { if (step === 'review' || isExtracting || isSaving) event.preventDefault(); }}
        onEscapeKeyDown={(event) => { if (step === 'review' || isSaving) event.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{step === 'input' ? 'Add an opportunity' : 'Review before saving'}</DialogTitle>
          <DialogDescription>
            {step === 'input'
              ? 'Add a screenshot, PDF or the post text. You review the details before anything is saved.'
              : 'Check each field against the post. Empty optional fields are fine.'}
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
                <UnifiedImageInput files={files} onFilesChange={setFiles} disabled={isExtracting} />
              </TabsContent>
              <TabsContent value="text" className="space-y-2 py-3">
                <Label htmlFor="opportunity-source-text">Post text</Label>
                <Textarea id="opportunity-source-text" rows={12} maxLength={200_000} value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste the announcement, including any links" />
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>
              <Button onClick={handleExtract} disabled={isExtracting}>
                {isExtracting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isExtracting ? 'Reading the post…' : 'Read details'}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            {draft?.warnings.length ? (
              <div className="rounded-md border-l-4 border-highlight bg-highlight/15 p-3 text-sm">
                <p className="font-medium">Check these</p>
                <ul className="mt-1 list-disc pl-5">{draft.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </div>
            ) : null}
            {items.length > 1 ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  This post has {items.length} opportunities. Review each one and remove any you
                  don&apos;t want. The rest are saved together.
                </p>
                <ul className="divide-y rounded-md border bg-card" aria-label="Opportunities in this post">
                  {items.map((item, index) => (
                    <li key={index} className="flex items-center">
                      <button
                        type="button"
                        onClick={() => setActiveIndex(index)}
                        aria-current={index === activeIndex ? 'true' : undefined}
                        className={cn(
                          'min-w-0 flex-1 truncate border-l-2 border-transparent px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
                          index === activeIndex && 'border-primary bg-accent font-medium',
                        )}
                      >
                        {item.name || 'Unnamed opportunity'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        disabled={isSaving}
                        aria-label={`Don't save ${item.name || 'this opportunity'}`}
                        title="Don't save this one"
                        className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <OpportunityFormFields
              value={items[activeIndex]}
              onChange={(value) => setItems(items.map((item, index) => (index === activeIndex ? value : item)))}
              evidence={draft?.opportunities[activeIndex]?.evidence}
              unresolvedFields={draft?.opportunities[activeIndex]?.unresolvedFields}
            />
            <DialogFooter>
              {!inboxItem && (
                <Button variant="ghost" onClick={() => setStep('input')} disabled={isSaving}>Back</Button>
              )}
              <Button onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isSaving ? 'Saving…' : items.length > 1 ? `Save ${items.length} opportunities` : 'Save opportunity'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
      <AlertDialog
        open={Boolean(duplicateWarning)}
        onOpenChange={(nextOpen) => { if (!nextOpen && !isSaving) setDuplicateWarning(null); }}
      >
        <AlertDialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>This may already be saved</AlertDialogTitle>
            <AlertDialogDescription>
              Compare with the saved entries below. Nothing has been saved yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            {duplicateWarning?.matches.map((match) => (
              <div key={`${match.draftName ?? ''}-${match.id}`} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link
                      href={`/opportunity/${match.id}`}
                      target="_blank"
                      className="font-medium text-primary hover:underline"
                    >
                      {match.name} <ExternalLink className="inline h-3.5 w-3.5" />
                    </Link>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[match.organizationName, match.deadline ? `deadline ${match.deadline}` : 'no deadline']
                        .filter(Boolean).join(', ')}
                    </p>
                  </div>
                  <Badge variant={match.confidence === 'high' ? 'destructive' : 'secondary'}>
                    {match.confidence === 'high' ? 'Likely the same' : 'Possibly the same'}
                  </Badge>
                </div>
                <p className="mt-2 text-sm">{match.reason}</p>
                {match.draftName ? (
                  <p className="mt-1 text-xs text-muted-foreground">Matches the draft being saved: {match.draftName}</p>
                ) : null}
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancel save</AlertDialogCancel>
            <AlertDialogAction
              disabled={isSaving || !duplicateWarning}
              onClick={(event) => {
                event.preventDefault();
                if (duplicateWarning) void handleSave(duplicateWarning.token);
              }}
            >
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save as new
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
