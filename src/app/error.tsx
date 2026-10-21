'use client';

import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const [retrying, startRetry] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="font-display text-2xl font-semibold">This page didn’t load</h1>
      <p className="text-muted-foreground">
        The server had a problem loading this page. Try again; if it keeps happening, check the database connection.
      </p>
      <div>
        <Button
          disabled={retrying}
          // Re-fetch server data, then re-render; reset() alone would replay the same failure.
          onClick={() => startRetry(() => { router.refresh(); reset(); })}
        >
          {retrying ? 'Trying again…' : 'Try again'}
        </Button>
      </div>
    </main>
  );
}
