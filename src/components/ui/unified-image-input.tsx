'use client';

import * as React from 'react';
import { ClipboardPaste, FileText, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface FileData {
  id: string;
  name: string;
  dataUri: string;
  type: 'image' | 'pdf';
  mimeType: string;
  size: number;
}

type Props = {
  files: FileData[];
  onFilesChange: React.Dispatch<React.SetStateAction<FileData[]>>;
  disabled?: boolean;
};

// ponytail: Vercel caps server-action bodies at 4.5 MB and base64 adds ~33%, so combined
// post-compression bytes are capped at 3 MB. One extraction takes at most 10 sources.
const MAX_TOTAL_BYTES = 3 * 1024 * 1024;
const MAX_FILES = 10;

/** Downscales large screenshots to JPEG; OCR-grade quality at a fraction of the size. */
async function compressImage(file: File): Promise<File | null> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return null;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1_500_000) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return null;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    return null;
  }
}

async function toFileData(file: File): Promise<FileData> {
  const finalFile = (await compressImage(file)) ?? file;
  const dataUri = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(finalFile);
  });
  return {
    id: crypto.randomUUID(),
    name: finalFile.name,
    dataUri,
    type: finalFile.type.startsWith('image/') ? 'image' : 'pdf',
    mimeType: finalFile.type,
    size: finalFile.size,
  };
}

export function UnifiedImageInput({ files, onFilesChange, disabled = false }: Props) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  // Latest selection, updated synchronously so two quick pastes both see each other's files.
  const filesRef = React.useRef(files);
  filesRef.current = files;
  const inputId = React.useId();
  const { toast } = useToast();

  const addFiles = React.useCallback(async (incoming: File[]) => {
    const valid = incoming.filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf');
    if (valid.length === 0) {
      toast({ variant: 'destructive', title: 'Use an image or a PDF', description: 'Other file types can’t be read.' });
      return;
    }
    const processed = await Promise.all(valid.map(toFileData));
    const next = [...filesRef.current, ...processed];
    if (next.length > MAX_FILES) {
      toast({ variant: 'destructive', title: `Add up to ${MAX_FILES} files at a time` });
      return;
    }
    if (next.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_BYTES) {
      toast({
        variant: 'destructive',
        title: 'These files are too large together',
        description: 'Keep the total under 3 MB. Images are compressed automatically; PDFs count at full size.',
      });
      return;
    }
    filesRef.current = next;
    onFilesChange(next);
  }, [onFilesChange, toast]);

  // Ctrl+V anywhere in the dialog, except inside a text field.
  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (disabled) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const pasted = Array.from(event.clipboardData?.items ?? [])
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
      if (pasted.length) {
        event.preventDefault();
        void addFiles(pasted);
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addFiles, disabled]);

  const pasteFromClipboard = async () => {
    try {
      const pasted: File[] = [];
      for (const item of await navigator.clipboard.read()) {
        const type = item.types.find((entry) => entry.startsWith('image/'));
        if (type) pasted.push(new File([await item.getType(type)], `pasted-${Date.now()}.png`, { type }));
      }
      if (pasted.length) await addFiles(pasted);
      else toast({ title: 'No image on the clipboard', description: 'Copy a screenshot first, or press Ctrl+V.' });
    } catch {
      toast({ variant: 'destructive', title: 'Clipboard not available', description: 'Press Ctrl+V instead.' });
    }
  };

  return (
    <div className="space-y-3">
      <input
        id={inputId}
        type="file"
        accept="application/pdf,image/*"
        multiple
        disabled={disabled}
        className="peer sr-only"
        onChange={(event) => {
          void addFiles(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <label
        htmlFor={inputId}
        onDragOver={(event) => { event.preventDefault(); if (!disabled) setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragOver(false);
          if (!disabled) void addFiles(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2',
          isDragOver ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/50',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
        <span className="font-medium">{isDragOver ? 'Drop to add' : 'Choose screenshots or PDFs'}</span>
        <span className="text-sm text-muted-foreground">or drag them here, or press Ctrl+V to paste</span>
      </label>
      <div className="flex justify-center">
        <Button type="button" variant="ghost" size="sm" onClick={() => void pasteFromClipboard()} disabled={disabled}>
          <ClipboardPaste aria-hidden /> Paste from clipboard
        </Button>
      </div>

      {files.length > 0 && (
        <ul className="flex flex-wrap gap-3" aria-label="Selected files">
          {files.map((file) => (
            <li key={file.id} className="relative">
              {file.type === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element -- local data URI preview
                <img src={file.dataUri} alt={file.name} className="h-20 w-20 rounded-md border object-cover" />
              ) : (
                <div className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-md border bg-muted p-1 text-center">
                  <FileText className="h-5 w-5 text-muted-foreground" aria-hidden />
                  <span className="w-full truncate text-[11px]">{file.name}</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => onFilesChange((current) => current.filter((entry) => entry.id !== file.id))}
                disabled={disabled}
                aria-label={`Remove ${file.name}`}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-card text-foreground shadow-sm hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
