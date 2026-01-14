/**
 * Welcome Screen
 * 
 * Beautiful landing page with onboarding for new users.
 */

import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Animated,
  Image,
  StatusBar,
} from 'react-native';
import { Link, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Camera,
  Sparkles,
  Zap,
  Shield,
  ChevronRight,
  QrCode,
  ArrowRight,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { colors, spacing, fontSize, borderRadius } from '@/lib/theme';

const { width, height } = Dimensions.get('window');

const ONBOARDING_SLIDES = [
  {
    id: 1,
    icon: Camera,
    title: 'Find Your Photos',
    subtitle: 'Instantly',
    description: 'Just snap a selfie and discover all your event photos in seconds. No more endless scrolling.',
    gradient: ['#0ea5e9', '#0284c7'],
  },
  {
    id: 2,
    icon: Sparkles,
    title: 'AI-Powered',
    subtitle: 'Face Recognition',
    description: 'Our advanced AI finds you in thousands of photos with incredible accuracy.',
    gradient: ['#8b5cf6', '#7c3aed'],
  },
  {
    id: 3,
    icon: Zap,
    title: 'Instant',
    subtitle: 'Delivery',
    description: 'Get notified the moment new photos of you are uploaded. Never miss a memory.',
    gradient: ['#f59e0b', '#d97706'],
  },
  {
    id: 4,
    icon: Shield,
    title: 'Your Privacy',
    subtitle: 'Protected',
    description: 'You control who can find you. Your face data is encrypted and secure.',
    gradient: ['#10b981', '#059669'],
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentSlide, setCurrentSlide] = useState(0);
  const slideAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  // Auto-advance slides
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % ONBOARDING_SLIDES.length);
    }, 4000);
    return () => clearInterval(timer);
  }, []);

  // Animate slide change
  useEffect(() => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [currentSlide]);

  const currentData = ONBOARDING_SLIDES[currentSlide];
  const IconComponent = currentData.icon;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* Animated Background */}
      <LinearGradient
        colors={currentData.gradient as [string, string]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Decorative circles */}
      <View style={[styles.decorCircle, styles.decorCircle1]} />
      <View style={[styles.decorCircle, styles.decorCircle2]} />
      <View style={[styles.decorCircle, styles.decorCircle3]} />

      {/* Content */}
      <View style={[styles.content, { paddingTop: insets.top + 20 }]}>
        {/* Logo */}
        <View style={styles.logoSection}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../assets/logos/app-icon-512.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandName}>FaceFindr</Text>
        </View>

        {/* Onboarding Content */}
        <Animated.View
          style={[
            styles.slideContent,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <View style={styles.iconContainer}>
            <IconComponent size={48} color="#fff" strokeWidth={1.5} />
          </View>
          <Text style={styles.slideTitle}>{currentData.title}</Text>
          <Text style={styles.slideSubtitle}>{currentData.subtitle}</Text>
          <Text style={styles.slideDescription}>{currentData.description}</Text>
        </Animated.View>

        {/* Slide Indicators */}
        <View style={styles.indicators}>
          {ONBOARDING_SLIDES.map((slide, index) => (
            <TouchableOpacity
              key={slide.id}
              onPress={() => setCurrentSlide(index)}
              style={[
                styles.indicator,
                currentSlide === index && styles.indicatorActive,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Bottom Actions */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 20 }]}>
        {/* Quick Access */}
        <View style={styles.quickAccess}>
          <Link href="/scan" asChild>
            <TouchableOpacity style={styles.quickButton}>
              <QrCode size={20} color="#fff" />
              <Text style={styles.quickButtonText}>Scan QR</Text>
            </TouchableOpacity>
          </Link>
          <Link href="/enter-code" asChild>
            <TouchableOpacity style={styles.quickButton}>
              <Text style={styles.quickButtonText}>Enter Code</Text>
              <ChevronRight size={18} color="#fff" />
            </TouchableOpacity>
          </Link>
        </View>

        {/* Auth Buttons */}
        <Link href="/(auth)/register" asChild>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Get Started</Text>
            <ArrowRight size={20} color={currentData.gradient[0]} />
          </TouchableOpacity>
        </Link>

        <Link href="/(auth)/login" asChild>
          <TouchableOpacity style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>
              Already have an account? <Text style={styles.signInText}>Sign In</Text>
            </Text>
          </TouchableOpacity>
        </Link>

        {/* Terms */}
        <Text style={styles.terms}>
          By continuing, you agree to our{' '}
          <Text style={styles.termsLink}>Terms</Text> and{' '}
          <Text style={styles.termsLink}>Privacy Policy</Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  decorCircle: {
    position: 'absolute',
    borderRadius: 9999,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  decorCircle1: {
    width: 300,
    height: 300,
    top: -100,
    right: -100,
  },
  decorCircle2: {
    width: 200,
    height: 200,
    bottom: 200,
    left: -80,
  },
  decorCircle3: {
    width: 150,
    height: 150,
    top: '40%',
    right: -50,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: {
    width: 60,
    height: 60,
  },
  brandName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginTop: spacing.md,
    letterSpacing: -0.5,
  },
  slideContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  slideTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    letterSpacing: -1,
  },
  slideSubtitle: {
    fontSize: 36,
    fontWeight: '300',
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    marginBottom: spacing.md,
    letterSpacing: -1,
  },
  slideDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  indicatorActive: {
    width: 24,
    backgroundColor: '#fff',
  },
  actions: {
    paddingHorizontal: spacing.lg,
  },
  quickAccess: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  quickButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: borderRadius.full,
  },
  quickButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0ea5e9',
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  signInText: {
    fontWeight: '700',
    color: '#fff',
  },
  terms: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  termsLink: {
    textDecorationLine: 'underline',
  },
});
