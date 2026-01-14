/**
 * Welcome Screen
 * 
 * Clean, minimal landing page with elegant onboarding.
 */

import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  StatusBar,
  FlatList,
} from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  Sparkles,
  Zap,
  Shield,
  ChevronRight,
} from 'lucide-react-native';

import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1',
    icon: Camera,
    title: 'Find Your Photos',
    description: 'Scan your face to instantly discover all your event photos',
    color: colors.accent,
  },
  {
    id: '2',
    icon: Sparkles,
    title: 'AI-Powered',
    description: 'Advanced face recognition finds you in thousands of photos',
    color: '#8b5cf6',
  },
  {
    id: '3',
    icon: Zap,
    title: 'Instant Delivery',
    description: 'Get notified the moment new photos of you are uploaded',
    color: '#f59e0b',
  },
  {
    id: '4',
    icon: Shield,
    title: 'Privacy First',
    description: 'You control who can find you. Your data stays secure',
    color: '#10b981',
  },
];

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  // Auto-advance slides
  useEffect(() => {
    const timer = setInterval(() => {
      const nextIndex = (activeIndex + 1) % SLIDES.length;
      flatListRef.current?.scrollToIndex({ index: nextIndex, animated: true });
      setActiveIndex(nextIndex);
    }, 4000);
    return () => clearInterval(timer);
  }, [activeIndex]);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
  );

  const handleMomentumScrollEnd = (e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  };

  const renderSlide = ({ item, index }: { item: typeof SLIDES[0]; index: number }) => {
    const Icon = item.icon;
    return (
      <View style={styles.slide}>
        <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
          <Icon size={40} color={item.color} strokeWidth={1.5} />
        </View>
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={styles.slideDescription}>{item.description}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 40 }]}>
        <View style={styles.logoContainer}>
          <Camera size={28} color={colors.accent} strokeWidth={1.5} />
        </View>
        <Text style={styles.brandName}>FaceFindr</Text>
        <Text style={styles.tagline}>Your photos, found instantly</Text>
      </View>

      {/* Slides */}
      <View style={styles.slidesContainer}>
        <FlatList
          ref={flatListRef}
          data={SLIDES}
          renderItem={renderSlide}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
        />

        {/* Indicators */}
        <View style={styles.indicators}>
          {SLIDES.map((_, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => {
                flatListRef.current?.scrollToIndex({ index, animated: true });
                setActiveIndex(index);
              }}
            >
              <View
                style={[
                  styles.indicator,
                  activeIndex === index && styles.indicatorActive,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Actions */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 20 }]}>
        <Link href="/(auth)/register" asChild>
          <TouchableOpacity style={styles.primaryButton} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>Get Started</Text>
            <ChevronRight size={20} color="#fff" />
          </TouchableOpacity>
        </Link>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.7}>
            <Text style={styles.secondaryButtonText}>
              Already have an account? <Text style={styles.signInText}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </Link>

        <View style={styles.quickActions}>
          <Link href="/scan" asChild>
            <TouchableOpacity style={styles.quickButton} activeOpacity={0.7}>
              <Text style={styles.quickButtonText}>Scan QR</Text>
            </TouchableOpacity>
          </Link>
          <View style={styles.quickDivider} />
          <Link href="/enter-code" asChild>
            <TouchableOpacity style={styles.quickButton} activeOpacity={0.7}>
              <Text style={styles.quickButtonText}>Enter Code</Text>
            </TouchableOpacity>
          </Link>
        </View>

        <Text style={styles.terms}>
          By continuing, you agree to our Terms & Privacy Policy
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  logoContainer: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.accent + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  brandName: {
    fontSize: 32,
    fontWeight: '700',
    color: colors.foreground,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 15,
    color: colors.secondary,
    marginTop: 4,
  },
  slidesContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  slide: {
    width: width,
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  slideTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.foreground,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  slideDescription: {
    fontSize: 16,
    color: colors.secondary,
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 280,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  indicatorActive: {
    width: 24,
    backgroundColor: colors.accent,
  },
  actions: {
    paddingHorizontal: spacing.lg,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: colors.accent,
    paddingVertical: 16,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  secondaryButtonText: {
    fontSize: 15,
    color: colors.secondary,
  },
  signInText: {
    fontWeight: '600',
    color: colors.accent,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  quickButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  quickButtonText: {
    fontSize: 14,
    color: colors.secondary,
    fontWeight: '500',
  },
  quickDivider: {
    width: 1,
    height: 16,
    backgroundColor: colors.border,
  },
  terms: {
    fontSize: 12,
    color: colors.secondary,
    textAlign: 'center',
    opacity: 0.7,
  },
});
