'use client';

import { Trash2, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { deleteEvent } from '@/app/(dashboard)/dashboard/events/actions';
import { useToast, useConfirm } from '@/components/ui/toast';

interface DeleteEventButtonProps {
  eventId: string;
  eventName: string;
}

export function DeleteEventButton({ eventId, eventName }: DeleteEventButtonProps) {
  const router = useRouter();
  const toast = useToast();
  const { confirm, ConfirmDialog } = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Event',
      message: `Are you sure you want to delete "${eventName}"? This will permanently delete all photos, face data, and transactions associated with this event. This action cannot be undone.`,
      confirmLabel: 'Delete Event',
      cancelLabel: 'Cancel',
      variant: 'destructive',
    });

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const result = await deleteEvent(eventId);

      if (result?.error) {
        toast.error('Delete Failed', result.error);
      } else {
        toast.success('Event Deleted', 'The event has been successfully deleted.');
        router.push('/dashboard/events');
        router.refresh();
      }
    } catch (error) {
      toast.error('Delete Failed', 'An unexpected error occurred.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <ConfirmDialog />
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Delete event"
      >
        {isDeleting ? (
          <Loader2 className="h-4 w-4 animate-spin text-destructive" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
    </>
  );
}
