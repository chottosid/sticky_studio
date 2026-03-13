'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Gem, LogOut, Menu, Briefcase, GraduationCap, Trophy, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AddOpportunityDialog } from '@/components/opportunities/add-opportunity-dialog';
import { logout } from '@/lib/actions';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { OpportunityCategory } from '@/lib/types';

const categories: { value: OpportunityCategory; label: string; icon: React.ReactNode }[] = [
  { value: 'job', label: 'Jobs', icon: <Briefcase className="h-4 w-4" /> },
  { value: 'internship', label: 'Internships', icon: <GraduationCap className="h-4 w-4" /> },
  { value: 'contest', label: 'Contests', icon: <Trophy className="h-4 w-4" /> },
  { value: 'higher-study', label: 'Higher Study', icon: <BookOpen className="h-4 w-4" /> },
];

export default function Header() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentCategory = searchParams.get('category') as OpportunityCategory | null;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-gradient-to-r from-primary/10 via-background to-accent/10 backdrop-blur-sm px-4 md:px-6 shadow-sm">
      {/* Mobile Menu */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-gradient-to-br from-primary/20 to-accent/20">
                <Gem className="h-5 w-5 text-primary" />
              </div>
              <span className="font-headline bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                Opportunity Oasis
              </span>
            </SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-2 mt-6">
            {categories.map((category) => (
              <Link
                key={category.value}
                href={`/?category=${category.value}`}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  currentCategory === category.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                )}
              >
                {category.icon}
                {category.label}
              </Link>
            ))}
            <Link
              href="/"
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                !currentCategory && "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              <Gem className="h-4 w-4" />
              All Opportunities
            </Link>
          </nav>
        </SheetContent>
      </Sheet>

      {/* Logo */}
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

      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center gap-1 ml-4">
        {categories.map((category) => (
          <Link
            key={category.value}
            href={`/?category=${category.value}`}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              currentCategory === category.value
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            {category.icon}
            <span className="hidden lg:inline">{category.label}</span>
          </Link>
        ))}
        <Link
          href="/"
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
            !currentCategory && pathname === "/" && "bg-primary text-primary-foreground"
          )}
        >
          <Gem className="h-4 w-4" />
          <span className="hidden lg:inline">All</span>
        </Link>
      </nav>

      {/* Right side actions */}
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
