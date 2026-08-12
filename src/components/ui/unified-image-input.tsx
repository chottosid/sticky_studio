'use client';

import * as React from 'react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Upload, Image as ImageIcon, X, ClipboardPaste } from 'lucide-react';
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

interface UnifiedImageInputProps {
  onFilesSelect: (files: FileData[]) => void;
  onClear?: () => void;
  selectedFiles?: FileData[];
  className?: string;
  disabled?: boolean;
  multiple?: boolean;
}

export function UnifiedImageInput({
  onFilesSelect,
  onClear,
  selectedFiles = [],
  className,
  disabled = false,
  multiple = true,
}: UnifiedImageInputProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const processFile = React.useCallback((file: File): Promise<FileData> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUri = event.target?.result as string;
        const fileType: 'image' | 'pdf' = file.type.startsWith('image/') ? 'image' : 'pdf';

        resolve({
          id: crypto.randomUUID(),
          name: file.name,
          dataUri,
          type: fileType,
          mimeType: file.type,
          size: file.size,
        });
      };
      reader.readAsDataURL(file);
    });
  }, []);

  const processFiles = React.useCallback(async (files: File[]) => {
    const validFiles = files.filter(
      file => file.type.startsWith('image/') || file.type === 'application/pdf'
    );

    const totalSize = validFiles.reduce((total, file) => total + file.size, 0);
    if (totalSize > 10 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Files Too Large',
        description: 'The combined file size must be 10 MB or less.',
      });
      return;
    }

    if (validFiles.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid File Type',
        description: 'Please upload image or PDF files only.',
      });
      return;
    }

    if (!multiple && validFiles.length > 1) {
      toast({
        title: 'Single File Only',
        description: 'Only one file can be uploaded at a time.',
      });
    }

    const filesToProcess = multiple ? validFiles : [validFiles[0]];
    const processedFiles = await Promise.all(filesToProcess.map(processFile));
    onFilesSelect(processedFiles);
  }, [multiple, onFilesSelect, processFile, toast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      processFiles(files);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const handleUploadClick = () => {
    if (disabled) return;
    const input = fileInputRef.current;
    if (!input) return;

    try {
      // showPicker() requires user activation, may fail in some React contexts
      const picker = (input as HTMLInputElement & { showPicker?: () => void }).showPicker;
      if (typeof picker === 'function') {
        picker.call(input);
        return;
      }
    } catch {
      // Fall through to click() if showPicker fails
    }

    input.click();
  };

  const handleRemoveFile = (index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    onFilesSelect(newFiles);
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle paste event
  const handleContainerPaste = React.useCallback((e: React.ClipboardEvent) => {
    if (disabled) return;

    const items = Array.from(e.clipboardData.items);
    const imageItems = items.filter(item => item.type.startsWith('image/'));

    if (imageItems.length > 0) {
      e.preventDefault();
      const files = imageItems
        .map(item => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (files.length > 0) {
        processFiles(files);
        toast({
          title: 'Image(s) Pasted!',
          description: `${files.length} image(s) pasted from clipboard.`,
        });
      }
    }
  }, [disabled, processFiles, toast]);

  const handleManualPaste = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;

    try {
      const items = await navigator.clipboard.read();
      const files: File[] = [];

      for (const item of items) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          const file = new File([blob], `pasted-image-${Date.now()}.png`, { type: imageType });
          files.push(file);
        }
      }

      if (files.length > 0) {
        processFiles(files);
        toast({
          title: 'Image(s) Pasted!',
          description: `${files.length} image(s) pasted from clipboard.`,
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'No Images Found',
          description: 'No images were found in your clipboard.',
        });
      }
    } catch (err) {
      console.error('Failed to read clipboard:', err);
      toast({
        variant: 'destructive',
        title: 'Paste Failed',
        description: 'Unable to access clipboard. Please try Ctrl+V instead.',
      });
    }
  };

  return (
    <div className={cn('w-full', className)}>
      <Label htmlFor="unified-file-input">
        Document{multiple ? 's' : ''} (PDF or Image{multiple ? 's' : ''})
      </Label>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        id="unified-file-input"
        type="file"
        className="sr-only"
        onChange={handleFileChange}
        accept="application/pdf,image/*"
        multiple={multiple}
        disabled={disabled}
      />

      {/* Main drop zone */}
      <div
        className={cn(
          "mt-2 flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-all duration-200 cursor-pointer",
          isDragOver
            ? "border-primary bg-primary/10 scale-105"
            : "border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 hover:border-primary/40",
          disabled && "opacity-50 cursor-not-allowed",
          selectedFiles.length > 0 && "border-green-300 bg-green-50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handleContainerPaste}
        tabIndex={0}
        onClick={handleUploadClick}
      >
        {selectedFiles.length > 0 ? (
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="flex items-center gap-2 text-green-700">
              <ImageIcon className="h-8 w-8" />
              <div className="flex-1">
                <p className="font-medium">{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected</p>
              </div>
              {selectedFiles.length === 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleClear();
                  }}
                  disabled={disabled}
                  className="h-8 w-8 p-0 hover:bg-red-100"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {/* File thumbnails */}
            <div className="flex flex-wrap gap-2 justify-center max-w-full">
              {selectedFiles.map((file, index) => (
                <div key={file.id} className="relative group">
                  {file.type === 'image' ? (
                    <div className="w-16 h-16 rounded border overflow-hidden">
                      <Image
                        src={file.dataUri}
                        alt={file.name}
                        width={64}
                        height={64}
                        unoptimized
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded border bg-gray-100 flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleRemoveFile(index);
                    }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            <Upload className="h-12 w-12 text-primary/60 mb-4" />
            <div className="text-center mb-4">
              <p className="text-sm font-medium text-foreground mb-1">
                {isDragOver ? 'Drop your files here' : `Upload image${multiple ? 's' : ''}/PDF${multiple ? 's' : ''}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {multiple ? 'Select multiple files or drag & drop' : 'Click to browse or drag & drop'}
              </p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUploadClick}
                disabled={disabled}
                className="flex items-center gap-2 min-h-10 sm:min-h-0 px-4"
              >
                <Upload className="h-4 w-4" />
                Browse Files
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleManualPaste}
                disabled={disabled}
                className="flex items-center gap-2 min-h-10 sm:min-h-0 px-4"
              >
                <ClipboardPaste className="h-4 w-4" />
                Paste Image{multiple ? 's' : ''}
              </Button>
            </div>
          </>
        )}
      </div>

      {selectedFiles.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Supports JPG, PNG, GIF, PDF files. You can also paste images with Ctrl+V.
        </p>
      )}
    </div>
  );
}
