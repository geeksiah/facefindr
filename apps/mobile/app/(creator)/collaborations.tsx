/**
 * Collaborations Screen (Mobile)
 *
 * Parity with web collaboration invite/accept flow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Check, X, Users, Camera } from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { colors, spacing, borderRadius, fontSize } from '@/lib/theme';
import { getApiBaseUrl } from '@/lib/api-base';

type CollaborationStatus = 'pending' | 'active' | 'declined';
type CollaborationRole = 'owner' | 'lead' | 'collaborator' | 'assistant';

type CollaborationEvent = {
  id: string;
  name: string;
  event_date: string;
  photographers?: {
    id: string;
    display_name?: string;
    face_tag?: string;
  } | null;
};

type CollaborationItem = {
  id: string;
  role: CollaborationRole;
  status: CollaborationStatus;
  invited_at?: string | null;
  accepted_at?: string | null;
  revenue_share_percent?: number | null;
  events?: CollaborationEvent | CollaborationEvent[] | null;
};

const API_URL = getApiBaseUrl();

function normalizeEvent(raw: CollaborationItem['events']): CollaborationEvent | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] || null) : raw;
}

export default function CollaborationsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuthStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const [items, setItems] = useState<CollaborationItem[]>([]);

  const loadCollaborations = useCallback(async () => {
    try {
      if (!session?.access_token) return;

      const response = await fetch(`${API_URL}/api/collaborations`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Failed to load collaborations');
      }

      setItems((payload.collaborations || []) as CollaborationItem[]);
    } catch (error: any) {
      Alert.alert('Unable to load', error?.message || 'Failed to load collaborations');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadCollaborations();
  }, [loadCollaborations]);

  const pendingItems = useMemo(
    () => items.filter((item) => item.status === 'pending'),
    [items]
  );
  const activeItems = useMemo(
    () => items.filter((item) => item.status === 'active'),
    [items]
  );

  const handleInvitationAction = useCallback(
    async (collaborationId: string, action: 'accept' | 'decline') => {
      if (!session?.access_token) return;
      setActingId(collaborationId);
      try {
        const response = await fetch(`${API_URL}/api/collaborations`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ collaborationId, action }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          if (response.status === 403 && payload?.code === 'LIMIT_EXCEEDED') {
            throw new Error(payload?.error || 'Team limit reached for this event.');
          }
          throw new Error(payload?.error || `Failed to ${action} invitation`);
        }

        setItems((prev) =>
          prev.map((item) =>
            item.id === collaborationId
              ? {
                  ...item,
                  status: action === 'accept' ? 'active' : 'declined',
                  accepted_at: action === 'accept' ? new Date().toISOString() : item.accepted_at,
                }
              : item
          )
        );
      } catch (error: any) {
        Alert.alert(
          action === 'accept' ? 'Accept failed' : 'Decline failed',
          error?.message || `Failed to ${action} invitation`
        );
      } finally {
        setActingId(null);
      }
    },
    [session?.access_token]
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    void loadCollaborations();
  }, [loadCollaborations]);

  const renderPendingItem = ({ item }: { item: CollaborationItem }) => {
    const event = normalizeEvent(item.events);
    const ownerName = event?.photographers?.display_name || 'Creator';
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{event?.name || 'Event'}</Text>
        <Text style={styles.cardSubtitle}>
          Invited by {ownerName} as {item.role}
        </Text>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={() => void handleInvitationAction(item.id, 'accept')}
            disabled={actingId === item.id}
          >
            {actingId === item.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Check size={14} color="#fff" />
                <Text style={styles.acceptText}>Accept</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.declineButton]}
            onPress={() => void handleInvitationAction(item.id, 'decline')}
            disabled={actingId === item.id}
          >
            <X size={14} color={colors.foreground} />
            <Text style={styles.declineText}>Decline</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderActiveItem = ({ item }: { item: CollaborationItem }) => {
    const event = normalizeEvent(item.events);
    const ownerName = event?.photographers?.display_name || 'Creator';
    const revenueShare = Number(item.revenue_share_percent ?? 100);
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (event?.id) {
            router.push(`/event/${event.id}` as any);
          }
        }}
        activeOpacity={0.75}
      >
        <Text style={styles.cardTitle}>{event?.name || 'Event'}</Text>
        <Text style={styles.cardSubtitle}>
          {item.role} • {ownerName} • {revenueShare}% share
        </Text>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <ArrowLeft size={20} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Collaborations</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={20} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Collaborations</Text>
        <View style={{ width: 36 }} />
      </View>

      <FlatList
        data={[{ id: 'pending' }, { id: 'active' }]}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => {
          if (item.id === 'pending') {
            return (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Users size={16} color={colors.accent} />
                  <Text style={styles.sectionTitle}>Pending Invites ({pendingItems.length})</Text>
                </View>
                {pendingItems.length === 0 ? (
                  <Text style={styles.emptyText}>No pending collaboration invites.</Text>
                ) : (
                  <FlatList
                    data={pendingItems}
                    keyExtractor={(row) => row.id}
                    scrollEnabled={false}
                    ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
                    renderItem={renderPendingItem}
                  />
                )}
              </View>
            );
          }

          return (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Camera size={16} color={colors.accent} />
                <Text style={styles.sectionTitle}>Active ({activeItems.length})</Text>
              </View>
              {activeItems.length === 0 ? (
                <Text style={styles.emptyText}>You are not collaborating on any events yet.</Text>
              ) : (
                <FlatList
                  data={activeItems}
                  keyExtractor={(row) => row.id}
                  scrollEnabled={false}
                  ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
                  renderItem={renderActiveItem}
                />
              )}
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.muted,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.foreground,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.foreground,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.secondary,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  card: {
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  cardSubtitle: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  actionRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  acceptButton: {
    backgroundColor: colors.accent,
  },
  declineButton: {
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  acceptText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
  declineText: {
    color: colors.foreground,
    fontSize: fontSize.sm,
    fontWeight: '600',
  },
});

