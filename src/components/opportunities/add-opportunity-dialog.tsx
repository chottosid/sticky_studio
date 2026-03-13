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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle, Loader2, Save } from 'lucide-react';
import { addOpportunity } from '@/lib/actions';
import { extractOpportunityDetails } from '@/ai';
import { useToast } from '@/hooks/use-toast';
import { UnifiedImageInput } from '@/components/ui/unified-image-input';
import type { Opportunity, OpportunityCategory } from '@/lib/types';

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

interface FileData {
  name: string;
  dataUri: string;
  type: 'image' | 'pdf' | 'unknown';
}

export function AddOpportunityDialog() {
  const [open, setOpen] = React.useState(false);
  const [step, setStep] = React.useState<'input' | 'review'>('input');
  const [activeTab, setActiveTab] = React.useState('image');
  const [isExtracting, setIsExtracting] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Input states
  const [selectedFiles, setSelectedFiles] = React.useState<FileData[]>([]);
  const [textInput, setTextInput] = React.useState('');

  // Review states
  const [extractedData, setExtractedData] = React.useState<ExtractedData | null>(null);
  const [finalDocumentUri, setFinalDocumentUri] = React.useState('');
  const [finalDocumentType, setFinalDocumentType] = React.useState<'image' | 'pdf' | 'text' | 'unknown'>('unknown');
  const [selectedCategory, setSelectedCategory] = React.useState<OpportunityCategory>('job');

  const formRef = React.useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  const resetState = () => {
    setStep('input');
    setIsExtracting(false);
    setIsSaving(false);
    setSelectedFiles([]);
    setTextInput('');
    setExtractedData(null);
    setFinalDocumentUri('');
    setFinalDocumentType('unknown');
    setSelectedCategory('job');
  };

  const handleFilesSelect = (files: FileData[]) => {
    setSelectedFiles(files);
    if (files.length > 0) {
      setActiveTab('image'); // Switch to image tab when files are selected
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextInput(e.target.value);
  };

  const handleExtract = async () => {
    let documentDataUri = '';
    let documentType: 'image' | 'pdf' | 'text' | 'unknown' = 'unknown';

    if (activeTab === 'image' && selectedFiles.length > 0) {
      // For multiple files, combine all data URIs
      if (selectedFiles.length === 1) {
        documentDataUri = selectedFiles[0].dataUri;
        documentType = selectedFiles[0].type;
      } else {
        // Combine multiple images into a single request
        // We'll pass all images as a JSON-encoded array of data URIs
        const imageDataUris = selectedFiles
          .filter(f => f.type === 'image')
          .map(f => f.dataUri);

        if (imageDataUris.length === 0) {
          toast({
            variant: 'destructive',
            title: 'No Valid Images',
            description: 'Please upload at least one image file.',
          });
          return;
        }

        // For multiple images, we'll process the first image and note there are more
        // The AI will process them sequentially if needed
        documentDataUri = imageDataUris[0];
        documentType = 'image';
      }
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
        description: 'Please upload files or paste text to extract details.',
      });
      return;
    }

    setIsExtracting(true);
    try {
      // If multiple images, process each one and combine results
      if (selectedFiles.length > 1 && activeTab === 'image') {
        const imageFiles = selectedFiles.filter(f => f.type === 'image');
        const results = [];

        for (let i = 0; i < imageFiles.length; i++) {
          const file = imageFiles[i];
          toast({
            title: `Processing image ${i + 1}/${imageFiles.length}...`,
            description: file.name,
          });

          try {
            const result = await extractOpportunityDetails({ documentDataUri: file.dataUri });
            results.push(result);
          } catch (error) {
            console.error(`Failed to extract from ${file.name}:`, error);
          }
        }

        if (results.length === 0) {
          throw new Error('Could not extract details from any image');
        }

        // Combine results - use the first non-empty value for each field
        const combinedResult: ExtractedData = {
          name: results.find(r => r.name)?.name || '',
          details: results.map(r => r.details).filter(Boolean).join('\n\n---\n\n') || '',
          deadline: results.find(r => r.deadline)?.deadline || undefined,
          category: results[0]?.category || 'job',
        };

        setExtractedData(combinedResult);
        setFinalDocumentUri(imageFiles[0].dataUri); // Store first image as primary
        setFinalDocumentType('image');
        setSelectedCategory(combinedResult.category);
      } else {
        const result = await extractOpportunityDetails({ documentDataUri });
        setExtractedData(result);
        setFinalDocumentUri(documentDataUri);
        setFinalDocumentType(documentType);
        if (result.category) {
          setSelectedCategory(result.category);
        }
      }
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

    // Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Name Required',
        description: 'Please enter an opportunity name.',
      });
      setIsSaving(false);
      return;
    }

    if (!details || typeof details !== 'string' || !details.trim()) {
      toast({
        variant: 'destructive',
        title: 'Details Required',
        description: 'Please enter opportunity details.',
      });
      setIsSaving(false);
      return;
    }

    if (!deadline || typeof deadline !== 'string' || !deadline.trim()) {
      toast({
        variant: 'destructive',
        title: 'Deadline Required',
        description: 'Please enter a deadline for this opportunity.',
      });
      setIsSaving(false);
      return;
    }

    const opportunityData = {
      name: name.trim(),
      details: details.trim(),
      deadline: deadline.trim(),
      documentUri: finalDocumentUri,
      documentType: finalDocumentType,
      category: selectedCategory,
    };

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
              ? 'Upload documents or paste text. The AI will extract key details.'
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
                <TabsTrigger value="image">Upload Images</TabsTrigger>
                <TabsTrigger value="text">Paste Text</TabsTrigger>
              </TabsList>
              <TabsContent value="image">
                <div className="py-4">
                  <UnifiedImageInput
                    onFilesSelect={handleFilesSelect}
                    selectedFiles={selectedFiles}
                    disabled={isExtracting}
                    multiple={true}
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
              <Button onClick={handleExtract} disabled={isExtracting || (activeTab === 'image' && selectedFiles.length === 0)}>
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
                  <Label htmlFor="deadline">Deadline (YYYY-MM-DD or YYYY-MM)</Label>
                  <Input
                    id="deadline"
                    name="deadline"
                    defaultValue={extractedData.deadline || ''}
                    placeholder="YYYY-MM-DD or YYYY-MM"
                    pattern="\d{4}-\d{2}(-\d{2})?"
                    title="Format: YYYY-MM-DD or YYYY-MM"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
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
