import { z } from 'zod';

// ============================================
// EVENT VALIDATION SCHEMAS
// ============================================

export const createEventSchema = z.object({
  name: z
    .string()
    .min(3, 'Event name must be at least 3 characters')
    .max(100, 'Event name must be less than 100 characters'),
  description: z.string().max(1000, 'Description must be less than 1000 characters').optional(),
  location: z.string().max(255, 'Location must be less than 255 characters').optional(),
  eventDate: z.string().optional(),
  eventTimezone: z.string().optional(),
  isPublic: z.boolean().default(false),
  faceRecognitionEnabled: z.boolean().default(true),
  liveModeEnabled: z.boolean().default(false),
  attendeeAccessEnabled: z.boolean().default(true),
  currency: z.enum(['USD', 'EUR', 'GBP']).default('USD'),
});

export const updateEventSchema = createEventSchema.partial();

export const eventPricingSchema = z.object({
  pricePerMedia: z.number().min(0, 'Price must be positive').default(0),
  unlockAllPrice: z.number().min(0, 'Price must be positive').optional().nullable(),
  currency: z.enum(['USD', 'EUR', 'GBP']).default('USD'),
  isFree: z.boolean().default(true),
});

// ============================================
// TYPE EXPORTS
// ============================================

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type EventPricingInput = z.infer<typeof eventPricingSchema>;
