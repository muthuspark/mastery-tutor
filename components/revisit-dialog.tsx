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
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSubmitting) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSubmitting, onCancel, open]);

  if (!open) return null;

  return (
    <div className="revisit-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSubmitting) onCancel(); }}>
      <section className="revisit-dialog" role="dialog" aria-modal="true" aria-labelledby="revisit-dialog-title" aria-describedby="revisit-dialog-description">
        <div className="revisit-dialog__mark" aria-hidden="true">↻</div>
        <p className="eyebrow">A fresh attempt</p>
        <h2 className="display revisit-dialog__title" id="revisit-dialog-title">Reset {chapterTitle}?</h2>
        <p className="revisit-dialog__description" id="revisit-dialog-description">Your current mastery result and quiz questions will be cleared. We’ll generate a fresh set of questions so you can measure what you know again.</p>
        <div className="revisit-dialog__details ui">
          <div><span>Mastery result</span><strong>Reset</strong></div>
          <div><span>Quiz questions</span><strong>Rebuilt</strong></div>
        </div>
        {error ? <p className="revisit-dialog__error ui" role="alert">{error}</p> : null}
        <div className="revisit-dialog__actions ui">
          <button type="button" className="button-secondary" onClick={onCancel} disabled={isSubmitting}>Keep mastered</button>
          <button type="button" className="button-primary" onClick={onConfirm} disabled={isSubmitting} ref={confirmRef}>{isSubmitting ? "Resetting…" : "Reset and revisit"}</button>
        </div>
      </section>
    </div>
  );
}
