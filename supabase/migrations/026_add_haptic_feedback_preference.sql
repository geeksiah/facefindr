-- Migration: 026_add_haptic_feedback_preference
-- Description: Add haptic feedback preference to user notification preferences

-- Add haptic_feedback_enabled column to user_notification_preferences
ALTER TABLE user_notification_preferences
    ADD COLUMN IF NOT EXISTS haptic_feedback_enabled BOOLEAN DEFAULT TRUE;

-- Update existing records to have haptic feedback enabled by default
UPDATE user_notification_preferences
SET haptic_feedback_enabled = TRUE
WHERE haptic_feedback_enabled IS NULL;
