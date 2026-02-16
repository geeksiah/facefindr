#!/usr/bin/env node

import {
  RekognitionClient,
  CreateCollectionCommand,
  IndexFacesCommand,
  ListCollectionsCommand,
} from '@aws-sdk/client-rekognition';
import { createClient } from '@supabase/supabase-js';

const argv = new Set(process.argv.slice(2));
const dryRun = argv.has('--dry-run');
const force = argv.has('--force');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const awsRegion = process.env.AWS_REGION || 'us-east-1';
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const mediaBucket = process.env.SUPABASE_MEDIA_BUCKET || 'media';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!awsAccessKeyId || !awsSecretAccessKey) {
  console.error('Missing AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const rekognition = new RekognitionClient({
  region: awsRegion,
  credentials: {
    accessKeyId: awsAccessKeyId,
    secretAccessKey: awsSecretAccessKey,
  },
});

const canonicalEventCollection = (eventId) => `ferchr-event-${eventId}`;
const legacyEventCollection = (eventId) => `facefindr-event-${eventId}`;

async function listAllCollections() {
  const collections = new Set();
  let nextToken;

  do {
    const response = await rekognition.send(
      new ListCollectionsCommand({ MaxResults: 100, NextToken: nextToken })
    );

    for (const collectionId of response.CollectionIds || []) {
      collections.add(collectionId);
    }

    nextToken = response.NextToken;
  } while (nextToken);

  return collections;
}

async function createCollectionIfMissing(collectionId) {
  if (dryRun) {
    console.log(`[dry-run] create collection ${collectionId}`);
    return;
  }

  try {
    await rekognition.send(new CreateCollectionCommand({ CollectionId: collectionId }));
    console.log(`Created collection ${collectionId}`);
  } catch (error) {
    if (error?.name !== 'ResourceAlreadyExistsException') {
      throw error;
    }
  }
}

async function backfillEvent(event, collections) {
  const canonical = canonicalEventCollection(event.id);
  const legacy = legacyEventCollection(event.id);
  const hasCanonical = collections.has(canonical);
  const hasLegacy = collections.has(legacy);

  if (!hasLegacy && !hasCanonical) {
    return { skipped: true, reason: 'no collections' };
  }

  if (hasCanonical && !force) {
    return { skipped: true, reason: 'canonical exists' };
  }

  if (!hasCanonical) {
    await createCollectionIfMissing(canonical);
    collections.add(canonical);
  }

  const { data: mediaRows, error: mediaError } = await supabase
    .from('media')
    .select('id, storage_path, deleted_at')
    .eq('event_id', event.id)
    .is('deleted_at', null);

  if (mediaError) {
    throw new Error(`media query failed for event ${event.id}: ${mediaError.message}`);
  }

  let indexed = 0;
  let failed = 0;

  for (const media of mediaRows || []) {
    if (!media.storage_path) {
      continue;
    }

    try {
      if (dryRun) {
        indexed += 1;
        continue;
      }

      const { data: imageBlob, error: downloadError } = await supabase.storage
        .from(mediaBucket)
        .download(media.storage_path);

      if (downloadError || !imageBlob) {
        failed += 1;
        continue;
      }

      const arrayBuffer = await imageBlob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);

      await rekognition.send(
        new IndexFacesCommand({
          CollectionId: canonical,
          Image: { Bytes: bytes },
          ExternalImageId: media.id,
          DetectionAttributes: ['DEFAULT'],
          MaxFaces: 100,
          QualityFilter: 'AUTO',
        })
      );

      indexed += 1;
    } catch {
      failed += 1;
    }
  }

  return { skipped: false, indexed, failed, mediaCount: (mediaRows || []).length, hasLegacy };
}

async function main() {
  console.log(`Starting Rekognition backfill${dryRun ? ' (dry-run)' : ''}...`);

  const collections = await listAllCollections();

  if (collections.has('facefindr-attendees') && !collections.has('ferchr-attendees')) {
    await createCollectionIfMissing('ferchr-attendees');
    collections.add('ferchr-attendees');
    console.log('Created canonical attendee collection ferchr-attendees');
    console.log('Note: attendee embedding migration still requires refresh/reindex flows per user.');
  }

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, name')
    .eq('face_recognition_enabled', true);

  if (eventsError) {
    throw new Error(`events query failed: ${eventsError.message}`);
  }

  let totalIndexed = 0;
  let totalFailed = 0;
  let processed = 0;

  for (const event of events || []) {
    const result = await backfillEvent(event, collections);

    if (result.skipped) {
      console.log(`skip ${event.id} (${event.name}): ${result.reason}`);
      continue;
    }

    processed += 1;
    totalIndexed += result.indexed || 0;
    totalFailed += result.failed || 0;
    console.log(
      `event ${event.id} (${event.name}): indexed=${result.indexed} failed=${result.failed} total_media=${result.mediaCount}`
    );
  }

  console.log('Backfill complete');
  console.log(`processed_events=${processed} indexed=${totalIndexed} failed=${totalFailed}`);
}

main().catch((error) => {
  console.error('Backfill failed:', error);
  process.exit(1);
});
