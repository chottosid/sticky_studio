'use client';

import Image from 'next/image';
import { Opportunity } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, ExternalLink, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type OpportunityDetailViewProps = {
  opportunity: Opportunity;
};

export default function OpportunityDetailView({ opportunity }: OpportunityDetailViewProps) {
  const [decodedText, setDecodedText] = useState('');
  const router = useRouter();

  useEffect(() => {
    if (opportunity.documentType === 'text' && typeof opportunity.documentUri === 'string') {
      try {
        const base64Part = opportunity.documentUri.split(',')[1];
        if (base64Part) {
          setDecodedText(atob(base64Part));
        } else {
          setDecodedText('Error: Invalid text format.');
        }
      } catch (error) {
        console.error('Failed to decode text URI:', error);
        setDecodedText('Error: Could not display text content.');
      }
    }
  }, [opportunity.documentUri, opportunity.documentType]);

  const formattedDeadline = opportunity.deadline && typeof opportunity.deadline === 'string'
    ? format(parseISO(opportunity.deadline), 'MMMM do, yyyy')
    : null;
    
  const isPastDeadline = opportunity.deadline && typeof opportunity.deadline === 'string' 
    ? new Date(opportunity.deadline) < new Date() 
    : false;

  const openDocument = () => {
    window.open(opportunity.documentUri, '_blank');
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Button 
          variant="outline" 
          onClick={() => router.back()}
          className="flex items-center gap-2 hover:bg-primary/10 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
      <Card className="overflow-hidden shadow-lg">
        <CardHeader>
          <CardTitle className="font-headline text-3xl">{opportunity.name}</CardTitle>
          <div className="pt-4">
            {formattedDeadline ? (
              <Badge variant={isPastDeadline ? "destructive" : "secondary"} className={cn('text-base', !isPastDeadline && 'bg-accent/20 text-accent-foreground')}>
                <CalendarDays className="mr-2 h-4 w-4" />
                {isPastDeadline ? 'Deadline Passed' : `Deadline: ${formattedDeadline}`}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-base">No Deadline Specified</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-8">
          <div>
            <h2 className="font-headline text-xl font-semibold mb-2">Details</h2>
            <p className="whitespace-pre-wrap text-foreground/80">{opportunity.details}</p>
          </div>

          <div>
            <h2 className="font-headline text-xl font-semibold mb-4">Original Document</h2>
            <div className="rounded-lg border bg-muted/50 p-4">
              {opportunity.documentType === 'image' && (
                <div className="relative aspect-video w-full max-w-md mx-auto">
                  <Image
                    src={opportunity.documentUri}
                    alt="Opportunity Document Preview"
                    fill
                    className="object-contain"
                  />
                </div>
              )}
              {opportunity.documentType === 'text' && (
                <pre className="whitespace-pre-wrap rounded-md bg-background p-4 font-mono text-sm max-h-96 overflow-auto">
                  <code>{decodedText}</code>
                </pre>
              )}
              {(opportunity.documentType === 'pdf' || opportunity.documentType === 'unknown') && (
                <p className="text-center text-muted-foreground">
                  Document preview is not available for this file type.
                </p>
              )}
              <div className="mt-4 text-center">
                <Button onClick={openDocument}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Original Document
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
