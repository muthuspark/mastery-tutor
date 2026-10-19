"use client";

import { useEffect, useRef } from "react";

type RevisitDialogProps = {
  open: boolean;
  chapterTitle: string;
  isSubmitting: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function RevisitDialog({ open, chapterTitle, isSubmitting, error, onCancel, onConfirm }: RevisitDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog.close();
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog ref={dialogRef} tabIndex={-1} className="revisit-dialog" aria-modal="true" aria-labelledby="revisit-dialog-title" aria-describedby="revisit-dialog-description" onCancel={(event) => { event.preventDefault(); if (!isSubmitting) onCancel(); }} onKeyDown={(event) => {
      if (event.key !== "Tab") return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!first) {
        event.preventDefault();
        event.currentTarget.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }} onMouseDown={(event) => {
      if (event.target !== event.currentTarget || isSubmitting) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onCancel();
    }}>
        <div className="revisit-dialog__mark" aria-hidden="true">↻</div>
        <p className="eyebrow">A fresh attempt</p>
        <h2 className="display revisit-dialog__title" id="revisit-dialog-title">Reset {chapterTitle}?</h2>
        <p className="revisit-dialog__description" id="revisit-dialog-description">This chapter’s current mastery result and quiz questions will be cleared, along with saved answers and review items associated with those questions. We’ll generate a fresh set of questions so you can measure what you know again.</p>
        <div className="revisit-dialog__details ui">
          <div><span>Mastery result</span><strong>Reset</strong></div>
          <div><span>Quiz questions</span><strong>Rebuilt</strong></div>
        </div>
        {error ? <p className="revisit-dialog__error ui" role="alert">{error}</p> : null}
        <div className="revisit-dialog__actions ui">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={isSubmitting} ref={cancelRef}>Keep mastered</button>
          <button type="button" className="button-primary" onClick={onConfirm} disabled={isSubmitting}>{isSubmitting ? "Resetting…" : "Reset and retake mastery check"}</button>
        </div>
    </dialog>
  );
}
