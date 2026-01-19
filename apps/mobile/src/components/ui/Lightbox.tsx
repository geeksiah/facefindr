/**
 * Lightbox Component for Mobile
 * 
 * Full-screen photo viewer with navigation
 */

import { useState, useEffect } from 'react';
import {
  View,
  Modal,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  SafeAreaView,
  Text,
} from 'react-native';
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { colors, spacing } from '@/lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface LightboxProps {
  images: Array<{ id: string; url: string; alt?: string }>;
  initialIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export function Lightbox({ images, initialIndex = 0, isOpen, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex, isOpen]);

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  };

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        
        {/* Close button */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <X size={24} color="#fff" />
        </TouchableOpacity>

        {/* Navigation buttons */}
        {images.length > 1 && (
          <>
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonLeft]}
              onPress={goToPrevious}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <ChevronLeft size={28} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.navButton, styles.navButtonRight]}
              onPress={goToNext}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <ChevronRight size={28} color="#fff" />
            </TouchableOpacity>
          </>
        )}

        {/* Image */}
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: currentImage.url }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        {/* Image counter */}
        {images.length > 1 && (
          <View style={styles.counter}>
            <View style={styles.counterBadge}>
              <Text style={styles.counterText}>
                {currentIndex + 1} / {images.length}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  closeButton: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButton: {
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -22 }],
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonLeft: {
    left: spacing.md,
  },
  navButtonRight: {
    right: spacing.md,
  },
  imageContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  image: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  counter: {
    position: 'absolute',
    bottom: spacing.xl,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  counterBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
  },
  counterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
