"use client";
import { useEffect, useId, useRef, useState } from "react";
import type { Task } from "@/lib/tasks";
import { stableSaveAttempt, blankExtraction, type Extraction, type SaveAttempt } from "@/lib/assignment-draft";
import ScreenshotInput from "./screenshot-input";
import TaskReviewForm from "./task-review-form";
import ManualTaskForm from "./manual-task-form";
import { ImagePlus, TextCursorInput } from "lucide-react";
import { imageFileError } from "@/lib/image-limits";

export default function TaskCreator({ tasks, disabled, analysisEnabled = false, timezone = "America/New_York", onAnalyze, onSaveTask, onBusyChange, initialFiles }: {
  tasks: readonly Task[]; disabled: boolean; timezone?: string;
  analysisEnabled?: boolean;
  onAnalyze: (file: File, signal: AbortSignal) => Promise<Extraction>;
  onSaveTask: (task: Task) => Promise<void>;
  onBusyChange?: (busy: boolean) => void;
  initialFiles?: readonly File[];
}) {
  const [mode, setMode] = useState<"screenshot" | "manual">("screenshot");
  const [file, setFile] = useState<File | null>(() => initialFiles?.length === 1 && !imageFileError(initialFiles[0]) ? initialFiles[0] : null);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(() => !initialFiles?.length ? "" : initialFiles.length !== 1 ? "Choose one screenshot at a time." : imageFileError(initialFiles[0]) || "");
  const [notice, setNotice] = useState("");
  const sequence = useRef(0);
  const pending = useRef<SaveAttempt | null>(null);
  const active = useRef(false);
  const cancellation = useRef<AbortController | null>(null);
  const id = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => () => { ++sequence.current; cancellation.current?.abort(); }, []);
  useEffect(() => { onBusyChange?.(analyzing || saving); }, [analyzing, saving, onBusyChange]);
  function changeFile(next: File | null) {
    ++sequence.current; setFile(next); setExtraction(null); setSelected(null); setError(""); setNotice(""); pending.current = null;
  }
  async function analyze() {
    if (!analysisEnabled || !file || disabled || active.current) return;
    active.current = true; setAnalyzing(true); setError(""); setNotice("");
    const controller = new AbortController(); cancellation.current = controller;
    const current = ++sequence.current;
    try {
      const result = await onAnalyze(file, controller.signal);
      if (current !== sequence.current) return;
      setExtraction(result); setSelected(result.candidates.length === 1 ? 0 : null);
    } catch (error) {
      if (current === sequence.current) {
        setError(controller.signal.aborted ? "Analysis cancelled. You can fill in the details below." : error instanceof Error ? error.message : "Analysis failed. Enter the details below.");
        setExtraction(blankExtraction(timezone)); setSelected(0);
      }
    } finally { active.current = false; cancellation.current = null; if (current === sequence.current) setAnalyzing(false); }
  }
  async function save(candidate: Task) {
    if (disabled || active.current) throw new Error("Another operation is in progress. Try again.");
    active.current = true; setSaving(true); setNotice("");
    pending.current = stableSaveAttempt(pending.current, candidate, () => crypto.randomUUID());
    try {
      await onSaveTask(pending.current.task);
      pending.current = null; changeFile(null); setNotice(mode === "screenshot" ? "Task saved to your account. Ready for another screenshot." : "Task saved to your account.");
    } finally { active.current = false; setSaving(false); }
  }
  const unavailable = disabled || analyzing || saving;
  return <section className="panel p-4 sm:p-5" aria-label="Create a task">
    <h2 className="mb-4 text-base font-semibold">Add a task</h2>
    <div role="tablist" aria-label="Task creation method" className="creator-tabs">
      {(["screenshot", "manual"] as const).map((tab, index) => <button type="button" key={tab} role="tab" id={`${id}-${tab}`} aria-controls={`${id}-panel`}
        aria-selected={mode === tab} tabIndex={mode === tab ? 0 : -1} disabled={analyzing || saving}
        ref={element => { tabs.current[index] = element; }} onClick={() => setMode(tab)}
        onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : 1 - index;
          setMode(next === 0 ? "screenshot" : "manual"); tabs.current[next]?.focus();
        }}>
        {tab === "screenshot" ? <ImagePlus size={14} aria-hidden="true" /> : <TextCursorInput size={14} aria-hidden="true" />}{tab === "screenshot" ? "Paste Screenshot" : "Manual Entry"}</button>)}
    </div>
    <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${mode}`}>
      {mode === "manual" ? <ManualTaskForm tasks={tasks} disabled={unavailable} onSave={save} /> : <>
        {!analysisEnabled && <div id={`${id}-analysis-disabled`} className="mb-3 rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-sm text-slate-300">
          <p className="font-medium text-slate-200">Paid screenshot analysis is disabled</p>
          <p className="mt-1 text-xs leading-relaxed">Your screenshot stays in this browser. No analysis request is sent. You can still add a task with Manual Entry.</p>
          <button type="button" className="button-secondary mt-3" disabled={unavailable} onClick={() => { setMode("manual"); tabs.current[1]?.focus(); }}>Use Manual Entry</button>
        </div>}
        <ScreenshotInput file={file} enabled={!unavailable} onFileChange={changeFile} error={error} onError={setError} />
        {analysisEnabled && <p className="my-3 text-xs leading-relaxed text-slate-400">Analyze Screenshot sends this image to OpenAI, an external paid AI service. Account approval and usage limits apply. DueDrop does not store screenshots. Provider retention policies apply. Only confirmed task details are saved.</p>}
        {!extraction && <button type="button" disabled={!analysisEnabled || !file || unavailable} aria-describedby={!analysisEnabled ? `${id}-analysis-disabled` : undefined} className="button-primary mt-3 w-full" onClick={() => void analyze()}>
          {!analysisEnabled ? "Screenshot analysis disabled" : analyzing ? "Analyzing screenshot…" : "Analyze Screenshot"}</button>}
        {analyzing && <div role="status" className="mt-2 text-xs text-blue-200">
          <p>Reading task names and deadlines with GPT…</p><progress aria-label="Screenshot analysis progress" className="mt-2 h-2 w-full accent-blue-500" />
          <button type="button" className="button-secondary mt-2" onClick={() => cancellation.current?.abort()}>Cancel analysis</button>
        </div>}
        {extraction && <>
          <p className="mt-3 text-xs text-slate-400">Relative dates use {extraction.referenceDate} in {extraction.referenceTimezone}. Check older screenshots carefully.</p>
          {extraction.notes.length > 0 && <ul className="mt-2 list-disc pl-4 text-xs text-amber-200">{extraction.notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
          {extraction.candidates.length > 1 && <fieldset disabled={unavailable} className="mt-3 space-y-2">
            <legend className="mb-2 text-sm font-semibold">Choose one detected task</legend>
            {extraction.candidates.map((candidate, index) => <label key={index} className="flex items-start gap-2 rounded-lg border border-slate-700 p-2 text-xs text-slate-200">
              <input type="radio" name="candidate" className="mt-0.5 accent-blue-500" checked={selected === index} onChange={() => setSelected(index)} />
              <span>{candidate.name || "Untitled task"}<span className="mt-1 block text-slate-400">{candidate.dueDate || "Deadline needs review"} · {candidate.category}</span></span>
            </label>)}</fieldset>}
          {selected !== null ? <TaskReviewForm key={selected} candidate={extraction.candidates[selected]} defaultTimezone={extraction.referenceTimezone}
            tasks={tasks} disabled={unavailable} onSave={save} onTryAgain={() => { setExtraction(null); setSelected(null); setError(""); }} /> :
            <button type="button" disabled={unavailable} className="button-secondary mt-3" onClick={() => { setExtraction(null); setSelected(null); }}>Try Again</button>}
        </>}
      </>}
    </div>
    {notice && <p role="status" className="mt-3 text-xs text-blue-200">{notice}</p>}
  </section>;
}
