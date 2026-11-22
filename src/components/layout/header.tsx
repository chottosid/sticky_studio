import Link from 'next/link';
import { CalendarClock, GraduationCap, Inbox, LayoutList, LogOut, MessageSquare, Settings, StickyNote } from 'lucide-react';
import { AddOpportunityDialog } from '@/components/opportunities/add-opportunity-dialog';
import { Button } from '@/components/ui/button';
import { logout } from '@/lib/actions';
import { cn } from '@/lib/utils';

const navigation = [
  { href: '/', label: 'Today', icon: CalendarClock, page: 'today' },
  { href: '/ledger', label: 'Ledger', icon: LayoutList, page: 'ledger' },
  { href: '/labs', label: 'Labs', icon: GraduationCap, page: 'labs' },
  { href: '/inbox', label: 'Inbox', icon: Inbox, page: 'inbox' },
  { href: '/agent', label: 'Agent', icon: MessageSquare, page: 'agent' },
] as const;

export default function Header({ active }: { active?: typeof navigation[number]['page'] } = {}) {
  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 min-[420px]:h-16 min-[420px]:flex-nowrap min-[420px]:py-0 sm:px-4 lg:gap-5 lg:px-6">
        <Link href="/" aria-label="Sticky Studio home" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-7 place-items-center sm:size-9 rounded-xl bg-primary text-primary-foreground">
            <StickyNote size={18} aria-hidden />
          </span>
          <span aria-hidden className="font-display text-lg font-semibold tracking-tight min-[420px]:hidden min-[600px]:inline">Sticky Studio</span>
        </Link>
        <nav aria-label="Workspace" className="order-last flex w-full items-center justify-center gap-0.5 rounded-xl border bg-background p-1 min-[420px]:order-none min-[420px]:w-auto sm:gap-1">
          {navigation.map(({ href, label, icon: Icon, page }) => (
            <Link key={page} href={href} prefetch={false} aria-current={active === page ? 'page' : undefined}
              className={cn('flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-xs sm:text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:px-2 lg:px-3',
                active === page && 'bg-accent text-accent-foreground')}>
              <Icon size={15} aria-hidden className="hidden lg:block" /> {label}
            </Link>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <AddOpportunityDialog />
          <Button asChild variant="ghost" size="icon" className="size-8 text-muted-foreground">
            <Link href="/settings" aria-label="Settings" title="Settings"><Settings aria-hidden /></Link>
          </Button>
          <form action={logout}>
            <Button variant="ghost" size="icon" type="submit" aria-label="Sign out" title="Sign out" className="size-8 text-muted-foreground">
              <LogOut aria-hidden />
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
