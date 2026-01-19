'use client';

import { 
  User, 
  Lock, 
  Bell, 
  Shield, 
  Camera, 
  CreditCard,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
  Globe,
  Instagram,
  Twitter,
  Facebook,
  MapPin,
  Phone,
  AlertCircle,
} from 'lucide-react';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';

import { WalletSettings } from '@/components/dashboard/wallet-settings';
import { useToast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface Profile {
  id: string;
  email: string;
  displayName: string;
  businessName: string;
  bio: string;
  profilePhotoUrl: string | null;
  faceTag: string | null;
  publicProfileSlug: string | null;
  isPublicProfile: boolean;
  website: string;
  instagram: string;
  twitter: string;
  facebook: string;
  phone: string;
  location: string;
  timezone: string;
}

interface NotificationSettings {
  emailEnabled: boolean;
  smsEnabled: boolean;
  pushEnabled: boolean;
  newPhotoSale: boolean;
  payoutCompleted: boolean;
  newEventView: boolean;
  weeklyDigest: boolean;
  monthlyReport: boolean;
  newFollower: boolean;
  eventReminder: boolean;
  lowBalance: boolean;
  subscriptionReminder: boolean;
  marketingEmails: boolean;
}

export default function SettingsPage() {
  const searchParams = useSearchParams();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('profile');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Profile state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileForm, setProfileForm] = useState({
    displayName: '',
    businessName: '',
    bio: '',
    website: '',
    instagram: '',
    twitter: '',
    facebook: '',
    phone: '',
    location: '',
  });
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Security state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Notification state
  const [notifications, setNotifications] = useState<NotificationSettings>({
    emailEnabled: true,
    smsEnabled: false,
    pushEnabled: true,
    newPhotoSale: true,
    payoutCompleted: true,
    newEventView: false,
    weeklyDigest: true,
    monthlyReport: true,
    newFollower: true,
    eventReminder: true,
    lowBalance: true,
    subscriptionReminder: true,
    marketingEmails: false,
  });
  const [isSavingNotifications, setIsSavingNotifications] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<string>('free');
  const isStudioPlan = currentPlan === 'studio';

  // Handle URL params for tab switching
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Load profile and settings
  useEffect(() => {
    async function loadData() {
      try {
        // Load profile
        const profileRes = await fetch('/api/photographer/profile');
        if (profileRes.ok) {
          const data = await profileRes.json();
          setProfile(data.profile);
          setProfileForm({
            displayName: data.profile.displayName || '',
            businessName: data.profile.businessName || '',
            bio: data.profile.bio || '',
            website: data.profile.website || '',
            instagram: data.profile.instagram || '',
            twitter: data.profile.twitter || '',
            facebook: data.profile.facebook || '',
            phone: data.profile.phone || '',
            location: data.profile.location || '',
          });
        }

        // Load subscription to check plan
        const subRes = await fetch('/api/photographer/subscription');
        if (subRes.ok) {
          const data = await subRes.json();
          setCurrentPlan(data.subscription?.planCode || 'free');
        }

        // Load notification settings
        const notifRes = await fetch('/api/photographer/notification-settings');
        if (notifRes.ok) {
          const data = await notifRes.json();
          setNotifications(data.settings);
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  // Save profile
  const handleSaveProfile = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/photographer/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profileForm),
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(prev => prev ? { ...prev, ...data.profile } : null);
        toast.success('Success', 'Profile updated successfully');
      } else {
        const data = await response.json();
        toast.error('Error', data.error || 'Failed to update profile');
      }
    } catch {
      toast.error('Error', 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle photo upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/user/profile-photo', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(prev => prev ? { ...prev, profilePhotoUrl: data.photoUrl } : null);
        toast.success('Success', 'Photo uploaded successfully');
      } else {
        const data = await response.json();
        toast.error('Error', data.error || 'Failed to upload photo');
      }
    } catch {
      toast.error('Error', 'Failed to upload photo');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Remove photo
  const handleRemovePhoto = async () => {
    try {
      const response = await fetch('/api/user/profile-photo', {
        method: 'DELETE',
      });

      if (response.ok) {
        setProfile(prev => prev ? { ...prev, profilePhotoUrl: null } : null);
        toast.success('Success', 'Photo removed');
      }
    } catch {
      toast.error('Error', 'Failed to remove photo');
    }
  };

  // Change password
  const handleChangePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Error', 'Passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      toast.error('Error', 'Password must be at least 8 characters');
      return;
    }

    setIsChangingPassword(true);
    try {
      const response = await fetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      if (response.ok) {
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
        toast.success('Success', 'Password changed successfully');
      } else {
        const data = await response.json();
        toast.error('Error', data.error || 'Failed to change password');
      }
    } catch {
      toast.error('Error', 'Failed to change password');
    } finally {
      setIsChangingPassword(false);
    }
  };

  // Save notification settings
  const handleSaveNotifications = async () => {
    setIsSavingNotifications(true);
    try {
      const response = await fetch('/api/photographer/notification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notifications),
      });

      if (response.ok) {
        toast.success('Success', 'Notification settings saved');
      } else {
        toast.error('Error', 'Failed to save settings');
      }
    } catch {
      toast.error('Error', 'Failed to save settings');
    } finally {
      setIsSavingNotifications(false);
    }
  };

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'payments', label: 'Payments', icon: CreditCard },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy', icon: Shield },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="mt-1 text-secondary">
          Manage your account settings and preferences.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border pb-4 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-foreground text-background'
                : 'text-secondary hover:bg-muted hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Profile Settings */}
      {activeTab === 'profile' && (
        <div className="space-y-6">
          {/* Avatar */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Profile Photo</h2>
            <div className="flex items-center gap-6">
              <div className="relative">
                {profile?.profilePhotoUrl ? (
                  <Image
                    src={profile.profilePhotoUrl}
                    alt="Profile"
                    width={80}
                    height={80}
                    className="h-20 w-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-accent/10 flex items-center justify-center">
                    <User className="h-10 w-10 text-accent" />
                  </div>
                )}
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                  className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-foreground flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50"
                >
                  {isUploadingPhoto ? (
                    <Loader2 className="h-4 w-4 text-background animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4 text-background" />
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
              <div className="space-y-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingPhoto}
                >
                  Upload Photo
                </Button>
                {profile?.profilePhotoUrl && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={handleRemovePhoto}
                    className="text-destructive hover:text-destructive"
                  >
                    Remove
                  </Button>
                )}
                <p className="text-xs text-muted-foreground">
                  JPG, PNG or WebP. Max 2MB.
                </p>
              </div>
            </div>
          </div>

          {/* FaceTag */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Your FaceTag</h2>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-mono font-semibold text-accent">
                  {profile?.faceTag || 'Not assigned yet'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Share this tag so attendees can find and follow you
                </p>
              </div>
              {profile?.faceTag && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(profile.faceTag || '');
                    toast.success('Copied', 'FaceTag copied to clipboard');
                  }}
                >
                  Copy
                </Button>
              )}
            </div>
            {profile?.isPublicProfile && profile?.publicProfileSlug && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Public profile:{' '}
                  <a 
                    href={`/p/${profile.publicProfileSlug}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-accent hover:underline"
                  >
                    {new URL(process.env.NEXT_PUBLIC_APP_URL || window.location.origin).hostname}/p/{profile.publicProfileSlug}
                  </a>
                </p>
              </div>
            )}
          </div>

          {/* Basic Info */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Basic Information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Display Name"
                value={profileForm.displayName}
                onChange={(e) => setProfileForm(prev => ({ ...prev, displayName: e.target.value }))}
                placeholder="Your name"
              />
              <Input
                label="Business Name"
                value={profileForm.businessName}
                onChange={(e) => setProfileForm(prev => ({ ...prev, businessName: e.target.value }))}
                placeholder="Studio or business name"
              />
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-foreground mb-2">Bio</label>
                <textarea
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, bio: e.target.value }))}
                  placeholder="Tell people about yourself and your photography..."
                  rows={3}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all duration-200 resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-secondary" />
                <Input
                  label="Location"
                  value={profileForm.location}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="City, Country"
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-secondary" />
                <Input
                  label="Phone"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="+1 234 567 8900"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          {/* Social Links */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Social Links</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-secondary" />
                <Input
                  value={profileForm.website}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, website: e.target.value }))}
                  placeholder="https://yourwebsite.com"
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <Instagram className="h-4 w-4 text-secondary" />
                <Input
                  value={profileForm.instagram}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, instagram: e.target.value }))}
                  placeholder="@username"
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <Twitter className="h-4 w-4 text-secondary" />
                <Input
                  value={profileForm.twitter}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, twitter: e.target.value }))}
                  placeholder="@username"
                  className="flex-1"
                />
              </div>
              <div className="flex items-center gap-2">
                <Facebook className="h-4 w-4 text-secondary" />
                <Input
                  value={profileForm.facebook}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, facebook: e.target.value }))}
                  placeholder="facebook.com/username"
                  className="flex-1"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSaveProfile} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Payments Settings */}
      {activeTab === 'payments' && <WalletSettings />}

      {/* Security Settings */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          {/* Email */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Email Address</h2>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <p className="text-foreground">{profile?.email}</p>
                <p className="text-sm text-secondary">Your email is verified</p>
              </div>
              <div className="flex items-center gap-2 text-success">
                <Check className="h-4 w-4" />
                <span className="text-sm font-medium">Verified</span>
              </div>
            </div>
          </div>

          {/* Change Password */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Change Password</h2>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwordForm.currentPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, current: !prev.current }))}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground transition-colors"
                  >
                    {showPasswords.current ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 pr-12 text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground transition-colors"
                  >
                    {showPasswords.new ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className={`w-full rounded-xl border bg-background px-4 py-3 pr-12 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 transition-all duration-200 ${
                      passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword
                        ? 'border-destructive focus:border-destructive focus:ring-destructive/20'
                        : 'border-border focus:border-accent focus:ring-accent/20'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-secondary hover:text-foreground transition-colors"
                  >
                    {showPasswords.confirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {passwordForm.confirmPassword && passwordForm.newPassword !== passwordForm.confirmPassword && (
                  <p className="mt-2 text-sm text-destructive">Passwords do not match</p>
                )}
              </div>
              <Button 
                onClick={handleChangePassword} 
                disabled={isChangingPassword || !passwordForm.currentPassword || !passwordForm.newPassword}
              >
                {isChangingPassword ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Changing...
                  </>
                ) : (
                  'Change Password'
                )}
              </Button>
            </div>
          </div>

          {/* Two-Factor Auth */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Two-Factor Authentication</h2>
                <p className="text-sm text-secondary mt-1">
                  Add an extra layer of security to your account
                </p>
              </div>
              <Button variant="outline">Enable 2FA</Button>
            </div>
          </div>

          {/* Active Sessions */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Active Sessions</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                <div>
                  <p className="font-medium text-foreground">Current Session</p>
                  <p className="text-sm text-secondary">Chrome on Windows</p>
                </div>
                <span className="text-xs text-success font-medium">Active now</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notification Settings */}
      {activeTab === 'notifications' && (
        <div className="space-y-6">
          {/* Channels */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Notification Channels</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Email Notifications</p>
                  <p className="text-sm text-secondary">Receive notifications via email</p>
                </div>
                <Switch
                  checked={notifications.emailEnabled}
                  onChange={(checked) => setNotifications(prev => ({ ...prev, emailEnabled: checked }))}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Push Notifications</p>
                  <p className="text-sm text-secondary">Receive browser push notifications</p>
                </div>
                <Switch
                  checked={notifications.pushEnabled}
                  onChange={(checked) => setNotifications(prev => ({ ...prev, pushEnabled: checked }))}
                />
              </div>
            </div>
          </div>

          {/* SMS Notifications - Studio Plan Only */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="font-semibold text-foreground">SMS Notifications</h2>
              <span className="px-2 py-0.5 text-xs font-medium bg-accent/10 text-accent rounded-full">
                Studio Plan
              </span>
            </div>
            <p className="text-sm text-secondary mb-4">
              Receive SMS alerts for payout notifications. Available exclusively on the Studio plan.
            </p>
            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/50">
              <div>
                <p className="font-medium text-foreground">Payout SMS Alerts</p>
                <p className="text-sm text-secondary">Get notified via SMS when payouts are processed</p>
              </div>
              <Switch
                checked={notifications.smsEnabled}
                onChange={(checked) => setNotifications(prev => ({ ...prev, smsEnabled: checked }))}
                disabled={!isStudioPlan}
              />
            </div>
            {!isStudioPlan && (
              <p className="text-xs text-secondary mt-3">
                Upgrade to Studio plan to enable SMS notifications.
              </p>
            )}
          </div>

          {/* Notification Types */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Notification Types</h2>
            <div className="space-y-4">
              {[
                { key: 'newPhotoSale', label: 'New Photo Sale', desc: 'When someone purchases your photos' },
                { key: 'payoutCompleted', label: 'Payout Completed', desc: 'When a payout is processed' },
                { key: 'newEventView', label: 'New Event Views', desc: 'When someone views your event' },
                { key: 'weeklyDigest', label: 'Weekly Digest', desc: 'Weekly summary of your activity' },
                { key: 'monthlyReport', label: 'Monthly Report', desc: 'Monthly earnings and analytics' },
                { key: 'newFollower', label: 'New Follower', desc: 'When someone follows you' },
                { key: 'eventReminder', label: 'Event Reminders', desc: 'Reminders for upcoming events' },
                { key: 'lowBalance', label: 'Low Balance Alert', desc: 'When your wallet balance is low' },
                { key: 'subscriptionReminder', label: 'Subscription Reminder', desc: 'Before your subscription renews' },
                { key: 'marketingEmails', label: 'Marketing & Updates', desc: 'Tips, features, and promotions' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-foreground">{item.label}</p>
                    <p className="text-sm text-secondary">{item.desc}</p>
                  </div>
                  <Switch
                    checked={notifications[item.key as keyof NotificationSettings] as boolean}
                    onChange={(checked) => setNotifications(prev => ({ ...prev, [item.key]: checked }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button onClick={handleSaveNotifications} disabled={isSavingNotifications}>
              {isSavingNotifications ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Save Preferences
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Privacy Settings */}
      {activeTab === 'privacy' && (
        <div className="space-y-6">
          {/* Data & Privacy */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Data & Privacy</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Profile Visibility</p>
                  <p className="text-sm text-secondary">Allow others to find and view your profile</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Show in Search</p>
                  <p className="text-sm text-secondary">Appear in photographer search results</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-foreground">Analytics Sharing</p>
                  <p className="text-sm text-secondary">Help improve FaceFindr with anonymous usage data</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </div>

          {/* Export Data */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-foreground">Export Your Data</h2>
                <p className="text-sm text-secondary mt-1">
                  Download a copy of all your data in JSON format
                </p>
              </div>
              <Button variant="outline">Export Data</Button>
            </div>
          </div>

          {/* Delete Account */}
          <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                <AlertCircle className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex-1">
                <h2 className="font-semibold text-destructive">Delete Account</h2>
                <p className="text-sm text-secondary mt-1">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <Button variant="destructive" size="sm" className="mt-4">
                  Delete Account
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
