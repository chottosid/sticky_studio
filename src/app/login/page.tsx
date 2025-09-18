import { LoginForm } from '@/components/auth/login-form';
import { Gem } from 'lucide-react';
import { isAuthenticated } from '@/lib/actions';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const authenticated = await isAuthenticated();
  
  if (authenticated) {
    redirect('/');
  }
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <Gem className="mx-auto h-8 w-8 text-primary" />
          <h1 className="font-headline text-2xl font-semibold tracking-tight">
            Opportunity Oasis
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter your credentials to access your dashboard
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
