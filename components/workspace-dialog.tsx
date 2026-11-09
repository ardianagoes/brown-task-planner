"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { trapDialogTab } from "./dialog-focus";

export default function WorkspaceDialog({ title, description, busy = false, onClose, children }: {
  title: string; description: string; busy?: boolean; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null), heading = useId(), detail = useId();
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element?.showModal(); document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus(); };
  }, []);
  useEffect(() => { if (busy && dialog.current?.open && !dialog.current.contains(document.activeElement)) dialog.current.focus(); }, [busy]);
  return <dialog ref={dialog} className="workspace-dialog" aria-labelledby={heading} aria-describedby={detail} tabIndex={-1} onKeyDown={trapDialogTab}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="dialog-header"><div><h2 id={heading}>{title}</h2><p id={detail}>{description}</p></div>
      <button type="button" className="icon-button" aria-label={`Close ${title.toLowerCase()}`} disabled={busy} onClick={onClose}><X size={18} aria-hidden="true" /></button>
    </header>
    <div className="dialog-content">{children}</div>
  </dialog>;
}
