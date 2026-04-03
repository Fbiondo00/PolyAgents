'use client'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  destructive?: boolean
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-[#0E1B27] border-[#1A3C50] text-[#E1F5FE]">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading text-[#E1F5FE]">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[#B0BEC5]">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="bg-transparent border-[#1A3C50] text-[#B0BEC5] hover:bg-[#1A3C50] hover:text-[#E1F5FE]">
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={
              destructive
                ? 'bg-[#EF5350] hover:bg-[#EF5350]/80 text-white font-semibold'
                : 'bg-[#00A8B5] hover:bg-[#4DD0E1] text-[#081216] font-semibold'
            }
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
