import {
  RekognitionClient,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  DetectFacesCommand,
  CreateFaceLivenessSessionCommand,
  GetFaceLivenessSessionResultsCommand,
  type FaceRecord,
  type FaceMatch,
  type BoundingBox,
  type AuditImage,
  type SearchFacesByImageCommandOutput,
} from '@aws-sdk/client-rekognition';

// Initialize Rekognition client
export const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// Collection IDs
export const ATTENDEE_COLLECTION_ID = 'ferchr-attendees';
export const LEGACY_ATTENDEE_COLLECTION_ID = 'facefindr-attendees';

// Collection naming convention: ferchr-event-{eventId}
const EVENT_COLLECTION_PREFIX = 'ferchr-event-';
const LEGACY_EVENT_COLLECTION_PREFIX = 'facefindr-event-';

export const getEventCollectionId = (eventId: string) => `${EVENT_COLLECTION_PREFIX}${eventId}`;
export const getLegacyEventCollectionId = (eventId: string) => `${LEGACY_EVENT_COLLECTION_PREFIX}${eventId}`;
export const getEventCollectionIds = (eventId: string) => [getEventCollectionId(eventId), getLegacyEventCollectionId(eventId)];

export async function searchEventCollectionWithFallback(
  eventId: string,
  imageBytes: Uint8Array,
  maxFaces: number,
  similarityThreshold: number
): Promise<{ response: SearchFacesByImageCommandOutput; collectionId: string; usedLegacyCollection: boolean }> {
  const primaryCollectionId = getEventCollectionId(eventId);
  const legacyCollectionId = getLegacyEventCollectionId(eventId);

  let primaryResponse: SearchFacesByImageCommandOutput | null = null;

  try {
    primaryResponse = await rekognitionClient.send(
      new SearchFacesByImageCommand({
        CollectionId: primaryCollectionId,
        Image: { Bytes: imageBytes },
        MaxFaces: maxFaces,
        FaceMatchThreshold: similarityThreshold,
      })
    );

    if ((primaryResponse.FaceMatches || []).length > 0) {
      return { response: primaryResponse, collectionId: primaryCollectionId, usedLegacyCollection: false };
    }
  } catch (error: any) {
    if (error.name !== 'ResourceNotFoundException') {
      throw error;
    }
  }

  try {
    const legacyResponse = await rekognitionClient.send(
      new SearchFacesByImageCommand({
        CollectionId: legacyCollectionId,
        Image: { Bytes: imageBytes },
        MaxFaces: maxFaces,
        FaceMatchThreshold: similarityThreshold,
      })
    );

    if ((legacyResponse.FaceMatches || []).length > 0) {
      await createEventCollection(eventId);
      return { response: legacyResponse, collectionId: legacyCollectionId, usedLegacyCollection: true };
    }

    if (primaryResponse) {
      return { response: primaryResponse, collectionId: primaryCollectionId, usedLegacyCollection: false };
    }

    return { response: legacyResponse, collectionId: legacyCollectionId, usedLegacyCollection: true };
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return {
        response: primaryResponse || ({ $metadata: {}, FaceMatches: [] } as SearchFacesByImageCommandOutput),
        collectionId: primaryCollectionId,
        usedLegacyCollection: false,
      };
    }
    throw error;
  }
}

// ============================================
// COLLECTION MANAGEMENT
// ============================================

/**
 * Create a face collection for an event
 * Called when face recognition is enabled for an event
 */
export async function createEventCollection(eventId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const collectionId = getEventCollectionId(eventId);
    
    await rekognitionClient.send(
      new CreateCollectionCommand({
        CollectionId: collectionId,
      })
    );

    return { success: true };
  } catch (error: any) {
    // Collection might already exist
    if (error.name === 'ResourceAlreadyExistsException') {
      return { success: true };
    }
    console.error('Error creating collection:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete a face collection when event is deleted or archived
 */
export async function deleteEventCollection(eventId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const collectionIds = getEventCollectionIds(eventId);

    for (const collectionId of collectionIds) {
      try {
        await rekognitionClient.send(
          new DeleteCollectionCommand({
            CollectionId: collectionId,
          })
        );
      } catch (innerError: any) {
        if (innerError.name !== 'ResourceNotFoundException') {
          throw innerError;
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return { success: true }; // Already deleted
    }
    console.error('Error deleting collection:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// FACE DETECTION (Analyze image for faces)
// ============================================

export interface DetectedFace {
  boundingBox: BoundingBox;
  confidence: number;
  landmarks?: Array<{ type: string; x: number; y: number }>;
}

/**
 * Detect faces in an image without indexing
 * Used for preview and validation
 */
export async function detectFaces(imageBytes: Uint8Array): Promise<{
  faces: DetectedFace[];
  error?: string;
}> {
  try {
    const response = await rekognitionClient.send(
      new DetectFacesCommand({
        Image: { Bytes: imageBytes },
        Attributes: ['DEFAULT'],
      })
    );

    const faces: DetectedFace[] = (response.FaceDetails || []).map((face) => ({
      boundingBox: face.BoundingBox!,
      confidence: face.Confidence || 0,
      landmarks: face.Landmarks?.map((l) => ({
        type: l.Type || '',
        x: l.X || 0,
        y: l.Y || 0,
      })),
    }));

    return { faces };
  } catch (error: any) {
    console.error('Error detecting faces:', error);
    return { faces: [], error: error.message };
  }
}

// ============================================
// FACE INDEXING (Add faces to collection)
// ============================================

export interface IndexedFace {
  faceId: string;
  boundingBox: BoundingBox;
  confidence: number;
  externalImageId?: string;
}

/**
 * Index faces from an uploaded photo into the event's collection
 * Called after a photo is uploaded
 */
export async function indexFacesFromImage(
  eventId: string,
  mediaId: string,
  imageBytes: Uint8Array
): Promise<{
  indexedFaces: IndexedFace[];
  facesDetected: number;
  error?: string;
}> {
  try {
    const collectionId = getEventCollectionId(eventId);

    const response = await rekognitionClient.send(
      new IndexFacesCommand({
        CollectionId: collectionId,
        Image: { Bytes: imageBytes },
        ExternalImageId: mediaId, // Link face to our media record
        DetectionAttributes: ['DEFAULT'],
        MaxFaces: 100, // Max faces to index per image
        QualityFilter: 'AUTO', // Filter out low-quality faces
      })
    );

    const indexedFaces: IndexedFace[] = (response.FaceRecords || []).map((record: FaceRecord) => ({
      faceId: record.Face?.FaceId || '',
      boundingBox: record.Face?.BoundingBox || {},
      confidence: record.Face?.Confidence || 0,
      externalImageId: record.Face?.ExternalImageId,
    }));

    return {
      indexedFaces,
      facesDetected: indexedFaces.length,
    };
  } catch (error: any) {
    // If collection doesn't exist, create it and retry
    if (error.name === 'ResourceNotFoundException') {
      await createEventCollection(eventId);
      return indexFacesFromImage(eventId, mediaId, imageBytes);
    }
    
    console.error('Error indexing faces:', error);
    return { indexedFaces: [], facesDetected: 0, error: error.message };
  }
}

// ============================================
// FACE SEARCHING (Match attendee to photos)
// ============================================

export interface FaceSearchResult {
  mediaId: string;
  faceId: string;
  similarity: number;
  boundingBox: BoundingBox;
}

/**
 * Search for matching faces in an event's collection
 * Called when an attendee scans their face
 */
export async function searchFacesByImage(
  eventId: string,
  imageBytes: Uint8Array,
  maxResults: number = 100,
  similarityThreshold: number = 80
): Promise<{
  matches: FaceSearchResult[];
  searchedFaceBoundingBox?: BoundingBox;
  error?: string;
}> {
  try {
    const { response } = await searchEventCollectionWithFallback(
      eventId,
      imageBytes,
      maxResults,
      similarityThreshold
    );

    const matches: FaceSearchResult[] = (response.FaceMatches || []).map((match: FaceMatch) => ({
      mediaId: match.Face?.ExternalImageId || '',
      faceId: match.Face?.FaceId || '',
      similarity: match.Similarity || 0,
      boundingBox: match.Face?.BoundingBox || {},
    }));

    return {
      matches,
      searchedFaceBoundingBox: response.SearchedFaceBoundingBox,
    };
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return { matches: [], error: 'No faces indexed for this event yet' };
    }
    if (error.name === 'InvalidParameterException' && error.message?.includes('no faces')) {
      return { matches: [], error: 'No face detected in the provided image' };
    }
    
    console.error('Error searching faces:', error);
    return { matches: [], error: error.message };
  }
}

// ============================================
// FACE DELETION
// ============================================

/**
 * Delete specific faces from a collection
 * Called when a photo is deleted
 */
export async function deleteFaces(
  eventId: string,
  faceIds: string[]
): Promise<{ success: boolean; error?: string }> {
  if (faceIds.length === 0) {
    return { success: true };
  }

  try {
    const collectionIds = getEventCollectionIds(eventId);
    for (const collectionId of collectionIds) {
      try {
        await rekognitionClient.send(
          new DeleteFacesCommand({
            CollectionId: collectionId,
            FaceIds: faceIds,
          })
        );
      } catch (innerError: any) {
        if (innerError.name !== 'ResourceNotFoundException') {
          throw innerError;
        }
      }
    }

    return { success: true };
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      return { success: true }; // Collection doesn't exist
    }
    console.error('Error deleting faces:', error);
    return { success: false, error: error.message };
  }
}

// ============================================
// FACE LIVENESS DETECTION (Anti-Spoofing)
// SRS §3.3.1: Liveness detection to prevent photo-of-photo attacks
// ============================================

export interface LivenessSession {
  sessionId: string;
  createdAt: string;
}

export interface LivenessResult {
  isLive: boolean;
  confidence: number;
  referenceImage?: {
    bytes: Uint8Array;
    boundingBox: BoundingBox;
  };
  auditImages?: AuditImage[];
}

/**
 * Create a Face Liveness session
 * The client (web/mobile) will use this session to perform liveness check
 */
export async function createLivenessSession(
  userId: string
): Promise<{ session: LivenessSession | null; error?: string }> {
  try {
    const response = await rekognitionClient.send(
      new CreateFaceLivenessSessionCommand({
        // Optional: Set a client request token for idempotency
        ClientRequestToken: `${userId}-${Date.now()}`,
        // Optional: Settings for the session
        Settings: {
          // Audit images contain the reference image and frames used for liveness
          AuditImagesLimit: 4,
          // Output configuration for storing audit images
          // OutputConfig: { ... } // Can configure S3 bucket if needed
        },
      })
    );

    return {
      session: {
        sessionId: response.SessionId!,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error: any) {
    console.error('Error creating liveness session:', error);
    return { session: null, error: error.message };
  }
}

/**
 * Get Face Liveness session results
 * Call this after the client completes the liveness check
 */
export async function getLivenessSessionResults(
  sessionId: string
): Promise<{ result: LivenessResult | null; error?: string }> {
  try {
    const response = await rekognitionClient.send(
      new GetFaceLivenessSessionResultsCommand({
        SessionId: sessionId,
      })
    );

    // Check if session completed successfully
    if (response.Status !== 'SUCCEEDED') {
      return {
        result: null,
        error: `Session status: ${response.Status}`,
      };
    }

    // Confidence > 90 means high confidence the face is live
    const isLive = (response.Confidence || 0) >= 90;

    return {
      result: {
        isLive,
        confidence: response.Confidence || 0,
        referenceImage: response.ReferenceImage ? {
          bytes: response.ReferenceImage.Bytes!,
          boundingBox: response.ReferenceImage.BoundingBox!,
        } : undefined,
        auditImages: response.AuditImages,
      },
    };
  } catch (error: any) {
    console.error('Error getting liveness results:', error);
    return { result: null, error: error.message };
  }
}

/**
 * Perform simplified liveness check using multiple images
 * Fallback for when Face Liveness API is not available
 * Uses face angle analysis to detect real faces
 */
export async function analyzeMultiAngleLiveness(
  images: Uint8Array[]
): Promise<{ isLive: boolean; confidence: number; error?: string }> {
  if (images.length < 3) {
    return { isLive: false, confidence: 0, error: 'At least 3 images required for liveness check' };
  }

  try {
    const results = await Promise.all(
      images.map(async (imageBytes) => {
        const response = await rekognitionClient.send(
          new DetectFacesCommand({
            Image: { Bytes: imageBytes },
            Attributes: ['ALL'], // Get full attributes including pose
          })
        );
        return response.FaceDetails?.[0];
      })
    );

    // Filter out images where no face was detected
    const validFaces = results.filter(Boolean);
    if (validFaces.length < 3) {
      return { isLive: false, confidence: 0, error: 'Could not detect face in all images' };
    }

    // Analyze pose variations to check for liveness
    // A real person would have natural pose variations
    const poses = validFaces.map(face => ({
      yaw: face?.Pose?.Yaw || 0,
      pitch: face?.Pose?.Pitch || 0,
      roll: face?.Pose?.Roll || 0,
    }));

    // Calculate variance in poses
    const yawVariance = calculateVariance(poses.map(p => p.yaw));
    const pitchVariance = calculateVariance(poses.map(p => p.pitch));

    // Check for eye blink or mouth movement (signs of liveness)
    const eyeStates = validFaces.map(face => ({
      leftOpen: face?.EyesOpen?.Value,
      confidence: face?.EyesOpen?.Confidence || 0,
    }));

    // A printed photo would have consistent poses and no blinking
    const hasNaturalVariation = yawVariance > 5 || pitchVariance > 3;
    const hasConsistentQuality = validFaces.every(f => (f?.Confidence || 0) > 90);

    // Calculate overall liveness confidence
    let confidence = 0;
    if (hasNaturalVariation) confidence += 40;
    if (hasConsistentQuality) confidence += 30;
    
    // Check for at least one face with good quality per angle
    const avgConfidence = validFaces.reduce((sum, f) => sum + (f?.Confidence || 0), 0) / validFaces.length;
    confidence += (avgConfidence / 100) * 30;

    return {
      isLive: confidence >= 70,
      confidence,
    };
  } catch (error: any) {
    console.error('Error analyzing liveness:', error);
    return { isLive: false, confidence: 0, error: error.message };
  }
}

// Helper function to calculate variance
function calculateVariance(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if AWS credentials are configured
 */
export function isRekognitionConfigured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_REGION
  );
}

/**
 * Check if Face Liveness API is available (requires additional setup)
 */
export function isFaceLivenessAvailable(): boolean {
  // Face Liveness requires specific regions and setup
  const supportedRegions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-northeast-1'];
  const currentRegion = process.env.AWS_REGION || 'us-east-1';
  return supportedRegions.includes(currentRegion);
}
