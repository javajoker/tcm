import { useId, type ReactNode } from "react";
import { Button } from "./Button.tsx";
import { Dialog, DialogActions } from "./Dialog.tsx";

/** A yes/no confirmation for a destructive action: the safe choice (cancel) is first, Esc and the backdrop cancel. */
export function ConfirmDialog({ open, title, children, confirmLabel, cancelLabel, danger = true, onConfirm, onCancel }: {
  open: boolean; title: ReactNode; children?: ReactNode; confirmLabel: string; cancelLabel: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}): ReactNode {
  const id = useId();
  return (
    <Dialog open={open} onClose={onCancel} labelledBy={id}>
      <h2 id={id}>{title}</h2>
      {children}
      <DialogActions>
        <Button onClick={onCancel}>{cancelLabel}</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
