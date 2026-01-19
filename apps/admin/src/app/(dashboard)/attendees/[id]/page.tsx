import { 
  ArrowLeft, 
  Mail, 
  Calendar, 
  Image, 
  DollarSign,
  CheckCircle,
  XCircle,
  User,
  Tag,
  Download,
  ShoppingCart,
} from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { supabaseAdmin } from '@/lib/supabase';
import { formatDate, formatDateTime, formatCurrency, getInitials } from '@/lib/utils';

async function getAttendee(id: string) {
  const { data: attendee, error } = await supabaseAdmin
    .from('attendees')
    .select(`
      *,
      entitlements (
        id,
        created_at,
        media:media_id (
          id,
          original_filename,
          event_id,
          events:event_id (
            id,
            name
          )
        )
      ),
      transactions (
        id,
        gross_amount,
        net_amount,
        platform_fee,
        status,
        currency,
        created_at,
        events:event_id (
          id,
          name
        )
      ),
      attendee_face_profiles (
        id,
        rekognition_face_id,
        is_primary,
        confidence,
        created_at
      )
    `)
    .eq('id', id)
    .single();

  if (error || !attendee) {
    return null;
  }

  if (error || !attendee) {
    return null;
  }

  // Get event details for transactions
  const eventIds = [
    ...new Set([
      ...(attendee.transactions?.map((t: any) => t.event_id).filter(Boolean) || []),
      ...(attendee.entitlements?.map((e: any) => e.event_id).filter(Boolean) || []),
    ])
  ];

  const { data: events } = await supabaseAdmin
    .from('events')
    .select('id, name')
    .in('id', eventIds.length > 0 ? eventIds : ['00000000-0000-0000-0000-000000000000']);

  const eventsMap = new Map(events?.map((e: any) => [e.id, e.name]) || []);

  // Get media details for entitlements
  const mediaIds = attendee.entitlements?.map((e: any) => e.media_id).filter(Boolean) || [];
  const { data: media } = await supabaseAdmin
    .from('media')
    .select('id, original_filename, event_id')
    .in('id', mediaIds.length > 0 ? mediaIds : ['00000000-0000-0000-0000-000000000000']);

  const mediaMap = new Map(media?.map((m: any) => [m.id, m]) || []);

  // Enrich transactions and entitlements with event names
  const enrichedTransactions = attendee.transactions?.map((t: any) => ({
    ...t,
    event_name: eventsMap.get(t.event_id) || 'Unknown Event',
  })) || [];

  const enrichedEntitlements = attendee.entitlements?.map((e: any) => {
    const mediaData = mediaMap.get(e.media_id);
    return {
      ...e,
      media: mediaData,
      event_name: eventsMap.get(e.event_id) || 'Unknown Event',
    };
  }) || [];

  // Calculate summary stats
  const totalSpent = enrichedTransactions
    .filter((t: any) => t.status === 'succeeded')
    .reduce((sum: number, t: any) => sum + (t.gross_amount || 0), 0);

  const totalPurchases = enrichedEntitlements.length;
  const totalTransactions = enrichedTransactions.length;
  const successfulTransactions = enrichedTransactions.filter((t: any) => t.status === 'succeeded').length;

  return {
    ...attendee,
    transactions: enrichedTransactions,
    entitlements: enrichedEntitlements,
    summary: {
      totalSpent,
      totalPurchases,
      totalTransactions,
      successfulTransactions,
    },
  };
}

export default async function AttendeeDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const attendee = await getAttendee(params.id);

  if (!attendee) {
    notFound();
  }

  const recentTransactions = attendee.transactions
    ?.slice()
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10) || [];

  const recentEntitlements = attendee.entitlements
    ?.slice()
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10) || [];

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Link
        href="/attendees"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Attendees
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          {attendee.profile_photo_url ? (
            <img
              src={attendee.profile_photo_url}
              alt=""
              className="w-20 h-20 rounded-2xl object-cover"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center text-2xl font-bold text-foreground">
              {getInitials(attendee.display_name || attendee.email || 'A')}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {attendee.display_name || 'Anonymous User'}
            </h1>
            {attendee.email && (
              <p className="text-muted-foreground">{attendee.email}</p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                attendee.status === 'active' ? 'bg-green-500/10 text-green-500' :
                attendee.status === 'suspended' ? 'bg-red-500/10 text-red-500' :
                'bg-yellow-500/10 text-yellow-500'
              }`}>
                {attendee.status.replace('_', ' ')}
              </span>
              {attendee.email_verified && (
                <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-500 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Verified
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={ShoppingCart}
          label="Total Purchases"
          value={attendee.summary.totalPurchases}
        />
        <StatCard
          icon={DollarSign}
          label="Total Spent"
          value={formatCurrency(attendee.summary.totalSpent)}
        />
        <StatCard
          icon={Image}
          label="Photos Owned"
          value={attendee.summary.totalPurchases}
        />
        <StatCard
          icon={CheckCircle}
          label="Transactions"
          value={`${attendee.summary.successfulTransactions}/${attendee.summary.totalTransactions}`}
        />
      </div>

      {/* Details Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Account Info */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Account Information</h2>
          <dl className="space-y-3">
            {attendee.email && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="text-foreground flex items-center gap-2">
                  {attendee.email}
                  {attendee.email_verified ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-500" />
                  )}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">FaceTag</dt>
              <dd className="text-foreground font-mono">{attendee.face_tag}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Display Name</dt>
              <dd className="text-foreground">{attendee.display_name || 'Not set'}</dd>
            </div>
            {attendee.date_of_birth && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Date of Birth</dt>
                <dd className="text-foreground">{formatDate(attendee.date_of_birth)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Joined</dt>
              <dd className="text-foreground">{formatDate(attendee.created_at)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Last Updated</dt>
              <dd className="text-foreground">{formatDateTime(attendee.updated_at)}</dd>
            </div>
            {attendee.last_face_refresh && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Last Face Refresh</dt>
                <dd className="text-foreground">{formatDateTime(attendee.last_face_refresh)}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Face Profiles */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Face Profiles</h2>
          {attendee.attendee_face_profiles && attendee.attendee_face_profiles.length > 0 ? (
            <div className="space-y-3">
              {attendee.attendee_face_profiles.map((profile: any) => (
                <div key={profile.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-foreground font-medium flex items-center gap-2">
                      {profile.is_primary && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-accent/10 text-accent">
                          Primary
                        </span>
                      )}
                      Face Profile
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Confidence: {profile.confidence ? `${profile.confidence}%` : 'N/A'} · {formatDate(profile.created_at)}
                    </p>
                    <p className="text-xs font-mono text-muted-foreground mt-1">
                      {profile.rekognition_face_id}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No face profiles registered</p>
          )}
        </div>

        {/* Recent Transactions */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Recent Transactions</h2>
          {recentTransactions.length > 0 ? (
            <div className="space-y-3">
              {recentTransactions.map((transaction: any) => (
                <div key={transaction.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-foreground font-medium">
                      {formatCurrency(transaction.gross_amount, transaction.currency)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.event_name} · {formatDate(transaction.created_at)}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                    transaction.status === 'succeeded' ? 'bg-green-500/10 text-green-500' :
                    transaction.status === 'failed' ? 'bg-red-500/10 text-red-500' :
                    transaction.status === 'refunded' ? 'bg-orange-500/10 text-orange-500' :
                    'bg-yellow-500/10 text-yellow-500'
                  }`}>
                    {transaction.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No transactions yet</p>
          )}
        </div>

        {/* Recent Purchases */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold text-foreground mb-4">Recent Purchases</h2>
          {recentEntitlements.length > 0 ? (
            <div className="space-y-3">
              {recentEntitlements.map((entitlement: any) => (
                <div key={entitlement.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-foreground font-medium">
                      {entitlement.media?.original_filename || 'Photo'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {entitlement.media?.events?.name || 'Unknown Event'} · {formatDate(entitlement.created_at)}
                    </p>
                  </div>
                  <Link
                    href={`/events/${entitlement.media?.event_id}`}
                    className="text-xs text-accent hover:underline"
                  >
                    View Event
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No purchases yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ 
  icon: Icon, 
  label, 
  value 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-muted p-2">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </div>
    </div>
  );
}
