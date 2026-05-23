import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({
  open, onClose, title, children, maxWidth = 'max-w-md',
  // When false, backdrop clicks and Escape do not close the modal — used
  // for "you must acknowledge" interstitials.
  dismissible = true,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape' && dismissible) onClose?.(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, dismissible]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/60" onClick={dismissible ? onClose : undefined} />
      <div className={`relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full ${maxWidth} max-h-[90vh] overflow-auto`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
            {dismissible && (
              <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300" aria-label="Close">
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="px-5 py-4 text-slate-900 dark:text-slate-100">{children}</div>
      </div>
    </div>,
    document.body
  );
}
