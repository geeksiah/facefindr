import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl as getS3SignedUrl } from '@aws-sdk/s3-request-presigner';

import { createServiceClient } from '@/lib/supabase/server';

export type StorageProvider = 'supabase' | 's3';
type SignedUrlOptions = { supabaseClient?: any };
type UploadStorageObjectOptions = {
  contentType?: string;
  cacheControl?: string;
  upsert?: boolean;
  supabaseClient?: any;
};

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

function encodeS3KeyForUrl(key: string): string {
  return key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function resolveS3PublicBaseUrl(): string | null {
  const base = process.env.STORAGE_S3_PUBLIC_BASE_URL || process.env.S3_PUBLIC_BASE_URL;
  if (base && base.trim()) {
    return base.trim().replace(/\/+$/, '');
  }

  const endpoint = process.env.S3_ENDPOINT || process.env.STORAGE_S3_ENDPOINT;
  if (endpoint && endpoint.trim()) {
    return endpoint.trim().replace(/\/+$/, '');
  }

  const region =
    process.env.AWS_REGION ||
    process.env.AWS_DEFAULT_REGION ||
    process.env.S3_REGION ||
    process.env.STORAGE_S3_REGION;
  if (!region) return null;

  return `https://s3.${region}.amazonaws.com`;
}

export function getStorageProvider(): StorageProvider {
  return resolveStorageProvider();
}

export function getStoragePublicUrl(logicalBucket: string, path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') return null;
  const normalizedPath = normalizeStoragePath(path);
  if (!normalizedPath) return null;

  const provider = resolveStorageProvider();
  if (provider === 's3') {
    try {
      const bucket = resolveS3Bucket(logicalBucket);
      const baseUrl = resolveS3PublicBaseUrl();
      if (!baseUrl) return null;
      const encodedPath = encodeS3KeyForUrl(normalizedPath);

      if (baseUrl.includes('{bucket}')) {
        return `${baseUrl.replace('{bucket}', bucket)}/${encodedPath}`;
      }
      return `${baseUrl}/${bucket}/${encodedPath}`;
    } catch (error) {
      console.error('Failed to resolve S3 public URL:', error);
      return null;
    }
  }

  try {
    const serviceClient = createServiceClient();
    const { data } = serviceClient.storage.from(logicalBucket).getPublicUrl(normalizedPath);
    return data?.publicUrl || null;
  } catch (error) {
    console.error('Failed to resolve Supabase public URL:', error);
    return null;
  }
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

export async function downloadStorageObject(
  logicalBucket: string,
  path: string | null | undefined,
  options?: { supabaseClient?: any }
): Promise<Uint8Array> {
  if (!path || typeof path !== 'string') {
    throw new Error('Storage path is required');
  }

  const normalizedPath = normalizeStoragePath(path);
  if (!normalizedPath) {
    throw new Error('Storage path is required');
  }

  const provider = resolveStorageProvider();
  if (provider === 's3') {
    const client = getS3Client();
    const bucket = resolveS3Bucket(logicalBucket);
    const response = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: normalizedPath,
      })
    );

    const body: any = response.Body;
    if (!body) {
      throw new Error('S3 object body is empty');
    }

    if (typeof body.transformToByteArray === 'function') {
      return await body.transformToByteArray();
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of body) {
      chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
    }
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return bytes;
  }

  const supabaseClient = options?.supabaseClient || createServiceClient();
  const { data, error } = await supabaseClient.storage
    .from(logicalBucket)
    .download(normalizedPath);
  if (error || !data) {
    throw new Error(error?.message || 'Supabase download failed');
  }

  return new Uint8Array(await data.arrayBuffer());
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

export async function copyStorageObjectBetweenBuckets(
  sourceLogicalBucket: string,
  sourcePath: string,
  destinationLogicalBucket: string,
  destinationPath: string
): Promise<void> {
  const normalizedSourcePath = normalizeStoragePath(sourcePath);
  const normalizedDestinationPath = normalizeStoragePath(destinationPath);

  if (sourceLogicalBucket === destinationLogicalBucket) {
    await copyStorageObject(sourceLogicalBucket, normalizedSourcePath, normalizedDestinationPath);
    return;
  }

  const provider = resolveStorageProvider();
  if (provider === 's3') {
    const client = getS3Client();
    const sourceBucket = resolveS3Bucket(sourceLogicalBucket);
    const destinationBucket = resolveS3Bucket(destinationLogicalBucket);

    await client.send(
      new CopyObjectCommand({
        Bucket: destinationBucket,
        Key: normalizedDestinationPath,
        CopySource: toS3CopySource(sourceBucket, normalizedSourcePath),
      })
    );
    return;
  }

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient.storage
    .from(sourceLogicalBucket)
    .download(normalizedSourcePath);
  if (error || !data) {
    throw new Error(error?.message || 'Supabase download failed');
  }

  const { error: uploadError } = await serviceClient.storage
    .from(destinationLogicalBucket)
    .upload(normalizedDestinationPath, data as any, {
      contentType: data.type || undefined,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message || 'Supabase upload failed');
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

export async function uploadStorageObject(
  logicalBucket: string,
  path: string,
  body: string | Uint8Array | ArrayBuffer | Buffer | Blob,
  options?: UploadStorageObjectOptions
): Promise<void> {
  const normalizedPath = normalizeStoragePath(path);
  const provider = resolveStorageProvider();

  if (provider === 's3') {
    const client = getS3Client();
    const bucket = resolveS3Bucket(logicalBucket);
    const cacheControl = options?.cacheControl;
    const contentType = options?.contentType;

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: normalizedPath,
        Body: body as any,
        ContentType: contentType,
        CacheControl: cacheControl,
      })
    );
    return;
  }

  const supabaseClient = options?.supabaseClient || createServiceClient();
  const { error } = await supabaseClient.storage.from(logicalBucket).upload(normalizedPath, body as any, {
    contentType: options?.contentType,
    cacheControl: options?.cacheControl,
    upsert: options?.upsert,
  });
  if (error) {
    throw new Error(error.message || 'Supabase upload failed');
  }
}
