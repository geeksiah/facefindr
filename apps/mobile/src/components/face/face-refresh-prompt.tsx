import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';

import { useAuthStore } from '@/stores/auth-store';
import { getApiBaseUrl } from '@/lib/api-base';

interface RefreshStatus {
  needsRefresh: boolean;
  reason: string | null;
  promptStrength: 'required' | 'strong' | 'soft' | 'none';
  confidenceAverage: number;
  daysSinceRefresh: number;
  nextDueDate: string | null;
  pendingPrompt: {
    id: string;
    prompt_type: string;
    trigger_reason: string;
  } | null;
  embeddingCount: number;
}

interface FaceRefreshPromptProps {
  onRefresh?: () => void;
  onDismiss?: () => void;
  inline?: boolean;
}

const APPEARANCE_CHANGES = [
  { value: 'new_hairstyle', label: 'New hairstyle', icon: 'cut-outline' },
  { value: 'facial_hair', label: 'Facial hair change', icon: 'man-outline' },
  { value: 'new_glasses', label: 'New glasses', icon: 'glasses-outline' },
  { value: 'weight_change', label: 'Weight change', icon: 'fitness-outline' },
  { value: 'aging', label: 'General aging', icon: 'time-outline' },
  { value: 'other', label: 'Other change', icon: 'ellipsis-horizontal-outline' },
] as const;

export function FaceRefreshPrompt({ onRefresh, onDismiss, inline = false }: FaceRefreshPromptProps) {
  const [status, setStatus] = useState<RefreshStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showChangeOptions, setShowChangeOptions] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const { session } = useAuthStore();

  useEffect(() => {
    if (session) {
      checkRefreshStatus();
    }
  }, [session]);

  const checkRefreshStatus = async () => {
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/faces/refresh-status`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        
        if (data.needsRefresh && ['required', 'strong'].includes(data.promptStrength)) {
          setShowModal(true);
        }
      }
    } catch (error) {
      console.error('Failed to check refresh status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResponse = async (response: 'these_are_me' | 'not_me' | 'dismissed') => {
    if (!status?.pendingPrompt) return;
    
    setIsResponding(true);
    try {
      await fetch(`${getApiBaseUrl()}/api/faces/refresh`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          promptId: status.pendingPrompt.id,
          response,
        }),
      });
      
      setShowModal(false);
      onDismiss?.();
      await checkRefreshStatus();
    } catch (error) {
      console.error('Failed to respond:', error);
    } finally {
      setIsResponding(false);
    }
  };

  const handleAppearanceChange = async (changeType: string) => {
    try {
      await fetch(`${getApiBaseUrl()}/api/faces/appearance-change`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          changeType,
          changeMode: 'add_to_profile',
        }),
      });
      
      setShowChangeOptions(false);
      setShowModal(false);
      onRefresh?.();
      router.push('/face-scan');
    } catch (error) {
      console.error('Failed to log appearance change:', error);
    }
  };

  const handleUpdatePhoto = () => {
    setShowModal(false);
    onRefresh?.();
    router.push('/face-scan');
  };

  if (isLoading || !status?.needsRefresh) {
    return null;
  }

  const getPromptContent = () => {
    switch (status.reason) {
      case 'confidence_low':
        return {
          icon: 'alert-circle-outline' as const,
          iconColor: '#F59E0B',
          title: 'Update Your Photo',
          description: `Your photo matching accuracy has dropped to ${status.confidenceAverage.toFixed(0)}%. Update your profile photo for better results.`,
          bgColors: ['#FEF3C7', '#FDE68A'] as const,
        };
      case 'time_based':
        return {
          icon: 'refresh-outline' as const,
          iconColor: '#3B82F6',
          title: 'Time for a Photo Update',
          description: `It's been ${status.daysSinceRefresh} days since your last update. A new photo will help maintain accurate matching.`,
          bgColors: ['#DBEAFE', '#BFDBFE'] as const,
        };
      default:
        return {
          icon: 'camera-outline' as const,
          iconColor: '#8B5CF6',
          title: 'Update Your Photo',
          description: 'Keep your profile photo up to date for the best photo matching experience.',
          bgColors: ['#EDE9FE', '#DDD6FE'] as const,
        };
    }
  };

  const content = getPromptContent();

  // Inline banner version
  if (inline) {
    return (
      <LinearGradient
        colors={content.bgColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.inlineBanner}
      >
        <View style={styles.inlineContent}>
          <View style={styles.inlineIcon}>
            <Ionicons name={content.icon} size={24} color={content.iconColor} />
          </View>
          <View style={styles.inlineText}>
            <Text style={styles.inlineTitle}>{content.title}</Text>
            <Text style={styles.inlineDescription} numberOfLines={2}>
              {content.description}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.inlineButton}
            onPress={handleUpdatePhoto}
          >
            <Ionicons name="camera" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>
    );
  }

  // Modal version
  return (
    <Modal
      visible={showModal}
      transparent
      animationType="fade"
      onRequestClose={() => status.promptStrength !== 'required' && setShowModal(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={[styles.modalIcon, { backgroundColor: content.bgColors[0] }]}>
              <Ionicons name={content.icon} size={32} color={content.iconColor} />
            </View>
            <Text style={styles.modalTitle}>{content.title}</Text>
            <Text style={styles.modalDescription}>{content.description}</Text>
          </View>

          {/* Confidence Bar */}
          <View style={styles.confidenceContainer}>
            <View style={styles.confidenceHeader}>
              <Text style={styles.confidenceLabel}>Match Confidence</Text>
              <Text style={[
                styles.confidenceValue,
                { color: status.confidenceAverage >= 75 ? '#10B981' : '#F59E0B' }
              ]}>
                {status.confidenceAverage.toFixed(0)}%
              </Text>
            </View>
            <View style={styles.confidenceTrack}>
              <View 
                style={[
                  styles.confidenceFill,
                  { 
                    width: `${status.confidenceAverage}%`,
                    backgroundColor: status.confidenceAverage >= 75 ? '#10B981' : '#F59E0B'
                  }
                ]} 
              />
            </View>
          </View>

          {/* Appearance Change Options */}
          {showChangeOptions ? (
            <View style={styles.changeOptions}>
              <Text style={styles.changeTitle}>What changed?</Text>
              {APPEARANCE_CHANGES.map((change) => (
                <TouchableOpacity
                  key={change.value}
                  style={styles.changeOption}
                  onPress={() => handleAppearanceChange(change.value)}
                >
                  <Ionicons name={change.icon as any} size={20} color="#6B7280" />
                  <Text style={styles.changeLabel}>{change.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setShowChangeOptions(false)}
              >
                <Text style={styles.backButtonText}>Back</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={handleUpdatePhoto}
                >
                  <Ionicons name="camera" size={20} color="#fff" />
                  <Text style={styles.primaryButtonText}>Update Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => setShowChangeOptions(true)}
                >
                  <Ionicons name="body-outline" size={20} color="#6B7280" />
                  <Text style={styles.secondaryButtonText}>My Appearance Changed</Text>
                </TouchableOpacity>

                {status.pendingPrompt && (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => handleResponse('these_are_me')}
                    disabled={isResponding}
                  >
                    <Ionicons name="checkmark-circle-outline" size={20} color="#6B7280" />
                    <Text style={styles.secondaryButtonText}>Photos Look Correct</Text>
                  </TouchableOpacity>
                )}

                {status.promptStrength !== 'required' && (
                  <TouchableOpacity
                    style={styles.dismissButton}
                    onPress={() => handleResponse('dismissed')}
                    disabled={isResponding}
                  >
                    <Text style={styles.dismissButtonText}>Remind Me Later</Text>
                  </TouchableOpacity>
                )}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Inline banner styles
  inlineBanner: {
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    overflow: 'hidden',
  },
  inlineContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  inlineIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineText: {
    flex: 1,
    marginLeft: 12,
  },
  inlineTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  inlineDescription: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 2,
  },
  inlineButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#8B5CF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 400,
    padding: 24,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // Confidence bar
  confidenceContainer: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  confidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  confidenceLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  confidenceValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  confidenceTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 4,
  },

  // Actions
  actions: {
    gap: 12,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },
  dismissButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  dismissButtonText: {
    fontSize: 14,
    color: '#9CA3AF',
  },

  // Change options
  changeOptions: {
    gap: 8,
  },
  changeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4B5563',
    marginBottom: 8,
  },
  changeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
  },
  changeLabel: {
    fontSize: 14,
    color: '#4B5563',
  },
  backButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 8,
  },
  backButtonText: {
    fontSize: 14,
    color: '#8B5CF6',
    fontWeight: '500',
  },
});
