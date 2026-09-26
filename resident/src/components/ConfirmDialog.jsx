import { useState } from 'react';

// Generic confirmation modal. Pages hold one { title, message, confirmLabel,
// destructive, onConfirm } object in state (null when closed) and pass it in --
// this component owns only the presentation and the in-flight/disabled state
// while onConfirm's promise is pending, so a click can't double-fire the action.
function ConfirmDialog({ dialog, onClose }) {
  const [loading, setLoading] = useState(false);

  if (!dialog) return null;

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await dialog.onConfirm();
    } finally {
      setLoading(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center px-6"
      onClick={() => !loading && onClose()}
    >
      <div
        className="bg-brand-surface rounded-2xl shadow-sm p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-display text-lg font-semibold mb-1">{dialog.title}</p>
        <p className="text-sm text-brand-ink/60 mb-6">{dialog.message}</p>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 text-sm font-medium py-2.5 rounded-full border border-brand-ink/20 disabled:opacity-60"
          >
            {dialog.cancelLabel || 'Cancel'}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={`flex-1 text-sm font-medium py-2.5 rounded-full text-white disabled:opacity-60 ${
              dialog.destructive === false ? 'bg-brand-primary' : 'bg-red-600'
            }`}
          >
            {loading ? 'Please wait...' : dialog.confirmLabel || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
