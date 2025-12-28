import Link from 'next/link';
import { Gem, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddOpportunityDialog } from '@/components/opportunities/add-opportunity-dialog';
import { logout } from '@/lib/actions';

export default function Header() {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-gradient-to-r from-primary/10 via-background to-accent/10 backdrop-blur-sm px-4 md:px-6 shadow-sm">
      <nav className="hidden flex-col gap-6 text-lg font-medium md:flex md:flex-row md:items-center md:gap-5 md:text-sm lg:gap-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold md:text-base group transition-colors hover:text-primary">
          <div className="p-1 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 group-hover:from-primary/30 group-hover:to-accent/30 transition-all duration-300">
            <Gem className="h-6 w-6 text-primary" />
          </div>
          <span className="font-headline text-xl bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Opportunity Oasis
          </span>
        </Link>
      </nav>
      {/* Add mobile menu if needed in future */}
      <div className="flex w-full items-center gap-4 md:ml-auto md:gap-2 lg:gap-4">
        <div className="ml-auto flex-1 sm:flex-initial">
          <AddOpportunityDialog />
        </div>
        <form action={logout}>
          <Button variant="ghost" size="icon" type="submit" className="hover:bg-destructive/10 hover:text-destructive transition-colors">
            <LogOut className="h-5 w-5" />
            <span className="sr-only">Logout</span>
          </Button>
        </form>
      </div>
    </header>
  );
}
