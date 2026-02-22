/**
 * Drop-In Face Matching Utilities
 * 
 * Specialized functions for matching drop-in photos against all attendees
 */

import {
  SearchFacesByImageCommand,
  CreateCollectionCommand,
  IndexFacesCommand,
} from '@aws-sdk/client-rekognition';

import { rekognitionClient, ATTENDEE_COLLECTION_ID, LEGACY_ATTENDEE_COLLECTION_ID } from './rekognition';

/**
 * Ensure global attendee collection exists
 */
export async function ensureAttendeeCollection(): Promise<{
  success: boolean;
  error?: string;
  errorName?: string;
}> {
  try {
    await rekognitionClient.send(
      new CreateCollectionCommand({
        CollectionId: ATTENDEE_COLLECTION_ID,
      })
    );
    return { success: true };
  } catch (error: any) {
    if (error.name === 'ResourceAlreadyExistsException') {
      return { success: true };
    }
    console.error('Error creating attendee collection:', error);
    return { success: false, error: error.message, errorName: error?.name };
  }
}

/**
 * Index an attendee's face into the global collection
 * Called when attendee creates their FaceTag
 */
export async function indexAttendeeFace(
  attendeeId: string,
  rekognitionFaceId: string,
  imageBytes: Uint8Array
): Promise<{ success: boolean; error?: string }> {
  try {
    await ensureAttendeeCollection();

    const response = await rekognitionClient.send(
      new IndexFacesCommand({
        CollectionId: ATTENDEE_COLLECTION_ID,
        Image: { Bytes: imageBytes },
        ExternalImageId: rekognitionFaceId, // Use rekognition_face_id as external ID
        DetectionAttributes: ['DEFAULT'],
        MaxFaces: 1,
        QualityFilter: 'AUTO',
      })
    );

    if (response.FaceRecords && response.FaceRecords.length > 0) {
      return { success: true };
    }

    return { success: false, error: 'No face detected' };
  } catch (error: any) {
    console.error('Error indexing attendee face:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Search for matches in drop-in photo against all attendees
 */
export async function searchDropInFaces(
  imageBytes: Uint8Array,
  similarityThreshold: number = 85
): Promise<{
  matches: Array<{
    rekognitionFaceId: string;
    similarity: number;
    boundingBox: any;
  }>;
  error?: string;
}> {
  try {
    await ensureAttendeeCollection();

    const primaryResponse = await rekognitionClient.send(
      new SearchFacesByImageCommand({
        CollectionId: ATTENDEE_COLLECTION_ID,
        Image: { Bytes: imageBytes },
        MaxFaces: 100,
        FaceMatchThreshold: similarityThreshold,
      })
    );

    const primaryMatches = (primaryResponse.FaceMatches || []).map((match) => ({
      rekognitionFaceId: match.Face?.FaceId || '',
      similarity: match.Similarity || 0,
      boundingBox: match.Face?.BoundingBox,
    }));

    if (primaryMatches.length > 0) {
      return { matches: primaryMatches };
    }

    try {
      const legacyResponse = await rekognitionClient.send(
        new SearchFacesByImageCommand({
          CollectionId: LEGACY_ATTENDEE_COLLECTION_ID,
          Image: { Bytes: imageBytes },
          MaxFaces: 100,
          FaceMatchThreshold: similarityThreshold,
        })
      );

      const legacyMatches = (legacyResponse.FaceMatches || []).map((match) => ({
        rekognitionFaceId: match.Face?.FaceId || '',
        similarity: match.Similarity || 0,
        boundingBox: match.Face?.BoundingBox,
      }));

      return { matches: legacyMatches };
    } catch (legacyError: any) {
      if (legacyError.name === 'ResourceNotFoundException') {
        return { matches: primaryMatches };
      }
      throw legacyError;
    }
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException') {
      // Collection doesn't exist yet - no attendees indexed
      return { matches: [] };
    }
    if (error.name === 'InvalidParameterException' && error.message?.includes('no faces')) {
      return { matches: [], error: 'No face detected in the provided image' };
    }
    
    console.error('Error searching drop-in faces:', error);
    return { matches: [], error: error.message };
  }
}
