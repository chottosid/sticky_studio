import Header from '@/components/layout/header';

export default function Loading() {
  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 pt-16 sm:px-6" aria-busy>
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-10 w-3/4 animate-pulse rounded bg-muted" />
        <div className="mt-3 h-5 w-1/2 animate-pulse rounded bg-muted" />
        <span className="sr-only">Loading opportunity</span>
      </main>
    </>
  );
}
