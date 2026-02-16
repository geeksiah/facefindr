/**
 * Welcome Screen
 * 
 * Professional, clean onboarding experience with elegant animations,
 * sophisticated design, and smooth user experience.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  StatusBar,
  FlatList,
  Animated,
  Easing,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { 
  Circle, 
  Path, 
  Defs, 
  LinearGradient as SvgLinearGradient, 
  Stop, 
  G, 
  Rect,
  Ellipse,
} from 'react-native-svg';
import { ArrowRight, ChevronRight } from 'lucide-react-native';

import { colors, spacing, borderRadius } from '@/lib/theme';

const { width, height } = Dimensions.get('window');

// Professional color palette
const PALETTE = {
  primary: '#0A84FF',
  primaryDark: '#0066CC',
  secondary: '#5E5CE6',
  surface: '#FFFFFF',
  surfaceLight: '#F8F9FA',
  text: '#1A1A2E',
  textSecondary: '#6B7280',
  accent: '#FF9F0A',
};

interface Slide {
  id: string;
  title: string;
  subtitle: string;
  accentColor: string;
  iconType: 'scan' | 'match' | 'notify' | 'secure';
}

const SLIDES: Slide[] = [
  {
    id: '1',
    title: 'Discover Your\nEvent Photos',
    subtitle: 'Instantly find photos of yourself across any event using advanced facial recognition technology.',
    accentColor: '#0A84FF',
    iconType: 'scan',
  },
  {
    id: '2',
    title: 'Intelligent\nPhoto Matching',
    subtitle: 'Our AI-powered system matches your face with precision, learning and improving with every interaction.',
    accentColor: '#5E5CE6',
    iconType: 'match',
  },
  {
    id: '3',
    title: 'Real-Time\nNotifications',
    subtitle: 'Receive instant alerts when photographers upload new photos featuring you.',
    accentColor: '#FF9F0A',
    iconType: 'notify',
  },
  {
    id: '4',
    title: 'Your Privacy,\nOur Priority',
    subtitle: 'Enterprise-grade encryption ensures your biometric data remains secure and under your control.',
    accentColor: '#30D158',
    iconType: 'secure',
  },
];

// Minimalist, professional icon component
const OnboardingIcon = ({ 
  type, 
  accentColor, 
  animatedValue 
}: { 
  type: string; 
  accentColor: string;
  animatedValue: Animated.Value;
}) => {
  const size = width * 0.55;
  
  const floatY = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -8],
  });

  const pulse = animatedValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.02, 1],
  });

  const renderIcon = () => {
    switch (type) {
      case 'scan':
        return (
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <Defs>
              <SvgLinearGradient id="scanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity="0.15" />
                <Stop offset="100%" stopColor={accentColor} stopOpacity="0.05" />
              </SvgLinearGradient>
            </Defs>
            
            {/* Outer glow */}
            <Circle cx="100" cy="100" r="85" fill="url(#scanGrad)" />
            
            {/* Scanner frame corners */}
            <G stroke={accentColor} strokeWidth="3" strokeLinecap="round" fill="none">
              {/* Top left */}
              <Path d="M 40 60 L 40 40 L 60 40" />
              {/* Top right */}
              <Path d="M 140 40 L 160 40 L 160 60" />
              {/* Bottom left */}
              <Path d="M 40 140 L 40 160 L 60 160" />
              {/* Bottom right */}
              <Path d="M 140 160 L 160 160 L 160 140" />
            </G>
            
            {/* Face silhouette */}
            <Ellipse cx="100" cy="95" rx="28" ry="35" fill={accentColor} opacity="0.2" />
            <Ellipse cx="100" cy="95" rx="24" ry="30" fill={accentColor} opacity="0.3" />
            
            {/* Scanning line */}
            <Rect x="45" y="98" width="110" height="2" rx="1" fill={accentColor} opacity="0.6" />
            
            {/* Data points */}
            <G fill={accentColor} opacity="0.5">
              <Circle cx="75" cy="85" r="3" />
              <Circle cx="125" cy="85" r="3" />
              <Circle cx="100" cy="115" r="3" />
            </G>
          </Svg>
        );

      case 'match':
        return (
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <Defs>
              <SvgLinearGradient id="matchGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity="0.15" />
                <Stop offset="100%" stopColor={accentColor} stopOpacity="0.05" />
              </SvgLinearGradient>
            </Defs>
            
            {/* Background circle */}
            <Circle cx="100" cy="100" r="85" fill="url(#matchGrad)" />
            
            {/* Connection nodes */}
            <G>
              {/* Center node */}
              <Circle cx="100" cy="100" r="20" fill={accentColor} opacity="0.25" />
              <Circle cx="100" cy="100" r="12" fill={accentColor} opacity="0.4" />
              
              {/* Outer nodes */}
              <Circle cx="55" cy="65" r="10" fill={accentColor} opacity="0.3" />
              <Circle cx="145" cy="65" r="10" fill={accentColor} opacity="0.3" />
              <Circle cx="55" cy="135" r="10" fill={accentColor} opacity="0.3" />
              <Circle cx="145" cy="135" r="10" fill={accentColor} opacity="0.3" />
              <Circle cx="100" cy="45" r="8" fill={accentColor} opacity="0.25" />
              <Circle cx="100" cy="155" r="8" fill={accentColor} opacity="0.25" />
              
              {/* Connection lines */}
              <G stroke={accentColor} strokeWidth="1.5" opacity="0.2">
                <Path d="M 65 70 L 90 95" />
                <Path d="M 135 70 L 110 95" />
                <Path d="M 65 130 L 90 105" />
                <Path d="M 135 130 L 110 105" />
                <Path d="M 100 55 L 100 88" />
                <Path d="M 100 145 L 100 112" />
              </G>
            </G>
            
            {/* Match indicator */}
            <Path 
              d="M 88 100 L 96 108 L 115 89" 
              stroke={accentColor} 
              strokeWidth="3" 
              fill="none" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              opacity="0.6"
            />
          </Svg>
        );

      case 'notify':
        return (
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <Defs>
              <SvgLinearGradient id="notifyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity="0.15" />
                <Stop offset="100%" stopColor={accentColor} stopOpacity="0.05" />
              </SvgLinearGradient>
            </Defs>
            
            {/* Background */}
            <Circle cx="100" cy="100" r="85" fill="url(#notifyGrad)" />
            
            {/* Bell shape */}
            <G opacity="0.35">
              <Path 
                d="M 100 50 C 75 50 60 70 60 95 L 60 115 L 50 130 L 150 130 L 140 115 L 140 95 C 140 70 125 50 100 50 Z" 
                fill={accentColor}
              />
              <Circle cx="100" cy="145" r="10" fill={accentColor} />
            </G>
            
            {/* Signal waves */}
            <G stroke={accentColor} strokeWidth="2" fill="none" opacity="0.25" strokeLinecap="round">
              <Path d="M 150 75 Q 165 100 150 125" />
              <Path d="M 160 65 Q 180 100 160 135" />
              <Path d="M 50 75 Q 35 100 50 125" />
              <Path d="M 40 65 Q 20 100 40 135" />
            </G>
            
            {/* New indicator */}
            <Circle cx="130" cy="60" r="12" fill={accentColor} opacity="0.4" />
            <Circle cx="130" cy="60" r="6" fill={accentColor} opacity="0.6" />
          </Svg>
        );

      case 'secure':
        return (
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <Defs>
              <SvgLinearGradient id="secureGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <Stop offset="0%" stopColor={accentColor} stopOpacity="0.15" />
                <Stop offset="100%" stopColor={accentColor} stopOpacity="0.05" />
              </SvgLinearGradient>
            </Defs>
            
            {/* Background */}
            <Circle cx="100" cy="100" r="85" fill="url(#secureGrad)" />
            
            {/* Shield */}
            <Path 
              d="M 100 40 L 150 60 L 150 110 Q 150 145 100 165 Q 50 145 50 110 L 50 60 Z" 
              fill={accentColor}
              opacity="0.25"
            />
            <Path 
              d="M 100 50 L 140 67 L 140 107 Q 140 137 100 155 Q 60 137 60 107 L 60 67 Z" 
              fill={accentColor}
              opacity="0.15"
            />
            
            {/* Checkmark */}
            <Path 
              d="M 80 105 L 95 120 L 125 85" 
              stroke={accentColor}
              strokeWidth="4" 
              fill="none" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              opacity="0.5"
            />
            
            {/* Lock icon */}
            <G transform="translate(85, 75)" opacity="0.3">
              <Rect x="0" y="12" width="30" height="22" rx="4" fill={accentColor} />
              <Path 
                d="M 8 12 L 8 8 Q 8 0 15 0 Q 22 0 22 8 L 22 12" 
                stroke={accentColor} 
                strokeWidth="3" 
                fill="none"
              />
            </G>
          </Svg>
        );

      default:
        return null;
    }
  };

  return (
    <Animated.View
      style={{
        transform: [
          { translateY: floatY },
          { scale: pulse },
        ],
      }}
    >
      {renderIcon()}
    </Animated.View>
  );
};

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useMemo(() => new Animated.Value(0), []);
  const floatAnim = useMemo(() => new Animated.Value(0), []);
  const autoScrollTimer = useRef<ReturnType<typeof setInterval>>();

  // Smooth floating animation
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [floatAnim]);

  // Auto-advance slides
  useEffect(() => {
    autoScrollTimer.current = setInterval(() => {
      const nextIndex = (activeIndex + 1) % SLIDES.length;
      flatListRef.current?.scrollToIndex({ 
        index: nextIndex, 
        animated: true,
      });
    }, 5000);

    return () => {
      if (autoScrollTimer.current) {
        clearInterval(autoScrollTimer.current);
      }
    };
  }, [activeIndex]);

  const handleScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: false }
  );

  const handleMomentumScrollEnd = useCallback((e: any) => {
    const index = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(index);
  }, []);

  const handleScrollBeginDrag = useCallback(() => {
    if (autoScrollTimer.current) {
      clearInterval(autoScrollTimer.current);
    }
  }, []);

  const handleScrollEndDrag = useCallback(() => {
    autoScrollTimer.current = setInterval(() => {
      const nextIndex = (activeIndex + 1) % SLIDES.length;
      flatListRef.current?.scrollToIndex({ 
        index: nextIndex, 
        animated: true,
      });
    }, 5000);
  }, [activeIndex]);

  const renderSlide = useCallback(({ item, index }: { item: Slide; index: number }) => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    
    const opacity = scrollX.interpolate({
      inputRange,
      outputRange: [0, 1, 0],
      extrapolate: 'clamp',
    });

    const translateY = scrollX.interpolate({
      inputRange,
      outputRange: [30, 0, 30],
      extrapolate: 'clamp',
    });

    const iconScale = scrollX.interpolate({
      inputRange,
      outputRange: [0.8, 1, 0.8],
      extrapolate: 'clamp',
    });

    const iconOpacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.3, 1, 0.3],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.slide}>
        {/* Subtle gradient background */}
        <View style={StyleSheet.absoluteFill}>
          <LinearGradient
            colors={['#FFFFFF', '#F8FAFC', '#F1F5F9']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
          />
        </View>

        {/* Accent color glow at top */}
        <View style={styles.accentGlow}>
          <LinearGradient
            colors={[item.accentColor + '15', item.accentColor + '00']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </View>

        {/* Icon */}
        <Animated.View 
          style={[
            styles.iconContainer,
            {
              opacity: iconOpacity,
              transform: [{ scale: iconScale }],
            }
          ]}
        >
          <OnboardingIcon 
            type={item.iconType} 
            accentColor={item.accentColor}
            animatedValue={floatAnim}
          />
        </Animated.View>
        
        {/* Content */}
        <Animated.View 
          style={[
            styles.contentContainer,
            {
              opacity,
              transform: [{ translateY }],
            }
          ]}
        >
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.subtitle}>{item.subtitle}</Text>
        </Animated.View>
      </View>
    );
  }, [scrollX, floatAnim]);

  const renderIndicator = useCallback((index: number) => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];
    
    const indicatorWidth = scrollX.interpolate({
      inputRange,
      outputRange: [8, 28, 8],
      extrapolate: 'clamp',
    });

    const indicatorOpacity = scrollX.interpolate({
      inputRange,
      outputRange: [0.3, 1, 0.3],
      extrapolate: 'clamp',
    });

    return (
      <Pressable
        key={index}
        onPress={() => {
          flatListRef.current?.scrollToIndex({ index, animated: true });
          setActiveIndex(index);
        }}
        hitSlop={{ top: 12, bottom: 12, left: 6, right: 6 }}
      >
        <Animated.View
          style={[
            styles.indicator,
            {
              width: indicatorWidth,
              opacity: indicatorOpacity,
              backgroundColor: SLIDES[activeIndex]?.accentColor || PALETTE.primary,
            },
          ]}
        />
      </Pressable>
    );
  }, [scrollX, activeIndex]);

  const handleGetStarted = useCallback(() => {
    router.push('/(auth)/register' as any);
  }, [router]);

  const handleSignIn = useCallback(() => {
    router.push('/(auth)/login' as any);
  }, [router]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      
      {/* Logo area */}
      <View style={[styles.logoArea, { paddingTop: insets.top + 20 }]}>
        <View style={styles.logoContainer}>
          <View style={[styles.logoIcon, { backgroundColor: PALETTE.primary }]}>
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Circle cx="12" cy="10" r="4" fill="white" />
              <Path d="M 6 18 Q 12 14 18 18" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round" />
            </Svg>
          </View>
          <Text style={styles.logoText}>Ferchr</Text>
        </View>
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
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollEndDrag={handleScrollEndDrag}
          scrollEventThrottle={16}
          decelerationRate="fast"
          snapToInterval={width}
          snapToAlignment="center"
          getItemLayout={(_, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
        />
      </View>

      {/* Bottom section */}
      <View style={[styles.bottomSection, { paddingBottom: insets.bottom + 24 }]}>
        {/* Indicators */}
        <View style={styles.indicators}>
          {SLIDES.map((_, index) => renderIndicator(index))}
        </View>

        {/* Get Started button */}
        <Pressable
          onPress={handleGetStarted}
          style={({ pressed }) => [
            styles.primaryButton,
            { backgroundColor: SLIDES[activeIndex]?.accentColor || PALETTE.primary },
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
          <ArrowRight size={20} color="#FFFFFF" />
        </Pressable>

        {/* Sign in link */}
        <Pressable onPress={handleSignIn} style={styles.signInButton}>
          <Text style={styles.signInText}>Already have an account?</Text>
          <Text style={styles.signInLink}> Sign In</Text>
          <ChevronRight size={16} color={PALETTE.primary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  logoArea: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 22,
    fontWeight: '700',
    color: PALETTE.text,
    letterSpacing: -0.5,
  },
  slidesContainer: {
    flex: 1,
  },
  slide: {
    width: width,
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  accentGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: height * 0.4,
  },
  iconContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -spacing.xl,
  },
  contentContainer: {
    paddingBottom: spacing.xl,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: PALETTE.text,
    letterSpacing: -1,
    lineHeight: 44,
    marginBottom: spacing.md,
  },
  subtitle: {
    fontSize: 17,
    color: PALETTE.textSecondary,
    lineHeight: 26,
    letterSpacing: -0.2,
  },
  bottomSection: {
    paddingHorizontal: spacing.lg,
    backgroundColor: '#FFFFFF',
  },
  indicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: spacing.xl,
  },
  indicator: {
    height: 6,
    borderRadius: 3,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 14,
    marginBottom: spacing.md,
  },
  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  signInText: {
    fontSize: 15,
    color: PALETTE.textSecondary,
  },
  signInLink: {
    fontSize: 15,
    fontWeight: '600',
    color: PALETTE.primary,
  },
});
