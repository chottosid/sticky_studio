'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Image as ImageIcon, Loader2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface UnifiedImageInputProps {
  onFileSelect: (fileData: {
    name: string;
    dataUri: string;
    type: 'image' | 'pdf' | 'unknown';
  }) => void;
  onClear?: () => void;
  selectedFile?: {
    name: string;
    dataUri: string;
    type: 'image' | 'pdf' | 'unknown';
  } | null;
  className?: string;
  disabled?: boolean;
}

export function UnifiedImageInput({
  onFileSelect,
  onClear,
  selectedFile,
  className,
  disabled = false,
}: UnifiedImageInputProps) {
  const [isDragOver, setIsDragOver] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const processFile = React.useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUri = event.target?.result as string;
      let fileType: 'image' | 'pdf' | 'unknown' = 'unknown';
      
      if (file.type.startsWith('image/')) {
        fileType = 'image';
      } else if (file.type === 'application/pdf') {
        fileType = 'pdf';
      }

      onFileSelect({
        name: file.name,
        dataUri,
        type: fileType,
      });
    };
    reader.readAsDataURL(file);
  }, [onFileSelect]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
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
    const file = files[0];
    
    if (file) {
      // Check if it's an allowed file type
      if (file.type.startsWith('image/') || file.type === 'application/pdf') {
        processFile(file);
      } else {
        toast({
          variant: 'destructive',
          title: 'Invalid File Type',
          description: 'Please upload an image or PDF file.',
        });
      }
    }
  };



  const handleUploadClick = () => {
    if (!disabled) {
      fileInputRef.current?.click();
    }
  };

  const handleClear = () => {
    if (onClear) {
      onClear();
    }
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle paste event on the container
  const handleContainerPaste = React.useCallback((e: React.ClipboardEvent) => {
    if (disabled) return;
    
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) {
        processFile(file);
        toast({
          title: 'Image Pasted!',
          description: 'Image has been pasted from clipboard.',
        });
      }
    }
  }, [disabled, processFile, toast]);

  return (
    <div className={cn('w-full', className)}>
      <Label htmlFor="unified-file-input">Document (PDF or Image)</Label>
      
      {/* Hidden file input */}
      <Input
        ref={fileInputRef}
        id="unified-file-input"
        type="file"
        className="hidden"
        onChange={handleFileChange}
        accept="application/pdf,image/*"
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
          selectedFile && "border-green-300 bg-green-50"
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handleContainerPaste}
        tabIndex={0}
        onClick={!selectedFile ? handleUploadClick : undefined}
      >
        {selectedFile ? (
          <div className="flex flex-col items-center gap-3 w-full">
            <div className="flex items-center gap-2 text-green-700">
              <ImageIcon className="h-8 w-8" />
              <div className="flex-1">
                <p className="font-medium">File selected:</p>
                <p className="text-sm text-green-600">{selectedFile.name}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClear}
                disabled={disabled}
                className="h-8 w-8 p-0 hover:bg-red-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {selectedFile.type === 'image' && (
              <div className="max-w-full max-h-32 overflow-hidden rounded border">
                <img
                  src={selectedFile.dataUri}
                  alt="Preview"
                  className="max-w-full max-h-32 object-contain"
                />
              </div>
            )}
          </div>
        ) : (
          <>
            <Upload className="h-12 w-12 text-primary/60 mb-4" />
            <div className="text-center mb-4">
              <p className="text-sm font-medium text-foreground mb-1">
                {isDragOver ? 'Drop your file here' : 'Upload an image/PDF'}
              </p>
              <p className="text-xs text-muted-foreground">
                Click to browse or drag & drop files
              </p>
            </div>
            
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUploadClick}
                disabled={disabled}
                className="flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                Browse Files
              </Button>
            </div>
          </>
        )}
      </div>
      
      {!selectedFile && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Supports JPG, PNG, GIF, PDF files. You can also paste images directly with Ctrl+V.
        </p>
      )}
    </div>
  );
}