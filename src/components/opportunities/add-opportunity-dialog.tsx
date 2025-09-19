'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlusCircle, Loader2, Save } from 'lucide-react';
import { addOpportunity } from '@/lib/actions';
import { extractOpportunityDetails } from '@/ai/flows/extract-opportunity-details';
import { useToast } from '@/hooks/use-toast';
import { UnifiedImageInput } from '@/components/ui/unified-image-input';
import type { Opportunity } from '@/lib/types';

// Helper function to safely encode text to base64 with Unicode support
function encodeTextToBase64(text: string): string {
  try {
    // Method 1: Use btoa with proper Unicode encoding
    return btoa(unescape(encodeURIComponent(text)));
  } catch (error) {
    try {
      // Method 2: Fallback using TextEncoder for better Unicode support
      const encoder = new TextEncoder();
      const uint8Array = encoder.encode(text);
      return btoa(String.fromCharCode(...uint8Array));
    } catch (fallbackError) {
      // Method 3: Final fallback - remove problematic characters
      const cleanText = text.replace(/[^\x00-\x7F]/g, ''); // Remove non-ASCII
      return btoa(cleanText);
    }
  }
}

type ExtractedData = Omit<Opportunity, 'id' | 'documentUri' | 'documentType'>;

export function AddOpportunityDialog() {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<'input' | 'review'>('input');
  const [activeTab, setActiveTab] = React.useState('image');
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Input states
  const [selectedFile, setSelectedFile] = React.useState<{
    name: string;
    dataUri: string;
    type: 'image' | 'pdf' | 'unknown';
  } | null>(null);
  const [textInput, setTextInput] = React.useState('');

  // Review states
  const [extractedData, setExtractedData] = React.useState<ExtractedData | null>(null);
  const [finalDocumentUri, setFinalDocumentUri] = React.useState('');
  const [finalDocumentType, setFinalDocumentType] = React.useState<'image' | 'pdf' | 'text' | 'unknown'>('unknown');

  const formRef = React.useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  const resetState = () => {
    setStep('input');
    setIsExtracting(false);
    setIsSaving(false);
    setSelectedFile(null);
    setTextInput('');
    setExtractedData(null);
    setFinalDocumentUri('');
    setFinalDocumentType('unknown');
  };

  const handleFileSelect = (fileData: {
    name: string;
    dataUri: string;
    type: 'image' | 'pdf' | 'unknown';
  }) => {
    setSelectedFile(fileData);
    setActiveTab('image'); // Switch to image tab when file is selected
  };

  const handleFileClear = () => {
    setSelectedFile(null);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextInput(e.target.value);
  };

  const handleExtract = async () => {
    let documentDataUri = '';
    let documentType: 'image' | 'pdf' | 'text' | 'unknown' = 'unknown';

    if (activeTab === 'image' && selectedFile) {
      documentDataUri = selectedFile.dataUri;
      documentType = selectedFile.type;
    } else if (activeTab === 'text' && textInput) {
      try {
        const base64Text = encodeTextToBase64(textInput);
        documentDataUri = `data:text/plain;base64,${base64Text}`;
        documentType = 'text';
      } catch (error) {
        console.error('Text encoding failed:', error);
        toast({
          variant: 'destructive',
          title: 'Text Encoding Failed',
          description: 'Unable to process the text. Please try with simpler text content.',
        });
        return;
      }
    } else {
      toast({
        variant: 'destructive',
        title: 'No input provided',
        description: 'Please upload a file or paste text to extract details.',
      });
      return;
    }

    setIsExtracting(true);
    try {
      const result = await extractOpportunityDetails({ documentDataUri });
      setExtractedData(result);
      setFinalDocumentUri(documentDataUri);
      setFinalDocumentType(documentType);
      setStep('review');
    } catch (error) {
      console.error('Extraction failed:', error);
      toast({
        variant: 'destructive',
        title: 'Extraction Failed',
        description:
          'The AI could not extract details from the document. Please check the document and try again.',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!formRef.current || !extractedData || !finalDocumentUri) return;

    setIsSaving(true);
    const formData = new FormData(formRef.current);
    
    // Get form values and handle null/empty cases properly
    const name = formData.get('name');
    const details = formData.get('details');
    const deadline = formData.get('deadline');
    
    const opportunityData = {
        name: typeof name === 'string' ? name : '',
        details: typeof details === 'string' ? details : '',
        deadline: typeof deadline === 'string' && deadline.trim() !== '' ? deadline : undefined,
        documentUri: finalDocumentUri,
        documentType: finalDocumentType
    }

    try {
      const result = await addOpportunity(opportunityData);
      if (result.success) {
        toast({
          title: 'Success!',
          description: result.message,
        });
        setOpen(false); // Close dialog on success
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
        description: 'Could not save the opportunity.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // When dialog is closed, reset its state
  React.useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 gap-1">
          <PlusCircle className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
            Add Opportunity
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Opportunity</DialogTitle>
          <DialogDescription>
            {step === 'input'
              ? 'Upload a document or paste text. The AI will extract key details.'
              : 'Review the extracted details and save the opportunity.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'input' && (
          <>
            <Tabs
              defaultValue="image"
              onValueChange={setActiveTab}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="image">Upload/Paste Image</TabsTrigger>
                <TabsTrigger value="text">Paste Text</TabsTrigger>
              </TabsList>
              <TabsContent value="image">
                <div className="py-4">
                  <UnifiedImageInput
                    onFileSelect={handleFileSelect}
                    onClear={handleFileClear}
                    selectedFile={selectedFile}
                    disabled={isExtracting}
                  />
                </div>
              </TabsContent>
              <TabsContent value="text">
                <div className="grid w-full gap-1.5 py-4">
                  <Label htmlFor="message">Opportunity Text</Label>
                  <Textarea
                    placeholder="Paste the details here..."
                    id="message"
                    onChange={handleTextChange}
                    value={textInput}
                    rows={8}
                  />
                </div>
              </TabsContent>
            </Tabs>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button onClick={handleExtract} disabled={isExtracting}>
                {isExtracting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  'Extract Details'
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 'review' && extractedData && (
          <>
            <form ref={formRef} onSubmit={(e) => e.preventDefault()}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Opportunity Name</Label>
                  <Input
                    id="name"
                    name="name"
                    defaultValue={extractedData.name}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="details">Details</Label>
                  <Textarea
                    id="details"
                    name="details"
                    defaultValue={extractedData.details}
                    required
                    rows={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline (YYYY-MM-DD)</Label>
                  <Input
                    id="deadline"
                    name="deadline"
                    defaultValue={extractedData.deadline || ''}
                    placeholder="No deadline found"
                  />
                </div>
              </div>
            </form>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('input')}>
                Back
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
                    Save Opportunity
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
