import Link from 'next/link';
import { LayoutList, LogOut, MessageSquare, StickyNote } from 'lucide-react';
import { AddOpportunityDialog } from '@/components/opportunities/add-opportunity-dialog';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/actions';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/', label: 'Ledger', icon: LayoutList, page: 'ledger' },
  { href: '/agent', label: 'Agent', icon: MessageSquare, page: 'agent' },
] as const;

export default function Header({ active = 'ledger' }: { active?: 'ledger' | 'agent' } = {}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-5 sm:px-6">
        <Link href="/" aria-label="Sticky Studio home" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <StickyNote size={18} aria-hidden />
          </span>
          <span aria-hidden className="hidden font-display text-lg font-semibold tracking-tight sm:inline">Sticky Studio</span>
        </Link>
        <nav aria-label="Workspace" className="flex items-center gap-0.5 rounded-xl border bg-background p-1 sm:gap-1">
          {navigation.map(({ href, label, icon: Icon, page }) => (
            <Link key={page} href={href} prefetch={page === 'agent' ? false : undefined} aria-current={active === page ? 'page' : undefined}
              className={cn('flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:px-3',
                active === page && 'bg-accent text-accent-foreground')}>
              <Icon size={15} aria-hidden className="hidden min-[380px]:block" /> {label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <AddOpportunityDialog />
          <form action={logout}>
            <Button variant="ghost" size="icon" type="submit" aria-label="Sign out" title="Sign out" className="size-9 text-muted-foreground">
              <LogOut aria-hidden />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
