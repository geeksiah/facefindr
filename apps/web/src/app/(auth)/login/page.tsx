'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { loginSchema, type LoginInput } from '@/lib/validations/auth';

import { login, signInWithGoogle } from '../actions';

export default function LoginPage() {
  const searchParams = useSearchParams();
  const message = searchParams.get('message');
  const toast = useToast();
  
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginInput) => {
    setIsLoading(true);
    setError(null);
    
    const result = await login(data);
    
    if (result?.error) {
      setError(result.error);
      toast.error('Login Failed', result.error);
      setIsLoading(false);
    } else {
      // Success - action redirects, but show toast briefly
      toast.success('Welcome Back', 'You have been successfully logged in.');
      // Action will handle redirect
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
        <p className="mt-2 text-secondary">Sign in to your account</p>
      </div>

      {/* Success Message */}
      {message && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-success/10 p-4 text-sm text-success">
          <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Card */}
      <div className="rounded-2xl bg-card p-6 shadow-soft border border-border">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-foreground mb-2">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                {...register('email')}
                id="email"
                type="email"
                placeholder="you@example.com"
                className="pl-11"
                error={errors.email?.message}
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="password" className="block text-sm font-medium text-foreground">
                Password
              </label>
              <Link
                href="/forgot-password"
                className="text-sm font-medium text-accent hover:text-accent/80 transition-colors"
              >
                Forgot?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                {...register('password')}
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="pl-11 pr-11"
                error={errors.password?.message}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <Button type="submit" className="w-full" size="lg" variant="primary" isLoading={isLoading}>
            Sign in
          </Button>
        </form>

        {/* Divider */}
        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Social Login */}
        <div className="space-y-3">
          <form action={() => signInWithGoogle('attendee')}>
            <Button variant="outline" type="submit" className="w-full">
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
            </Button>
          </form>
        </div>
      </div>

      {/* Sign Up Link */}
      <p className="mt-8 text-center text-sm text-secondary">
        Don&apos;t have an account?{' '}
        <Link href="/register" className="font-medium text-accent hover:text-accent/80 transition-colors">
          Sign up
        </Link>
      </p>
    </div>
  );
}
