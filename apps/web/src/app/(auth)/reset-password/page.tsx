'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Lock, AlertCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/validations/auth';

import { resetPassword } from '../actions';

export default function ResetPasswordPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ResetPasswordInput) => {
    setIsLoading(true);
    setError(null);

    const result = await resetPassword(data);

    if (result?.error) {
      setError(result.error);
      setIsLoading(false);
    }
  };

  // Password strength indicator
  const password = watch('password');
  const getPasswordStrength = () => {
    if (!password) return 0;
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };
  const passwordStrength = getPasswordStrength();

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-foreground">Set new password</h1>
        <p className="mt-2 text-secondary">
          Must be at least 8 characters with uppercase, lowercase, and a number.
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
          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
              New password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                {...register('password')}
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="pl-11 pr-11"
                error={errors.password?.message}
                autoComplete="new-password"
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
            {/* Password Strength Indicator */}
            {password && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((level) => (
                    <div
                      key={level}
                      className={cn(
                        'h-1 flex-1 rounded-full transition-colors',
                        passwordStrength >= level
                          ? passwordStrength <= 2
                            ? 'bg-destructive'
                            : passwordStrength <= 3
                            ? 'bg-warning'
                            : 'bg-success'
                          : 'bg-border'
                      )}
                    />
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {passwordStrength <= 2 && 'Weak password'}
                  {passwordStrength === 3 && 'Medium password'}
                  {passwordStrength >= 4 && 'Strong password'}
                </p>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Confirm password
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                {...register('confirmPassword')}
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                className="pl-11 pr-11"
                error={errors.confirmPassword?.message}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {/* Submit */}
          <Button type="submit" className="w-full" size="lg" variant="primary" isLoading={isLoading}>
            Reset password
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
