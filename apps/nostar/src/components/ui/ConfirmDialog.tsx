import React, { useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { useModalLifecycle } from '../../hooks/useModalLifecycle';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  type?: 'danger' | 'warning' | 'info';
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  type = 'warning',
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Shares the dialog stack so a confirmation over a Modal owns Escape, focus and the top layer.
  const layer = useModalLifecycle(isOpen, onCancel, dialogRef);

  if (!isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
  };

  const handleCancel = () => {
    onCancel();
  };

  const buttonClass = type === 'danger'
    ? 'bg-status-red hover:bg-status-red/90 dark:hover:bg-status-red'
    : 'bg-brand-indigo hover:bg-brand-hover dark:hover:bg-brand-hover';

  const dialogContent = (
    <div
      style={{ zIndex: layer }}
      className="fixed inset-0 flex items-center justify-center"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onCancel}
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative w-full max-w-md mx-4 bg-white dark:bg-panel-dark dark:border dark:border-white/[0.04] rounded-xl shadow-xl"
      >
        <div className="p-6">
          <div className="flex items-start space-x-4">
            <div className={`flex-shrink-0 p-2 rounded-full ${
              type === 'danger' ? 'bg-status-red/10' : 'bg-brand-indigo/10'
            }`}>
              <AlertTriangle className={`w-6 h-6 ${
                type === 'danger' ? 'text-status-red' : 'text-brand-indigo dark:text-brand-indigo'
              }`} />
            </div>
            <div className="flex-1">
              <h3 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-text-primary">
                {title}
              </h3>
              <p className="mt-2 text-sm text-gray-600 dark:text-text-secondary">
                {message}
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-3 px-6 py-4 bg-light-bg dark:bg-white/[0.02] border-t border-black/[0.06] dark:border-white/[0.04] rounded-b-xl">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-text-primary bg-white dark:bg-panel-dark border border-black/[0.06] dark:border-white/[0.08] rounded-lg hover:bg-gray-50 dark:hover:bg-white/[0.08] transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ${buttonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialogContent, document.body);
};
