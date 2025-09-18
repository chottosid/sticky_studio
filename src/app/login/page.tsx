import { LoginForm } from '@/components/auth/login-form';
import { Gem } from 'lucide-react';

export default function LoginPage() {
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
        <p className="px-8 text-center text-sm text-muted-foreground">
          Use <span className="font-medium text-foreground">user@example.com</span> and <span className="font-medium text-foreground">password123</span>
        </p>
      </div>
    </main>
  );
}
