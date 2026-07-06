'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    let signInError: string | null = null;
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      signInError = error?.message ?? null;
    } catch (error) {
      console.error('Failed to initialize Supabase client:', error);
      setError('Application configuration missing. Check the server environment.');
      setLoading(false);
      return;
    }

    if (signInError) {
      setError('Invalid login credentials');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-primary bg-[radial-gradient(oklch(0.58_0.05_145)_0.8px,transparent_0.8px)] bg-[length:22px_22px] p-6">
      <div className="w-full max-w-[392px]">
        <div className="rounded-[18px] bg-card px-8 pb-8 pt-9 shadow-[0_30px_70px_-30px_rgba(0,0,0,0.55)]">
          <div className="mb-2 flex justify-center">
            <Image
              src="/sempre-logo-word.svg"
              alt="Sempre"
              width={180}
              height={23}
              className="h-7 w-auto"
              priority
            />
          </div>
          <p className="mb-6 text-center text-[13.5px] text-muted-foreground">Log in om verder te gaan</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-semibold text-foreground/80">E-mail</Label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="naam@sempre.be"
                className="h-[42px] rounded-[9px] text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-semibold text-foreground/80">Wachtwoord</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-[42px] rounded-[9px] text-sm"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" disabled={loading} className="mt-1 h-11 w-full rounded-[10px] text-sm font-bold">
              {loading ? 'Laden...' : 'Log in'}
            </Button>
          </form>
        </div>
        <p className="mt-5 text-center text-xs text-white/75">Sempre pricing · intern platform</p>
      </div>
    </div>
  );
}
