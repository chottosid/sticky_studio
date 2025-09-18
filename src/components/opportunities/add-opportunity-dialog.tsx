'use client';

import * as React from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
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
import { PlusCircle, Upload, Loader2 } from 'lucide-react';
import { addOpportunity } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Extracting...
        </>
      ) : (
        'Add Opportunity'
      )}
    </Button>
  );
}

export function AddOpportunityDialog() {
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState('file');
  const [fileName, setFileName] = React.useState('');
  const [fileDataUri, setFileDataUri] = React.useState('');
  const [fileType, setFileType] = React.useState<'image' | 'pdf' | 'text' | 'unknown'>('unknown');
  const [textInput, setTextInput] = React.useState('');
  
  const formRef = React.useRef<HTMLFormElement>(null);
  const { toast } = useToast();

  const [state, formAction] = useActionState(addOpportunity, undefined);

  React.useEffect(() => {
    if (state?.message) {
      if (state.success) {
        toast({
          title: 'Success!',
          description: state.message,
        });
        setOpen(false); // Close dialog on success
        formRef.current?.reset();
        setFileName('');
        setFileDataUri('');
        setTextInput('');
      } else {
        toast({
          variant: 'destructive',
          title: 'An error occurred',
          description: state.message,
        });
      }
    }
  }, [state, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const uri = event.target?.result as string;
        setFileDataUri(uri);
        if (file.type.startsWith('image/')) setFileType('image');
        else if (file.type === 'application/pdf') setFileType('pdf');
        else setFileType('unknown');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTextInput(e.target.value);
  };
  
  const preparedFormAction = (formData: FormData) => {
    if (tab === 'file' && fileDataUri) {
        formData.set('documentDataUri', fileDataUri);
        formData.set('documentType', fileType);
    } else if (tab === 'text' && textInput) {
        const textDataUri = `data:text/plain;base64,${btoa(textInput)}`;
        formData.set('documentDataUri', textDataUri);
        formData.set('documentType', 'text');
    }
    formAction(formData);
  };


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
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add New Opportunity</DialogTitle>
          <DialogDescription>
            Upload a document or paste text. The AI will extract the key details.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} action={preparedFormAction}>
          <Tabs defaultValue="file" onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="file">Upload File</TabsTrigger>
              <TabsTrigger value="text">Paste Text</TabsTrigger>
            </TabsList>
            <TabsContent value="file">
              <div className="grid w-full items-center gap-1.5 py-4">
                <Label htmlFor="picture">Document (PDF or Image)</Label>
                <div className="relative">
                  <Input id="picture" type="file" className="pl-12" onChange={handleFileChange} accept="application/pdf,image/*" />
                  <Upload className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                </div>
                {fileName && <p className="text-sm text-muted-foreground pt-2">File: {fileName}</p>}
              </div>
            </TabsContent>
            <TabsContent value="text">
              <div className="grid w-full gap-1.5 py-4">
                <Label htmlFor="message">Opportunity Text</Label>
                <Textarea placeholder="Paste the details here..." id="message" onChange={handleTextChange} rows={8}/>
              </div>
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
            </DialogClose>
            <SubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
