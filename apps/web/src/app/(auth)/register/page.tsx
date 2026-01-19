'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Camera,
  Users,
  AlertCircle,
  CheckCircle2,
  Check,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { UsernameSelector } from '@/components/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { registerSchema, type RegisterInput } from '@/lib/validations/auth';

import { register as registerUser } from '../actions';


export default function RegisterPage() {
  const toast = useToast();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [previewFaceTag, setPreviewFaceTag] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      displayName: '',
      username: '',
      userType: undefined,
      acceptTerms: false,
    },
  });

  const selectedUserType = watch('userType');
  const acceptTerms = watch('acceptTerms');

  const onSubmit = async (data: RegisterInput) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    const result = await registerUser(data);

    if (result?.error) {
      setError(result.error);
      toast.error('Registration Failed', result.error);
      setIsLoading(false);
    } else if (result?.success) {
      setSuccess(result.message || 'Account created successfully');
      toast.success('Account Created', 'Please check your email to verify your account.');
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

  if (success) {
    return (
      <div className="animate-fade-in">
        <div className="rounded-2xl bg-card p-8 shadow-soft border border-border text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success/10">
            <CheckCircle2 className="h-8 w-8 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Check your email</h1>
          <p className="mt-3 text-secondary">
            We&apos;ve sent a verification link to your email address. Please click the link to
            verify your account.
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
        <h1 className="text-2xl font-bold text-foreground">Create your account</h1>
        <p className="mt-2 text-secondary">Start finding your photos instantly</p>
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
          {/* User Type Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">I am a...</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setValue('userType', 'photographer', { shouldValidate: true })}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                  selectedUserType === 'photographer'
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-border/80 hover:bg-muted/50'
                )}
              >
                <Camera
                  className={cn(
                    'h-6 w-6',
                    selectedUserType === 'photographer' ? 'text-accent' : 'text-secondary'
                  )}
                />
                <span
                  className={cn(
                    'text-sm font-medium',
                    selectedUserType === 'photographer' ? 'text-accent' : 'text-foreground'
                  )}
                >
                  Photographer
                </span>
                <span className="text-xs text-muted-foreground">Upload & sell photos</span>
              </button>
              <button
                type="button"
                onClick={() => setValue('userType', 'attendee', { shouldValidate: true })}
                className={cn(
                  'flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all',
                  selectedUserType === 'attendee'
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-border/80 hover:bg-muted/50'
                )}
              >
                <Users
                  className={cn(
                    'h-6 w-6',
                    selectedUserType === 'attendee' ? 'text-accent' : 'text-secondary'
                  )}
                />
                <span
                  className={cn(
                    'text-sm font-medium',
                    selectedUserType === 'attendee' ? 'text-accent' : 'text-foreground'
                  )}
                >
                  Attendee
                </span>
                <span className="text-xs text-muted-foreground">Find my photos</span>
              </button>
            </div>
            {errors.userType && (
              <p className="mt-1.5 text-xs text-destructive">{errors.userType.message}</p>
            )}
          </div>

          {/* Display Name */}
          <div>
            <label htmlFor="displayName" className="block text-sm font-medium text-foreground mb-2">
              Display name
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                {...register('displayName')}
                id="displayName"
                type="text"
                placeholder="John Doe"
                className="pl-11"
                error={errors.displayName?.message}
                autoComplete="name"
              />
            </div>
          </div>

          {/* Username / FaceTag */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Choose your FaceTag
            </label>
            <UsernameSelector
              value={watch('username') || ''}
              onChange={(value) => setValue('username', value, { shouldValidate: true })}
              onFaceTagChange={setPreviewFaceTag}
              disabled={isLoading}
            />
            {errors.username && (
              <p className="mt-1.5 text-xs text-destructive">{errors.username.message}</p>
            )}
          </div>

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
            <label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
              Password
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

          {/* Terms */}
          <div className="flex items-start gap-3 pt-2">
            <button
              type="button"
              onClick={() => setValue('acceptTerms', !acceptTerms, { shouldValidate: true })}
              className={cn(
                'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all',
                acceptTerms
                  ? 'border-accent bg-accent'
                  : 'border-border hover:border-secondary'
              )}
            >
              {acceptTerms && <Check className="h-3 w-3 text-white" />}
            </button>
            <div>
              <label className="text-sm text-secondary">
                I agree to the{' '}
                <Link href="/terms" className="text-accent hover:text-accent/80 transition-colors">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link href="/privacy" className="text-accent hover:text-accent/80 transition-colors">
                  Privacy Policy
                </Link>
              </label>
              {errors.acceptTerms && (
                <p className="mt-1 text-xs text-destructive">{errors.acceptTerms.message}</p>
              )}
            </div>
          </div>

          {/* Submit */}
          <Button type="submit" className="w-full" size="lg" variant="primary" isLoading={isLoading}>
            Create account
          </Button>
        </form>
      </div>

      {/* Sign In Link */}
      <p className="mt-8 text-center text-sm text-secondary">
        Already have an account?{' '}
        <Link href="/login" className="font-medium text-accent hover:text-accent/80 transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}
