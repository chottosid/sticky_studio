import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { AddOpportunityDialog } from '@/components/opportunities/add-opportunity-dialog';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/actions';

export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="font-display text-lg font-semibold tracking-tight">
          Opportunity Oasis
        </Link>
        <div className="ml-auto flex items-center gap-1">
          <AddOpportunityDialog />
          <form action={logout}>
            <Button variant="ghost" size="sm" type="submit" className="text-muted-foreground">
              <LogOut aria-hidden />
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
