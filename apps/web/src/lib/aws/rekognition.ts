import {
  RekognitionClient,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  IndexFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
  DetectFacesCommand,
  type FaceRecord,
  type FaceMatch,
  type BoundingBox,
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
export const ATTENDEE_COLLECTION_ID = 'facefindr-attendees';

// Collection naming convention: facefindr-event-{eventId}
const getCollectionId = (eventId: string) => `facefindr-event-${eventId}`;

// ============================================
// COLLECTION MANAGEMENT
// ============================================

/**
 * Create a face collection for an event
 * Called when face recognition is enabled for an event
 */
export async function createEventCollection(eventId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const collectionId = getCollectionId(eventId);
    
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
    const collectionId = getCollectionId(eventId);
    
    await rekognitionClient.send(
      new DeleteCollectionCommand({
        CollectionId: collectionId,
      })
    );

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
    const collectionId = getCollectionId(eventId);

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
    const collectionId = getCollectionId(eventId);

    const response = await rekognitionClient.send(
      new SearchFacesByImageCommand({
        CollectionId: collectionId,
        Image: { Bytes: imageBytes },
        MaxFaces: maxResults,
        FaceMatchThreshold: similarityThreshold,
      })
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
    const collectionId = getCollectionId(eventId);

    await rekognitionClient.send(
      new DeleteFacesCommand({
        CollectionId: collectionId,
        FaceIds: faceIds,
      })
    );

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
