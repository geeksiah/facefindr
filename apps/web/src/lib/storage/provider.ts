import { CopyObjectCommand, DeleteObjectsCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';

import { createServiceClient } from '@/lib/supabase/server';

export type StorageProvider = 'supabase' | 's3';
type SignedUrlOptions = { supabaseClient?: any };

let cachedS3Client: S3Client | null = null;

function normalizeStoragePath(path: string): string {
  const trimmed = path.trim();
  return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
}

function resolveStorageProvider(): StorageProvider {
  const raw = String(process.env.STORAGE_PROVIDER || 'supabase').trim().toLowerCase();
  if (raw === 's3' || raw === 'aws') return 's3';
  return 'supabase';
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveS3Bucket(logicalBucket: string): string {
  const normalized = logicalBucket.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const exactMapped =
    process.env[`STORAGE_S3_BUCKET_${normalized}`] ||
    process.env[`S3_BUCKET_${normalized}`];

  if (exactMapped) return exactMapped;

  const prefix = process.env.STORAGE_S3_BUCKET_PREFIX || process.env.S3_BUCKET_PREFIX;
  if (prefix) return `${prefix}${logicalBucket}`;

  const fallback = process.env.STORAGE_S3_DEFAULT_BUCKET || process.env.S3_BUCKET;
  if (fallback) return fallback;

  throw new Error(
    `No S3 bucket mapping found for "${logicalBucket}". ` +
      `Set STORAGE_S3_BUCKET_${normalized} (or STORAGE_S3_BUCKET_PREFIX / STORAGE_S3_DEFAULT_BUCKET).`
  );
}

function getS3Client(): S3Client {
  if (cachedS3Client) return cachedS3Client;

  const region =
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    process.env.S3_REGION ||
    process.env.STORAGE_S3_REGION;

  if (!region) {
    throw new Error('Missing AWS region for S3 storage provider.');
  }

  const accessKeyId = requireEnv('AWS_ACCESS_KEY_ID');
  const secretAccessKey = requireEnv('AWS_SECRET_ACCESS_KEY');
  const endpoint = process.env.S3_ENDPOINT || process.env.STORAGE_S3_ENDPOINT;
  const forcePathStyle =
    String(process.env.S3_FORCE_PATH_STYLE || process.env.STORAGE_S3_FORCE_PATH_STYLE || '')
      .trim()
      .toLowerCase() === 'true';

  cachedS3Client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return cachedS3Client;
}

function toS3CopySource(bucket: string, key: string): string {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${bucket}/${encodedKey}`;
}

export function getStorageProvider(): StorageProvider {
  return resolveStorageProvider();
}

export async function createStorageSignedUrl(
  logicalBucket: string,
  path: string | null | undefined,
  expiresInSeconds = 3600,
  options?: SignedUrlOptions
): Promise<string | null> {
  if (!path || typeof path !== 'string') return null;
  const normalizedPath = normalizeStoragePath(path);
  if (!normalizedPath) return null;

  const provider = resolveStorageProvider();
  if (provider === 's3') {
    try {
      const client = getS3Client();
      const bucket = resolveS3Bucket(logicalBucket);
      return await getS3SignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: normalizedPath,
        }),
        { expiresIn: expiresInSeconds }
      );
    } catch (error) {
      console.error('Failed to create S3 signed URL:', error);
      return null;
    }
  }

  try {
    const supabaseClient = options?.supabaseClient || createServiceClient();
    const { data, error } = await supabaseClient.storage
      .from(logicalBucket)
      .createSignedUrl(normalizedPath, expiresInSeconds);
    if (error || !data?.signedUrl) {
      console.error('Failed to create Supabase signed URL:', error);
      return null;
    }
    return data.signedUrl;
  } catch (error) {
    console.error('Failed to create Supabase signed URL:', error);
    return null;
  }
}

export async function copyStorageObject(
  logicalBucket: string,
  sourcePath: string,
  destinationPath: string
): Promise<void> {
  const normalizedSourcePath = normalizeStoragePath(sourcePath);
  const normalizedDestinationPath = normalizeStoragePath(destinationPath);
  const provider = resolveStorageProvider();

  if (provider === 's3') {
    const client = getS3Client();
    const bucket = resolveS3Bucket(logicalBucket);
    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: normalizedDestinationPath,
        CopySource: toS3CopySource(bucket, normalizedSourcePath),
      })
    );
    return;
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.storage
    .from(logicalBucket)
    .copy(normalizedSourcePath, normalizedDestinationPath);

  if (error) {
    throw new Error(error.message || 'Supabase copy failed');
  }
}

export async function deleteStorageObjects(logicalBucket: string, paths: string[]): Promise<void> {
  const normalizedPaths = paths
    .map((path) => (typeof path === 'string' ? normalizeStoragePath(path) : ''))
    .filter(Boolean);

  if (normalizedPaths.length === 0) return;

  const provider = resolveStorageProvider();
  if (provider === 's3') {
    const client = getS3Client();
    const bucket = resolveS3Bucket(logicalBucket);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: normalizedPaths.map((key) => ({ Key: key })),
          Quiet: true,
        },
      })
    );
    return;
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient.storage.from(logicalBucket).remove(normalizedPaths);
  if (error) {
    throw new Error(error.message || 'Supabase remove failed');
  }
}
