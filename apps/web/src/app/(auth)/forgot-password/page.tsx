'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, AlertCircle, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth';

import { forgotPassword } from '../actions';

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordInput) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const result = await forgotPassword(data);

    if (result?.error) {
      setError(result.error);
    } else if (result?.success) {
      setSuccess(result.message || 'Password reset email sent');
    }
    
    setIsLoading(false);
  };

  if (success) {
    return (
      <div className="animate-fade-in">
        <div className="rounded-2xl bg-card p-8 shadow-soft border border-border text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Check your email</h1>
          <p className="mt-3 text-secondary">
            {success}
          </p>
          <Button asChild className="mt-6 w-full" size="lg" variant="primary">
            <Link href="/login">Back to Sign In</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">Forgot password?</h1>
        <p className="mt-2 text-secondary">
          No worries, we&apos;ll send you reset instructions.
        </p>
      </div>

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

          {/* Submit */}
          <Button type="submit" className="w-full" size="lg" variant="primary" isLoading={isLoading}>
            Send reset link
          </Button>
        </form>
      </div>

      {/* Back to Login */}
      <Link
        href="/login"
        className="mt-8 flex items-center justify-center gap-2 text-sm font-medium text-secondary hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to sign in
      </Link>
    </div>
  );
}
