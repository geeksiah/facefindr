/**
 * Checkout Screen
 * 
 * Handles photo purchases with various payment methods.
 */

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  ArrowLeft,
  CreditCard,
  Smartphone,
  Check,
  Shield,
  Lock,
} from 'lucide-react-native';

import { Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/auth-store';
import { supabase } from '@/lib/supabase';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

interface CartItem {
  id: string;
  thumbnailUrl: string;
  price: number;
}

type PaymentMethod = 'card' | 'mobile_money' | 'paypal';

export default function CheckoutScreen() {
  const router = useRouter();
  const { eventId, photoIds } = useLocalSearchParams<{
    eventId: string;
    photoIds: string;
  }>();
  const { profile } = useAuthStore();

  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>('card');
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  const photoIdArray = photoIds?.split(',') || [];

  useEffect(() => {
    loadCartItems();
  }, []);

  const loadCartItems = async () => {
    try {
      const { data } = await supabase
        .from('media')
        .select('id, thumbnail_path')
        .in('id', photoIdArray);

      // Get pricing for event
      const { data: pricing } = await supabase
        .from('event_pricing')
        .select('single_photo_price')
        .eq('event_id', eventId)
        .single();

      const price = pricing?.single_photo_price || 2.99;

      if (data) {
        setCartItems(
          data.map((item: any) => ({
            id: item.id,
            thumbnailUrl: item.thumbnail_path,
            price,
          }))
        );
      }
    } catch (err) {
      console.error('Error loading cart:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const subtotal = cartItems.reduce((sum, item) => sum + item.price, 0);
  const processingFee = subtotal * 0.03; // 3% processing fee
  const total = subtotal + processingFee;

  const handleCheckout = async () => {
    setIsProcessing(true);

    try {
      const apiUrl = process.env.EXPO_PUBLIC_API_URL;

      const response = await fetch(`${apiUrl}/api/checkout/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          photoIds: photoIdArray,
          paymentMethod: selectedMethod,
          attendeeId: profile?.id,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Checkout failed');
      }

      if (data.checkoutUrl) {
        // Open Stripe/PayPal checkout in browser
        Linking.openURL(data.checkoutUrl);
      } else if (data.success) {
        // Direct purchase successful
        Alert.alert(
          'Purchase Complete!',
          'Your photos are now available for download.',
          [
            {
              text: 'View Photos',
              onPress: () => router.replace('/(attendee)/'),
            },
          ]
        );
      }
    } catch (err: any) {
      console.error('Checkout error:', err);
      Alert.alert('Checkout Failed', err.message || 'Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const paymentMethods = [
    {
      id: 'card' as const,
      icon: CreditCard,
      title: 'Credit / Debit Card',
      description: 'Visa, Mastercard, Amex',
    },
    {
      id: 'mobile_money' as const,
      icon: Smartphone,
      title: 'Mobile Money',
      description: 'M-Pesa, MTN, Airtel',
    },
  ];

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Checkout',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()}>
              <ArrowLeft size={24} color={colors.foreground} />
            </TouchableOpacity>
          ),
        }}
      />

      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Cart Items */}
          <Text style={styles.sectionTitle}>Your Photos</Text>
          <View style={styles.cartGrid}>
            {cartItems.map((item) => (
              <Image
                key={item.id}
                source={{ uri: item.thumbnailUrl }}
                style={styles.cartImage}
              />
            ))}
          </View>

          {/* Payment Methods */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
            Payment Method
          </Text>
          
          {paymentMethods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.paymentOption,
                selectedMethod === method.id && styles.paymentOptionSelected,
              ]}
              onPress={() => setSelectedMethod(method.id)}
            >
              <method.icon
                size={24}
                color={
                  selectedMethod === method.id ? colors.accent : colors.secondary
                }
              />
              <View style={styles.paymentInfo}>
                <Text
                  style={[
                    styles.paymentTitle,
                    selectedMethod === method.id && styles.paymentTitleSelected,
                  ]}
                >
                  {method.title}
                </Text>
                <Text style={styles.paymentDescription}>{method.description}</Text>
              </View>
              <View
                style={[
                  styles.radio,
                  selectedMethod === method.id && styles.radioSelected,
                ]}
              >
                {selectedMethod === method.id && (
                  <Check size={14} color="#fff" />
                )}
              </View>
            </TouchableOpacity>
          ))}

          {/* Order Summary */}
          <Card style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Order Summary</Text>
            
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>
                {cartItems.length} photo{cartItems.length !== 1 ? 's' : ''}
              </Text>
              <Text style={styles.summaryValue}>${subtotal.toFixed(2)}</Text>
            </View>
            
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Processing fee</Text>
              <Text style={styles.summaryValue}>${processingFee.toFixed(2)}</Text>
            </View>

            <View style={styles.divider} />

            <View style={styles.summaryRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>
          </Card>

          {/* Security Notice */}
          <View style={styles.securityNotice}>
            <Lock size={16} color={colors.secondary} />
            <Text style={styles.securityText}>
              Your payment is secured with 256-bit encryption
            </Text>
          </View>

          {/* Checkout Button */}
          <Button
            onPress={handleCheckout}
            loading={isProcessing}
            fullWidth
            size="lg"
          >
            <Shield size={20} color="#fff" />
            {` Pay $${total.toFixed(2)}`}
          </Button>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  cartGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cartImage: {
    width: 60,
    height: 60,
    borderRadius: borderRadius.md,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  paymentOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '08',
  },
  paymentInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  paymentTitle: {
    fontSize: fontSize.base,
    fontWeight: '500',
    color: colors.foreground,
  },
  paymentTitleSelected: {
    color: colors.accent,
  },
  paymentDescription: {
    fontSize: fontSize.sm,
    color: colors.secondary,
    marginTop: 2,
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  summaryCard: {
    marginTop: spacing.lg,
  },
  summaryTitle: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    color: colors.secondary,
  },
  summaryValue: {
    fontSize: fontSize.sm,
    color: colors.foreground,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  totalLabel: {
    fontSize: fontSize.base,
    fontWeight: '600',
    color: colors.foreground,
  },
  totalValue: {
    fontSize: fontSize.lg,
    fontWeight: 'bold',
    color: colors.accent,
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    marginVertical: spacing.lg,
  },
  securityText: {
    fontSize: fontSize.xs,
    color: colors.secondary,
  },
});
