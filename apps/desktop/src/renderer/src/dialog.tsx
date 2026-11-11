import { useEffect, useRef, type ReactNode } from 'react';
/** Native modal focus containment, Escape handling and return to the invoking control. */
export function Dialog({
  label,
  onClose,
  children,
  dismissible = true,
}: {
  label: string;
  onClose(): void;
  children: ReactNode;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal-shell"
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        if (dismissible) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && dismissible) onClose();
      }}
    >
      <div className="dialog">{children}</div>
    </dialog>
  );
}
