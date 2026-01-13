'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, X, CheckCircle, AlertCircle, Loader2, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { uploadPhotos } from './actions';

interface PhotoUploaderProps {
  eventId: string;
  onUploadComplete?: () => void;
}

interface UploadFile {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
}

export function PhotoUploader({ eventId, onUploadComplete }: PhotoUploaderProps) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadFile[] = acceptedFiles.map((file) => ({
      id: `${file.name}-${Date.now()}-${Math.random()}`,
      file,
      preview: URL.createObjectURL(file),
      status: 'pending',
      progress: 0,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/heic': ['.heic'],
      'image/webp': ['.webp'],
    },
    maxSize: 50 * 1024 * 1024, // 50MB
    multiple: true,
  });

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const file = prev.find((f) => f.id === id);
      if (file) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleUpload = async () => {
    const pendingFiles = files.filter((f) => f.status === 'pending');
    if (pendingFiles.length === 0) return;

    setIsUploading(true);

    // Upload files one by one
    for (const uploadFile of pendingFiles) {
      setFiles((prev) =>
        prev.map((f) =>
          f.id === uploadFile.id ? { ...f, status: 'uploading', progress: 0 } : f
        )
      );

      try {
        const formData = new FormData();
        formData.append('file', uploadFile.file);
        formData.append('eventId', eventId);

        const result = await uploadPhotos(formData);

        if (result.error) {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id
                ? { ...f, status: 'error', error: result.error }
                : f
            )
          );
        } else {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === uploadFile.id
                ? { ...f, status: 'success', progress: 100 }
                : f
            )
          );
        }
      } catch (error) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === uploadFile.id
              ? { ...f, status: 'error', error: 'Upload failed' }
              : f
          )
        );
      }
    }

    setIsUploading(false);
    onUploadComplete?.();
  };

  const clearCompleted = () => {
    setFiles((prev) => {
      prev.forEach((f) => {
        if (f.status === 'success') {
          URL.revokeObjectURL(f.preview);
        }
      });
      return prev.filter((f) => f.status !== 'success');
    });
  };

  const pendingCount = files.filter((f) => f.status === 'pending').length;
  const successCount = files.filter((f) => f.status === 'success').length;
  const errorCount = files.filter((f) => f.status === 'error').length;

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          'relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer',
          isDragActive
            ? 'border-accent bg-accent/5'
            : 'border-border hover:border-accent/50 hover:bg-muted/50'
        )}
      >
        <input {...getInputProps()} />
        <div className="rounded-2xl bg-muted p-4 mb-4">
          <Upload className={cn('h-8 w-8', isDragActive ? 'text-accent' : 'text-muted-foreground')} />
        </div>
        <p className="text-sm font-medium text-foreground">
          {isDragActive ? 'Drop photos here' : 'Drag & drop photos here'}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          or click to select files (JPEG, PNG, HEIC, WebP up to 50MB)
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground">
              {files.length} file{files.length !== 1 ? 's' : ''} selected
              {successCount > 0 && (
                <span className="text-success ml-2">({successCount} uploaded)</span>
              )}
              {errorCount > 0 && (
                <span className="text-destructive ml-2">({errorCount} failed)</span>
              )}
            </p>
            <div className="flex gap-2">
              {successCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearCompleted}>
                  Clear completed
                </Button>
              )}
              {pendingCount > 0 && (
                <Button
                  size="sm"
                  onClick={handleUpload}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload {pendingCount} photo{pendingCount !== 1 ? 's' : ''}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {files.map((file) => (
              <div
                key={file.id}
                className="relative aspect-square rounded-lg overflow-hidden bg-muted group"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={file.preview}
                  alt={file.file.name}
                  className="w-full h-full object-cover"
                />

                {/* Overlay based on status */}
                {file.status === 'uploading' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                    <Loader2 className="h-6 w-6 animate-spin text-accent" />
                  </div>
                )}

                {file.status === 'success' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-success/20">
                    <CheckCircle className="h-8 w-8 text-success" />
                  </div>
                )}

                {file.status === 'error' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-destructive/20">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                  </div>
                )}

                {/* Remove button */}
                {file.status !== 'uploading' && (
                  <button
                    onClick={() => removeFile(file.id)}
                    className="absolute top-1 right-1 rounded-full bg-background/80 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="h-4 w-4 text-foreground" />
                  </button>
                )}

                {/* Filename tooltip on hover */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-xs text-white truncate">{file.file.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {files.length === 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-4">
          <Image className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No photos selected yet. Drag and drop or click to browse.
          </p>
        </div>
      )}
    </div>
  );
}
