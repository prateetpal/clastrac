import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import { ApiError, apiRequest, AttendanceLog, getAttendanceStats, Subject, User } from "@/lib/client-api";

type ModalState =
  | { type: "add" }
  | { type: "edit"; subject: Subject }
  | { type: "history"; subject: Subject }
  | { type: "delete"; subject: Subject }
  | null;

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(parsed);
}

function Icon({ name, size = 18 }: { name: "search" | "plus" | "clock" | "undo" | "edit" | "trash" | "close" | "arrow"; size?: number }) {
  const paths: Record<typeof name, React.ReactNode> = {
    search: <><circle cx="10.8" cy="10.8" r="6.2" /><path d="m15.4 15.4 4 4" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></>,
    undo: <><path d="M9 14 5 10l4-4" /><path d="M5 10h8a5 5 0 0 1 0 10h-2" /></>,
    edit: <><path d="m14 5 5 5M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z" /></>,
    trash: <><path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [toast, setToast] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);
  const [trendRange, setTrendRange] = useState<"week" | "month">("week");
  const searchRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3600);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      try {
        const result = await apiRequest<{ user: User }>("/api/auth/me");
        if (cancelled) return;
        setUser(result.user);
        const data = await apiRequest<{ subjects: Subject[] }>("/api/subjects");
        if (!cancelled) setSubjects(data.subjects);
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 401) {
          await router.replace("/login");
          return;
        }
        setLoadError(error instanceof Error ? error.message : "Could not load your dashboard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === "Escape" && document.activeElement === searchRef.current) {
        setQuery("");
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  const visibleSubjects = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return term ? subjects.filter((subject) => subject.name.toLocaleLowerCase().includes(term)) : subjects;
  }, [query, subjects]);

  const totals = useMemo(() => {
    const attended = subjects.reduce((sum, subject) => sum + subject.attendedClasses, 0);
    const classes = subjects.reduce((sum, subject) => sum + subject.totalClasses, 0);
    const trackedSubjects = subjects.filter((subject) => subject.totalClasses > 0);
    const safe = trackedSubjects.filter((subject) => getAttendanceStats(subject).isSafe).length;
    return {
      attended,
      classes,
      tracked: trackedSubjects.length,
      percentage: classes ? attended / classes * 100 : 0,
      safe,
      shortage: trackedSubjects.length - safe
    };
  }, [subjects]);

  async function markAttendance(subject: Subject, status: "Present" | "Absent", date = todayString()) {
    if (busyIds.includes(subject.id)) return;
    setBusyIds((ids) => [...ids, subject.id]);
    try {
      const result = await apiRequest<{
        subject: Pick<Subject, "id" | "name" | "targetPercentage" | "attendedClasses" | "totalClasses">;
        log: AttendanceLog;
      }>(`/api/subjects/${subject.id}/mark`, {
        method: "POST",
        body: { status, date }
      });
      setSubjects((current) => current.map((item) => item.id !== subject.id ? item : ({
        ...item,
        ...result.subject,
        logs: [result.log, ...item.logs]
      })));
      notify(status === "Present" ? "Present — nice work showing up." : "Absent recorded.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not mark attendance.");
    } finally {
      setBusyIds((ids) => ids.filter((id) => id !== subject.id));
    }
  }

  async function undoAttendance(subject: Subject) {
    if (busyIds.includes(subject.id)) return;
    setBusyIds((ids) => [...ids, subject.id]);
    try {
      const result = await apiRequest<{
        subject: Pick<Subject, "id" | "name" | "targetPercentage" | "attendedClasses" | "totalClasses">;
        undone: AttendanceLog;
      }>(`/api/subjects/${subject.id}/undo`, { method: "POST" });
      const latestSubject = subjects.find((item) => item.id === subject.id) ?? subject;
      const latestUndoIndex = latestSubject.logs.findIndex((log) => log.id === result.undone.id);
      const updatedSubject: Subject = {
        ...latestSubject,
        ...result.subject,
        logs: latestUndoIndex < 0
          ? latestSubject.logs
          : [...latestSubject.logs.slice(0, latestUndoIndex), ...latestSubject.logs.slice(latestUndoIndex + 1)]
      };
      setSubjects((current) => current.map((item) => {
        if (item.id !== subject.id) return item;
        const undoIndex = item.logs.findIndex((log) => log.id === result.undone.id);
        return {
          ...item,
          ...result.subject,
          logs: undoIndex < 0
            ? item.logs
            : [...item.logs.slice(0, undoIndex), ...item.logs.slice(undoIndex + 1)]
        };
      }));
      notify("Last attendance mark undone.");
      setModal((current) => current?.type === "history" && current.subject.id === subject.id
        ? { type: "history", subject: updatedSubject }
        : current);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not undo the last mark.");
    } finally {
      setBusyIds((ids) => ids.filter((id) => id !== subject.id));
    }
  }

  async function createSubject(values: { name: string; targetPercentage: number; attendedClasses: number; totalClasses: number }) {
    const result = await apiRequest<{ subject: Subject }>("/api/subjects", { method: "POST", body: values });
    setSubjects((current) => [...current, result.subject]);
    setModal(null);
    notify(`${result.subject.name} added.`);
  }

  async function updateSubject(subject: Subject, values: { name: string; targetPercentage: number }) {
    const result = await apiRequest<{ subject: Subject }>(`/api/subjects/${subject.id}`, { method: "PATCH", body: values });
    setSubjects((current) => current.map((item) => item.id === subject.id ? { ...item, ...result.subject } : item));
    setModal(null);
    notify("Subject details updated.");
  }

  async function deleteSubject(subject: Subject) {
    try {
      await apiRequest(`/api/subjects/${subject.id}`, { method: "DELETE" });
      setSubjects((current) => current.filter((item) => item.id !== subject.id));
      setModal(null);
      notify(`${subject.name} deleted.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not delete this subject.");
    }
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
      await router.push("/");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not log out.");
      setLoggingOut(false);
    }
  }

  if (loading) {
    return <main className="dashboard-loading"><span className="loading-spinner" /><p>Getting your semester in sync…</p></main>;
  }
  if (loadError) {
    return <main className="dashboard-loading"><Brand /><div className="load-error"><strong>We couldn’t load your dashboard.</strong><p>{loadError}</p><button className="button button-dark" onClick={() => window.location.reload()}>Try again</button></div></main>;
  }

  return (
    <>
      <Head><title>My Dashboard — ClasTrac</title><meta name="description" content="Your attendance, at a glance." /></Head>
      <main className="dashboard-page">
        <header className="dashboard-nav">
          <div className="dashboard-nav-inner">
            <Brand />
            <label className="nav-search"><Icon name="search" size={16} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subjects…" aria-label="Search subjects" /><kbd>⌘ K</kbd></label>
            <div className="dashboard-nav-right"><ThemeToggle /><span className="nav-separator" /><div className="user-greeting"><span className="user-avatar">{user?.name.slice(0, 1).toUpperCase() ?? "S"}</span><span>{user?.name.split(" ")[0] ?? "there"}</span></div><button className="logout-button" onClick={logout} disabled={loggingOut}>{loggingOut ? "Logging out…" : "Log out"} <span aria-hidden="true">↗</span></button></div>
          </div>
        </header>

        <div className="dashboard-main">
          <section className="dashboard-banner">
            <div className="banner-copy"><span className="banner-kicker">YOUR SEMESTER, IN SYNC</span><h1>Dashboard Overview</h1><p>Welcome back, {user?.name.split(" ")[0] ?? "there"}! Here’s what’s happening today.</p></div>
            <div className="banner-abstract banner-shape-one" /><div className="banner-abstract banner-shape-two" />
            <div className="banner-date">{new Intl.DateTimeFormat("en", { weekday: "long", month: "short", day: "numeric" }).format(new Date())}<span>✦</span></div>
          </section>

          <section className="metric-grid" aria-label="Attendance summary">
            <MetricCard label="TOTAL SUBJECTS" value={String(subjects.length)} detail="Your active courses" tone="blue" icon="▦" />
            <MetricCard label="CLASSES ATTENDED" value={String(totals.attended)} detail={`${totals.attended} of ${totals.classes} total classes`} tone="green" icon="✓" />
            <MetricCard label="OVERALL ATTENDANCE" value={`${totals.percentage.toFixed(1)}%`} detail={totals.classes ? totals.percentage >= 75 ? "Above your 75% baseline" : "Below the 75% baseline" : "Start logging classes"} tone="pink" icon="◔" />
            <MetricCard label="ON-TARGET SUBJECTS" value={`${totals.safe} / ${totals.tracked}`} detail={totals.tracked ? `${totals.shortage} subject${totals.shortage === 1 ? "" : "s"} need attention` : "Based on tracked classes"} tone="purple" icon="✦" />
          </section>

          <section className="analytics-grid" aria-label="Attendance analytics">
            <div className="analytics-panel trend-panel">
              <div className="analytics-heading"><div><span className="analytics-kicker">YOUR PROGRESS</span><h2>Attendance trend</h2></div><div className="range-toggle" aria-label="Trend range"><button className={trendRange === "week" ? "selected" : ""} onClick={() => setTrendRange("week")}>Weekly</button><button className={trendRange === "month" ? "selected" : ""} onClick={() => setTrendRange("month")}>Monthly</button></div></div>
              <AttendanceTrend subjects={subjects} range={trendRange} />
            </div>
            <div className="analytics-panel breakdown-panel">
              <div className="analytics-heading"><div><span className="analytics-kicker">SUBJECT BREAKDOWN</span><h2>Class attendance</h2></div><span className="chart-legend"><i /> Attended <i className="legend-absent" /> Missed</span></div>
              <SubjectBreakdown subjects={subjects} />
            </div>
          </section>

          <section className="subjects-section">
            <div className="subjects-heading"><div><span className="section-kicker">KEEP YOUR MOMENTUM</span><h2>Your subjects <span>{subjects.length}</span></h2></div><button className="button button-dark add-subject-button" onClick={() => setModal({ type: "add" })}><Icon name="plus" /> Add a subject</button></div>
            <div className="subject-toolbar"><span className="toolbar-note">{visibleSubjects.length} {visibleSubjects.length === 1 ? "subject" : "subjects"} in view</span></div>

            {subjects.length === 0 ? (
              <div className="empty-state"><div className="empty-illustration"><span>✳</span><i /><i /></div><span className="section-kicker">A CLEAN SLATE</span><h3>Every semester starts somewhere.</h3><p>Add your first subject and you’re ready to start tracking in one tap.</p><button className="button button-dark" onClick={() => setModal({ type: "add" })}><Icon name="plus" /> Add your first subject</button></div>
            ) : visibleSubjects.length === 0 ? (
              <div className="no-results"><span>⌕</span><h3>No subjects found</h3><p>Try another search, or clear the filter.</p><button className="text-button" onClick={() => setQuery("")}>Clear search</button></div>
            ) : (
              <div className="subject-grid">
                {visibleSubjects.map((subject, index) => {
                  const stats = getAttendanceStats(subject);
                  const busy = busyIds.includes(subject.id);
                  return (
                    <article className={`subject-card${busy ? " subject-busy" : ""}`} key={subject.id} style={{ animationDelay: `${index * 55}ms` }}>
                      <div className="subject-card-top"><div className="subject-title-wrap"><span className={`subject-monogram monogram-${index % 5}`}>{subject.name.trim().slice(0, 1).toUpperCase()}</span><div><h3>{subject.name}</h3><span className="subject-target">TARGET <b>{subject.targetPercentage}%</b></span></div></div><div className="subject-menu"><button className="icon-button" aria-label={`Edit ${subject.name}`} title="Edit subject" onClick={() => setModal({ type: "edit", subject })}><Icon name="edit" size={16} /></button><button className="icon-button icon-danger" aria-label={`Delete ${subject.name}`} title="Delete subject" onClick={() => setModal({ type: "delete", subject })}><Icon name="trash" size={16} /></button></div></div>
                      <div className="subject-stats"><div><strong className="subject-percent">{stats.percentage.toFixed(1)}<small>%</small></strong><span className="subject-attendance">{subject.attendedClasses} <i>/</i> {subject.totalClasses} classes</span></div>                      <div className={`subject-status-icon${subject.totalClasses === 0 ? " status-empty" : stats.isSafe ? "" : " status-alert"}`} aria-label={subject.totalClasses === 0 ? "No classes recorded" : stats.isSafe ? "On target" : "Below target"}>{subject.totalClasses === 0 ? "·" : stats.isSafe ? "✓" : "!"}</div></div>
                      <div className={`subject-progress ${stats.isSafe ? "is-safe" : "is-low"}`}><span style={{ width: `${Math.min(stats.percentage, 100)}%` }} /></div>
                      <div className={`subject-helper ${subject.totalClasses === 0 ? "helper-neutral" : stats.isSafe ? "helper-safe" : "helper-low"}`}><span aria-hidden="true">{subject.totalClasses === 0 ? "✳" : stats.isSafe ? "↗" : "!"}</span>{stats.message}</div>
                      <div className="subject-actions"><button className="button button-card-present" disabled={busy} onClick={() => void markAttendance(subject, "Present")}><span>＋</span> Present</button><button className="button button-card-absent" disabled={busy} onClick={() => void markAttendance(subject, "Absent")}><span>＋</span> Absent</button></div>
                      <div className="subject-card-footer"><button onClick={() => setModal({ type: "history", subject })}><Icon name="clock" size={15} /> History <span className="log-count">{subject.logs.length}</span></button><button disabled={busy || subject.logs.length === 0} onClick={() => void undoAttendance(subject)}><Icon name="undo" size={15} /> Undo last</button><span className="saving-indicator">{busy ? "Saving…" : ""}</span></div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
          <footer className="dashboard-footer"><Brand /><span>Keep it simple. Keep showing up.</span><Link href="/">Back to home ↑</Link></footer>
        </div>
      </main>

      {modal?.type === "add" && <SubjectFormModal title="Add a subject" description="A few details, then you’re ready to go." onClose={() => setModal(null)} onSubmit={createSubject} />}
      {modal?.type === "edit" && <SubjectFormModal title="Edit subject" description="Keep the details up to date." subject={modal.subject} onClose={() => setModal(null)} onSubmit={(values) => updateSubject(modal.subject, values)} />}
      {modal?.type === "history" && <HistoryModal subject={subjects.find((item) => item.id === modal.subject.id) ?? modal.subject} busy={busyIds.includes(modal.subject.id)} onClose={() => setModal(null)} onMark={(status, date) => void markAttendance(modal.subject, status, date)} />}
      {modal?.type === "delete" && <ConfirmDeleteModal subject={modal.subject} onClose={() => setModal(null)} onDelete={() => void deleteSubject(modal.subject)} />}
      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
    </>
  );
}

function MetricCard({ label, value, detail, tone, icon }: {
  label: string; value: string; detail: string; tone: "blue" | "green" | "pink" | "purple"; icon: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-copy"><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-detail">{detail}</span></div>
      <span className={`metric-icon metric-${tone}`} aria-hidden="true">{icon}</span>
    </article>
  );
}

function AttendanceTrend({ subjects, range }: { subjects: Subject[]; range: "week" | "month" }) {
  const entries = subjects.flatMap((subject) => subject.logs)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const cutoff = new Date(`${todayString()}T00:00:00`);
  cutoff.setDate(cutoff.getDate() - (range === "week" ? 6 : 29));
  const cutoffDate = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}-${String(cutoff.getDate()).padStart(2, "0")}`;
  const selected = entries.filter((log) => log.date >= cutoffDate);
  let attended = entries.filter((log) => log.date < cutoffDate && log.status === "Present").length;
  let total = entries.filter((log) => log.date < cutoffDate).length;
  const points = selected.map((log, index) => {
    total += 1;
    if (log.status === "Present") attended += 1;
    const value = total ? attended / total * 100 : 0;
    const x = selected.length === 1 ? 285 : 42 + index * (486 / (selected.length - 1));
    return { x, y: 184 - value * 1.52, value, date: log.date, status: log.status };
  });
  const line = points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const area = points.length ? `${line} L ${points[points.length - 1].x} 188 L ${points[0].x} 188 Z` : "";

  if (!entries.length) {
    return     <div className="chart-empty"><span>◌</span><strong>No classes logged in this {range} yet.</strong><small>Mark attendance to see your progress here.</small></div>;
  }

  return (
    <div className="trend-chart-wrap">
      <svg className="trend-chart" viewBox="0 0 560 220" role="img" aria-label={`${range === "week" ? "Weekly" : "Monthly"} cumulative attendance trend`}>
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = 184 - tick * 1.52;
          return <g key={tick}><line className="chart-gridline" x1="38" x2="540" y1={y} y2={y} /><text className="chart-axis-label" x="28" y={y + 3} textAnchor="end">{tick}</text></g>;
        })}
        {area && <path className="trend-area" d={area} />}
        {line && <path className="trend-line" d={line} />}
        {points.map((point) => <circle key={`${point.date}-${point.x}`} className={`trend-point ${point.status === "Present" ? "point-present" : "point-absent"}`} cx={point.x} cy={point.y} r="3.2"><title>{`${formatDate(point.date)} · ${point.status} · ${point.value.toFixed(1)}% cumulative`}</title></circle>)}
        {points.filter((_, index) => index === 0 || index === points.length - 1 || index === Math.floor(points.length / 2)).map((point, index) => <text key={`${point.date}-label-${index}`} className="chart-date-label" x={point.x} y="211" textAnchor={index === 0 ? "start" : index === 2 ? "end" : "middle"}>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${point.date}T00:00:00`))}</text>)}
      </svg>
      <div className="trend-footnote"><span><i /> Cumulative attendance</span><span>{selected.length} recent class{selected.length === 1 ? "" : "es"} logged</span></div>
    </div>
  );
}

function SubjectBreakdown({ subjects }: { subjects: Subject[] }) {
  const sorted = [...subjects].sort((a, b) => b.totalClasses - a.totalClasses).slice(0, 5);
  if (!sorted.length) {
    return <div className="chart-empty breakdown-empty"><span>▤</span><strong>Your subjects, side by side.</strong><small>Add subjects and log classes to compare attendance.</small></div>;
  }
  return (
    <div className="breakdown-chart">
      {sorted.map((subject, index) => {
        const missed = Math.max(0, subject.totalClasses - subject.attendedClasses);
        const percentage = subject.totalClasses ? subject.attendedClasses / subject.totalClasses * 100 : 0;
        return (
          <div className="breakdown-row" key={subject.id}>
            <div className="breakdown-title"><span className={`breakdown-dot dot-${index}`} /><span title={subject.name}>{subject.name}</span><strong>{percentage.toFixed(0)}%</strong></div>
            <div className="breakdown-track" role="img" aria-label={`${subject.name}: ${subject.attendedClasses} attended, ${missed} missed`}><span className={`breakdown-attended bar-${index}`} style={{ width: `${subject.totalClasses ? percentage : 0}%` }} /><span className="breakdown-missed" style={{ width: `${subject.totalClasses ? missed / subject.totalClasses * 100 : 0}%` }} /></div>
          </div>
        );
      })}
      <div className="breakdown-scale"><span>0 classes</span><span>Proportion attended</span><span>100%</span></div>
    </div>
  );
}

function ModalFrame({ title, description, onClose, children, size = "" }: {
  title: string; description: string; onClose: () => void; children: React.ReactNode; size?: string;
}) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal-panel ${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading"><div><span className="section-kicker">CLASTRAC</span><h2 id="modal-title">{title}</h2><p>{description}</p></div><button className="icon-button modal-close" onClick={onClose} aria-label="Close dialog"><Icon name="close" /></button></div>
        {children}
      </section>
    </div>
  );
}

function SubjectFormModal({ title, description, subject, onClose, onSubmit }: {
  title: string; description: string; subject?: Subject; onClose: () => void;
  onSubmit: (values: { name: string; targetPercentage: number; attendedClasses: number; totalClasses: number }) => Promise<void>;
}) {
  const [name, setName] = useState(subject?.name ?? "");
  const [target, setTarget] = useState(String(subject?.targetPercentage ?? 75));
  const [attended, setAttended] = useState("0");
  const [total, setTotal] = useState("0");
  const [showBaseline, setShowBaseline] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const targetNumber = Number(target);
    const attendedNumber = subject ? subject.attendedClasses : Number(attended);
    const totalNumber = subject ? subject.totalClasses : Number(total);
    if (!Number.isFinite(targetNumber) || targetNumber < 50 || targetNumber > 100) {
      setError("Choose a target between 50% and 100%.");
      return;
    }
    if (!Number.isInteger(attendedNumber) || !Number.isInteger(totalNumber) || attendedNumber < 0 || totalNumber < 0 || attendedNumber > totalNumber) {
      setError("Class counts must be whole numbers, and attended classes can’t exceed total classes.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({ name: name.trim(), targetPercentage: targetNumber, attendedClasses: attendedNumber, totalClasses: totalNumber });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save this subject.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalFrame title={title} description={description} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <label className="field-label">Subject name<input autoFocus className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Computer Networks" maxLength={100} required /></label>
        <label className="field-label">Attendance target
          <span className="input-suffix-wrap"><input className="text-input" type="number" min="50" max="100" step="1" value={target} onChange={(event) => setTarget(event.target.value)} required /><span>%</span></span>
          <small className="field-hint">Set a personal target for this subject.</small>
        </label>
        {!subject && <div className="baseline-section"><button type="button" className="baseline-toggle" onClick={() => setShowBaseline((visible) => !visible)}><span className="baseline-plus">{showBaseline ? "−" : "+"}</span><span>Starting mid-semester?<small>Add your current class counts</small></span><span className="baseline-chevron">{showBaseline ? "−" : "＋"}</span></button>
          {showBaseline && <div className="baseline-inputs"><label className="field-label">Attended<input className="text-input" type="number" min="0" max="1000000" step="1" value={attended} onChange={(event) => setAttended(event.target.value)} /></label><label className="field-label">Total classes<input className="text-input" type="number" min="0" max="1000000" step="1" value={total} onChange={(event) => setTotal(event.target.value)} /></label></div>}
        </div>}
        {subject && <div className="edit-count-note"><span>↗</span> Attendance counts are updated by marking or undoing classes.</div>}
        {error && <div className="form-error" role="alert"><span>!</span>{error}</div>}
        <div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose} disabled={saving}>Cancel</button><button type="submit" className="button button-dark" disabled={saving}>{saving ? "Saving…" : subject ? "Save changes" : "Create subject"} <Icon name="arrow" size={16} /></button></div>
      </form>
    </ModalFrame>
  );
}

function HistoryModal({ subject, busy, onClose, onMark }: {
  subject: Subject; busy: boolean; onClose: () => void; onMark: (status: "Present" | "Absent", date: string) => void;
}) {
  const [date, setDate] = useState(todayString());
  const [status, setStatus] = useState<"Present" | "Absent">("Present");
  const logs = [...subject.logs].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <ModalFrame title="Attendance history" description={`${subject.name} · ${subject.attendedClasses} of ${subject.totalClasses} classes attended`} onClose={onClose} size="modal-wide">
      <div className="history-list">
        {logs.length === 0 ? <div className="history-empty"><span>◷</span><p>No classes logged yet.</p><small>Your attendance history will show up here.</small></div> :
          logs.map((log) => <div className="history-row" key={log.id}><span className="history-date-icon"><Icon name="clock" size={16} /></span><span className="history-date">{formatDate(log.date)}</span><span className={`history-badge ${log.status === "Present" ? "badge-present" : "badge-absent"}`}><i />{log.status}</span></div>)}
      </div>
      <form className="add-past-session" onSubmit={(event) => { event.preventDefault(); onMark(status, date); }}>
        <div className="past-heading"><span className="section-kicker">MISSED A DAY?</span><h3>Add a past class</h3></div>
        <div className="past-fields"><label className="field-label">Class date<input className="text-input" type="date" value={date} max={todayString()} onChange={(event) => setDate(event.target.value)} required /></label><label className="field-label">Attendance<select className="text-input" value={status} onChange={(event) => setStatus(event.target.value as "Present" | "Absent")}><option value="Present">Present</option><option value="Absent">Absent</option></select></label><button className="button button-dark" type="submit" disabled={busy || !date}>{busy ? "Saving…" : "Add class"} <Icon name="arrow" size={16} /></button></div>
        <p className="history-footnote">To remove a mark, use “Undo last” on the subject card. Individual history entries can’t be deleted yet.</p>
      </form>
    </ModalFrame>
  );
}

function ConfirmDeleteModal({ subject, onClose, onDelete }: { subject: Subject; onClose: () => void; onDelete: () => void }) {
  return (
    <ModalFrame title="Remove this subject?" description="This action can’t be undone." onClose={onClose}>
      <div className="delete-warning"><span className="delete-warning-icon"><Icon name="trash" /></span><p><strong>{subject.name}</strong> and its attendance history will be permanently deleted.</p></div>
      <div className="modal-actions"><button className="button button-quiet" onClick={onClose}>Keep subject</button><button className="button button-delete" onClick={onDelete}>Delete subject <Icon name="trash" size={16} /></button></div>
    </ModalFrame>
  );
}
