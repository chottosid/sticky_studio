import { redirect } from 'next/navigation';
import { StickyNote } from 'lucide-react';
import { LoginForm } from '@/components/auth/login-form';
import { isAuthenticated } from '@/lib/actions';

export default async function LoginPage() {
  if (await isAuthenticated()) redirect('/');
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border bg-card p-7 shadow-sm sm:p-10">
        <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground"><StickyNote size={22} aria-hidden /></span>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Sticky Studio</h1>
        <p className="mt-2 text-muted-foreground">Sign in to your workspace.</p>
        <div className="mt-6">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
