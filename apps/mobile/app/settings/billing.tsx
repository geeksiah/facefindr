/**
 * Billing & Payouts Screen
 * 
 * Manage payment methods and view payout information.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CreditCard,
  Wallet,
  DollarSign,
  ChevronRight,
  Plus,
  ExternalLink,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  CheckCircle,
  AlertCircle,
} from 'lucide-react-native';

import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const APP_URL = process.env.EXPO_PUBLIC_APP_URL || '';

interface WalletData {
  balance: number;
  pendingBalance: number;
  currency: string;
}

interface Transaction {
  id: string;
  type: 'payout' | 'sale' | 'refund';
  amount: number;
  status: 'completed' | 'pending' | 'failed';
  description: string;
  createdAt: string;
}

export default function BillingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuthStore();
  
  const [isLoading, setIsLoading] = useState(true);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    try {
      // Load wallet and balance data
      const { data: walletRecord } = await supabase
        .from('wallets')
        .select('id, preferred_currency')
        .eq('photographer_id', profile?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: walletBalance } = await supabase
        .from('wallet_balances')
        .select('available_balance, pending_payout, currency')
        .eq('photographer_id', profile?.id)
        .order('wallet_id', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (walletBalance) {
        setWallet({
          balance: walletBalance.available_balance || 0,
          pendingBalance: walletBalance.pending_payout || 0,
          currency: walletBalance.currency || walletRecord?.preferred_currency || 'USD',
        });
      } else {
        setWallet({ balance: 0, pendingBalance: 0, currency: walletRecord?.preferred_currency || 'USD' });
      }

      const walletId = walletRecord?.id;

      // Load recent payouts
      const { data: payoutData } = walletId
        ? await supabase
            .from('payouts')
            .select('id, amount, status, created_at')
            .eq('wallet_id', walletId)
            .order('created_at', { ascending: false })
            .limit(10)
        : { data: [] };

      // Load recent sales
      const { data: txData } = walletId
        ? await supabase
            .from('transactions')
            .select('id, gross_amount, status, created_at, events (name)')
            .eq('wallet_id', walletId)
            .order('created_at', { ascending: false })
            .limit(10)
        : { data: [] };

      const sales: Transaction[] = (txData || []).map((tx: any) => ({
        id: tx.id,
        type: 'sale' as const,
        amount: tx.gross_amount || 0,
        status: (tx.status === 'succeeded' ? 'completed' : tx.status === 'pending' ? 'pending' : 'failed') as Transaction['status'],
        description: tx.events?.name ? `Sale: ${tx.events.name}` : 'Photo sale',
        createdAt: tx.created_at,
      }));

      const payouts: Transaction[] = (payoutData || []).map((payout: any) => ({
        id: payout.id,
        type: 'payout' as const,
        amount: payout.amount || 0,
        status: (payout.status === 'completed' ? 'completed' : payout.status === 'pending' ? 'pending' : 'failed') as Transaction['status'],
        description: 'Payout',
        createdAt: payout.created_at,
      }));

      const combined = [...sales, ...payouts]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 10);

      setTransactions(combined);
    } catch (err) {
      console.error('Error loading billing data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestPayout = () => {
    if ((wallet?.balance || 0) < 1000) {
      Alert.alert(
        'Minimum Balance Required',
        'You need at least $10.00 to request a payout.'
      );
      return;
    }

    if (!APP_URL) {
      Alert.alert('Configuration required', 'EXPO_PUBLIC_APP_URL is not set.');
      return;
    }

    Linking.openURL(`${APP_URL}/dashboard/billing`);
  };

  const handleManagePaymentMethods = () => {
    if (!APP_URL) {
      Alert.alert('Configuration required', 'EXPO_PUBLIC_APP_URL is not set.');
      return;
    }

    Linking.openURL(`${APP_URL}/dashboard/billing`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: wallet?.currency || 'USD',
    }).format(amount / 100);
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'payout':
        return ArrowUpRight;
      case 'sale':
        return ArrowDownRight;
      default:
        return DollarSign;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={14} color="#10b981" />;
      case 'pending':
        return <Clock size={14} color="#f59e0b" />;
      case 'failed':
        return <AlertCircle size={14} color="#ef4444" />;
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <View style={[styles.statusBarBg, { height: insets.top }]} />
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color={colors.foreground} />
          </Pressable>
          <Text style={styles.headerTitle}>Billing & Payouts</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      
      {/* Status bar background */}
      <View style={[styles.statusBarBg, { height: insets.top }]} />
      
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
          onPress={() => router.back()}
        >
          <ArrowLeft size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Billing & Payouts</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView 
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance Cards */}
        <View style={styles.balanceContainer}>
          <View style={styles.balanceCard}>
            <View style={[styles.balanceIcon, { backgroundColor: '#10b98115' }]}>
              <Wallet size={20} color="#10b981" />
            </View>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            <Text style={styles.balanceValue}>
              {formatCurrency(wallet?.balance || 0)}
            </Text>
          </View>
          <View style={styles.balanceCard}>
            <View style={[styles.balanceIcon, { backgroundColor: '#f59e0b15' }]}>
              <Clock size={20} color="#f59e0b" />
            </View>
            <Text style={styles.balanceLabel}>Pending</Text>
            <Text style={styles.balanceValue}>
              {formatCurrency(wallet?.pendingBalance || 0)}
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.primaryAction,
              pressed && styles.actionPressed,
            ]}
            onPress={handleRequestPayout}
          >
            <DollarSign size={20} color="#fff" />
            <Text style={styles.primaryActionText}>Request Payout</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.secondaryAction,
              pressed && styles.actionPressed,
            ]}
            onPress={handleManagePaymentMethods}
          >
            <CreditCard size={20} color={colors.accent} />
            <Text style={styles.secondaryActionText}>Payment Methods</Text>
          </Pressable>
        </View>

        {/* Web Dashboard Link */}
        <Pressable
          style={({ pressed }) => [
            styles.webDashboardCard,
            pressed && styles.pressed,
          ]}
          onPress={() => {
            if (!APP_URL) {
              Alert.alert('Configuration required', 'EXPO_PUBLIC_APP_URL is not set.');
              return;
            }
            Linking.openURL(`${APP_URL}/dashboard/billing`);
          }}
        >
          <View style={styles.webDashboardIcon}>
            <ExternalLink size={18} color="#8b5cf6" />
          </View>
          <View style={styles.webDashboardContent}>
            <Text style={styles.webDashboardTitle}>Full Billing Dashboard</Text>
            <Text style={styles.webDashboardSubtitle}>
              View detailed history, invoices & tax info
            </Text>
          </View>
          <ChevronRight size={18} color={colors.secondary} />
        </Pressable>

        {/* Recent Transactions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          
          {transactions.length === 0 ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <DollarSign size={24} color={colors.secondary} />
              </View>
              <Text style={styles.emptyTitle}>No transactions yet</Text>
              <Text style={styles.emptyText}>
                Your sales and payouts will appear here
              </Text>
            </View>
          ) : (
            <View style={styles.transactionsList}>
              {transactions.map((tx, index) => {
                const Icon = getTransactionIcon(tx.type);
                return (
                  <View 
                    key={tx.id}
                    style={[
                      styles.transactionItem,
                      index < transactions.length - 1 && styles.transactionBorder,
                    ]}
                  >
                    <View style={[
                      styles.transactionIcon,
                      { backgroundColor: tx.type === 'sale' ? '#10b98115' : '#8b5cf615' }
                    ]}>
                      <Icon 
                        size={18} 
                        color={tx.type === 'sale' ? '#10b981' : '#8b5cf6'} 
                      />
                    </View>
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionDescription} numberOfLines={1}>
                        {tx.description || (tx.type === 'sale' ? 'Photo sale' : 'Payout')}
                      </Text>
                      <View style={styles.transactionMeta}>
                        {getStatusIcon(tx.status)}
                        <Text style={styles.transactionDate}>
                          {new Date(tx.createdAt).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                    <Text style={[
                      styles.transactionAmount,
                      tx.type === 'sale' && styles.transactionAmountPositive,
                    ]}>
                      {tx.type === 'sale' ? '+' : '-'}{formatCurrency(tx.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>About Payouts</Text>
          <Text style={styles.infoText}>
            • Minimum payout amount: $10.00{'\n'}
            • Processing time: 3-5 business days{'\n'}
            • Supported methods: Bank transfer, PayPal
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBarBg: {
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.foreground,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  balanceContainer: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  balanceCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    alignItems: 'center',
  },
  balanceIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  balanceLabel: {
    fontSize: 12,
    color: colors.secondary,
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.foreground,
  },
  actionsContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
  },
  actionPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  primaryAction: {
    backgroundColor: colors.accent,
  },
  primaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryAction: {
    backgroundColor: colors.accent + '15',
    borderWidth: 1,
    borderColor: colors.accent + '30',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  webDashboardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8b5cf610',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: '#8b5cf620',
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  webDashboardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#8b5cf615',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  webDashboardContent: {
    flex: 1,
  },
  webDashboardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
  },
  webDashboardSubtitle: {
    fontSize: 12,
    color: colors.secondary,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.secondary,
    marginBottom: spacing.md,
  },
  emptyState: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: 4,
  },
  emptyText: {
    fontSize: 13,
    color: colors.secondary,
    textAlign: 'center',
  },
  transactionsList: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
  },
  transactionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
    marginBottom: 2,
  },
  transactionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  transactionDate: {
    fontSize: 12,
    color: colors.secondary,
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.foreground,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  transactionAmountPositive: {
    color: '#10b981',
  },
  infoCard: {
    backgroundColor: colors.muted,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  infoTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.sm,
  },
  infoText: {
    fontSize: 13,
    color: colors.secondary,
    lineHeight: 22,
  },
});
