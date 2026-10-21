import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { isAuthenticated } from '@/lib/actions';

export default async function LoginPage() {
  if (await isAuthenticated()) redirect('/');
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Opportunity Oasis</h1>
        <p className="mt-2 text-muted-foreground">Sign in to see what’s due next.</p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
