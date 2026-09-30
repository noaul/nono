import React, { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useModalLifecycle } from '../hooks/useModalLifecycle';
import { X } from 'lucide-react';
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}
export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-md',
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const layer = useModalLifecycle(isOpen, onClose, dialogRef);
  if (!isOpen) return null;
  return createPortal(
    <div
      style={{ zIndex: layer }}
      className="fixed inset-0 overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="fixed inset-0 bg-black/50"
        aria-hidden="true"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`relative w-full ${maxWidth} bg-white dark:bg-panel-dark dark:border dark:border-white/[0.04] rounded-xl shadow-xl`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-6 border-b border-black/[0.06] dark:border-white/[0.04]">
            <h3
              id={titleId}
              className="text-lg font-semibold text-gray-900 dark:text-text-primary"
            >
              {title}
            </h3>
            <button
              type="button"
              aria-label={
                document.documentElement.lang.startsWith('zh')
                  ? '关闭'
                  : 'Close'
              }
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">{children}</div>
        </div>
      </div>
    </div>,
    document.body
  );
};
