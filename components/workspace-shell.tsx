"use client";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, CheckCheck, ChevronRight, CircleHelp, Layers2, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Settings2, Sun } from "lucide-react";
import { CATEGORIES, localDay, taskDay, type Category, type Task } from "@/lib/tasks";
import WorkspaceDialog from "./workspace-dialog";

export type WorkspaceSection = "today" | "upcoming" | "calendar" | "completed";
const navigation = [
  { id: "today", label: "Today", icon: Sun }, { id: "upcoming", label: "Upcoming", icon: Layers2 },
  { id: "calendar", label: "Calendar", icon: CalendarDays }, { id: "completed", label: "Completed", icon: CheckCheck },
] as const;
export default function WorkspaceShell({ email, tasks, ready, saving, hasError, now, category, onCategoryChange, onSignOut, settings, renderCreator, children }: {
  email: string; tasks: Task[]; ready: boolean; saving: boolean; hasError: boolean; now: number;
  category: Category | "All"; onCategoryChange: (category: Category | "All") => void; onSignOut: () => void;
  settings: ReactNode; renderCreator: (onBusyChange: (busy: boolean) => void, initialFiles: readonly File[]) => ReactNode;
  children: (section: WorkspaceSection, onSectionChange: (section: WorkspaceSection) => void, onCreate: () => void) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false), [section, setSection] = useState<WorkspaceSection>("upcoming");
  const [modal, setModal] = useState<"create" | "settings" | null>(null), [creatorBusy, setCreatorBusy] = useState(false);
  const [pastedFiles, setPastedFiles] = useState<File[]>([]);
  const active = tasks.filter(task => task.status !== "Submitted/Done"), today = localDay(new Date(now));
  const counts = { today: active.filter(task => taskDay(task) === today).length, upcoming: active.length, completed: tasks.length - active.length, calendar: null };
  const openCreator = () => { setPastedFiles([]); setModal("create"); };
  const closeModal = () => { setModal(null); setPastedFiles([]); setCreatorBusy(false); };
  useEffect(() => {
    if (modal || !ready || saving) return;
    const paste = (event: ClipboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=textbox]")) return;
      const files = Array.from(event.clipboardData?.files || []); if (!files.length) return;
      event.preventDefault(); setPastedFiles(files); setModal("create");
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [modal, ready, saving]);
  return <div className={`workspace-shell ${collapsed ? "sidebar-collapsed" : ""}`}>
    <a href="#workspace-main" className="skip-link">Skip to workspace</a>
    <aside className="workspace-sidebar" aria-label="Workspace navigation">
      <div className="workspace-brand"><span className="brand-mark" aria-hidden="true"><img src="/icon.svg" width="28" height="28" alt="" /></span><span className="sidebar-label">Deadline<span className="brand-light">Desk</span></span></div>
      <button type="button" className="sidebar-add" disabled={!ready || saving} onClick={openCreator} title="Add task"><Plus size={17} aria-hidden="true" /><span className="sidebar-label">Add task</span></button>
      <p className="nav-caption sidebar-label">Workspace</p>
      <nav aria-label="Main navigation" className="workspace-nav">{navigation.map(({ id, label, icon: Icon }) => <button type="button" key={id}
        onClick={() => setSection(id)} aria-current={section === id ? "page" : undefined} aria-label={label} title={label}
        className={`nav-item ${section === id ? "is-active" : ""}`}><Icon size={17} aria-hidden="true" /><span className="sidebar-label">{label}</span>
        {counts[id] !== null && <span className="nav-count sidebar-label">{ready ? counts[id] : "—"}</span>}</button>)}</nav>
      <div className="sidebar-categories"><p className="nav-caption sidebar-label">Categories</p>{CATEGORIES.map(item => <button type="button" key={item} title={item}
        className={`nav-item ${category === item ? "category-active" : ""}`} aria-label={`Filter ${item}`} aria-pressed={category === item}
        onClick={() => onCategoryChange(category === item ? "All" : item)}><span className="category-dot" data-category={item} /><span className="sidebar-label">{item}</span>
        <span className="nav-count sidebar-label">{ready ? active.filter(task => task.category === item).length : "—"}</span></button>)}</div>
      <div className="sidebar-bottom"><button type="button" className="nav-item" onClick={() => setModal("settings")} title="Settings" aria-label="Settings"><Settings2 size={17} aria-hidden="true" /><span className="sidebar-label">Settings & imports</span></button>
        <button type="button" className="nav-item collapse-control" title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}<span className="sidebar-label">Collapse sidebar</span></button>
        <div className="account-row"><span className="account-avatar" aria-hidden="true">{email.slice(0, 1).toUpperCase() || "D"}</span><div className="account-copy sidebar-label"><span title={email}>{email || "Personal workspace"}</span><small>Personal account</small></div>
          <button type="button" className="icon-button sidebar-label" disabled={saving} aria-label="Sign out" title="Sign out" onClick={onSignOut}><LogOut size={15} aria-hidden="true" /></button></div>
      </div>
    </aside>
    <div className="workspace-body"><header className="workspace-topbar"><div className="breadcrumb"><span>Workspace</span><ChevronRight size={13} aria-hidden="true" /><strong>{navigation.find(item => item.id === section)?.label}</strong></div>
      <div className="topbar-actions"><span className={`sync-state ${hasError ? "has-error" : ""}`} role="status"><i aria-hidden="true" />{hasError ? "Sync issue" : saving ? "Saving…" : ready ? "Account synced" : "Loading…"}</span>
        <button type="button" className="icon-button mobile-settings" aria-label="Settings" onClick={() => setModal("settings")}><Settings2 size={18} aria-hidden="true" /></button>
        <button type="button" className="button-primary add-task-button" disabled={!ready || saving} onClick={openCreator}><Plus size={16} aria-hidden="true" />Add task</button></div>
    </header>
      <main id="workspace-main" className="workspace-main" tabIndex={-1}>{children(section, setSection, openCreator)}</main>
      <footer className="workspace-footer"><span>Your deadlines. A little more headspace.</span><button type="button" onClick={() => setModal("settings")}><CircleHelp size={13} aria-hidden="true" />Calendar imports & settings</button></footer>
    </div>
    <nav className="mobile-navigation" aria-label="Mobile workspace navigation">{navigation.map(({ id, label, icon: Icon }) => <button type="button" key={id} aria-current={section === id ? "page" : undefined} onClick={() => setSection(id)}><Icon size={19} aria-hidden="true" /><span>{label}</span></button>)}</nav>
    {modal === "create" && <WorkspaceDialog title="Add task" description="Start with a screenshot or enter the details yourself." busy={saving || creatorBusy} onClose={closeModal}>{renderCreator(setCreatorBusy, pastedFiles)}</WorkspaceDialog>}
    {modal === "settings" && <WorkspaceDialog title="Settings" description="Manage your account and connect your calendar feeds." busy={saving} onClose={closeModal}>{settings}
      <div className="settings-section"><h3>Account</h3><p>{email || "Personal workspace"}</p><button type="button" className="button-secondary mt-3" disabled={saving} onClick={onSignOut}><LogOut size={15} aria-hidden="true" />Sign out</button></div>
    </WorkspaceDialog>}
  </div>;
}
