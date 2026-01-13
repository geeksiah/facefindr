'use client';

import { useState } from 'react';
import { User, Mail, Lock, Bell, Shield, Trash2, Camera } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');

  const tabs = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'security', label: 'Security', icon: Lock },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'privacy', label: 'Privacy', icon: Shield },
  ];

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
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
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
                <div className="h-20 w-20 rounded-full bg-accent/10 flex items-center justify-center">
                  <User className="h-10 w-10 text-accent" />
                </div>
                <button className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-foreground flex items-center justify-center">
                  <Camera className="h-4 w-4 text-background" />
                </button>
              </div>
              <div>
                <Button variant="outline" size="sm">
                  Upload Photo
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">
                  JPG, PNG or WebP. Max 2MB.
                </p>
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Basic Information</h2>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Display Name
                </label>
                <Input placeholder="Your name" defaultValue="" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Business Name
                </label>
                <Input placeholder="Your business name (optional)" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="you@example.com" className="pl-11" disabled />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Contact support to change your email.
                </p>
              </div>
              <Button variant="primary">Save Changes</Button>
            </div>
          </div>
        </div>
      )}

      {/* Security Settings */}
      {activeTab === 'security' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Change Password</h2>
            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Current Password
                </label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  New Password
                </label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Confirm New Password
                </label>
                <Input type="password" placeholder="••••••••" />
              </div>
              <Button variant="primary">Update Password</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-2">Two-Factor Authentication</h2>
            <p className="text-sm text-secondary mb-4">
              Add an extra layer of security to your account.
            </p>
            <Button variant="outline">Enable 2FA</Button>
          </div>
        </div>
      )}

      {/* Notification Settings */}
      {activeTab === 'notifications' && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Email Notifications</h2>
          <div className="space-y-4">
            {[
              { id: 'sales', label: 'New photo sales', description: 'Get notified when someone purchases your photos', defaultChecked: true },
              { id: 'activity', label: 'Event activity', description: 'Updates about your event views and engagement', defaultChecked: true },
              { id: 'marketing', label: 'Marketing updates', description: 'Tips, features, and promotional offers', defaultChecked: false },
            ].map((item) => (
              <div key={item.id} className="flex items-center justify-between py-3">
                <div className="flex-1 pr-4">
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="text-sm text-muted-foreground">{item.description}</p>
                </div>
                <Switch 
                  id={item.id} 
                  defaultChecked={item.defaultChecked}
                  onCheckedChange={(checked) => console.log(`${item.id}: ${checked}`)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Privacy Settings */}
      {activeTab === 'privacy' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <h2 className="font-semibold text-foreground mb-4">Data & Privacy</h2>
            <div className="space-y-4">
              <Button variant="outline">
                Download My Data
              </Button>
              <p className="text-xs text-muted-foreground">
                Request a copy of all your data including photos, events, and account information.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-destructive/50 bg-destructive/5 p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-destructive/10 p-2">
                <Trash2 className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <h2 className="font-semibold text-foreground">Delete Account</h2>
                <p className="mt-1 text-sm text-secondary">
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
