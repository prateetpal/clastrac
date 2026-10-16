import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import { getAttendanceStats } from "@/lib/client-api";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";

export default function HomePage() {
  const [attended, setAttended] = useState(18);
  const [total, setTotal] = useState(22);
  const stats = getAttendanceStats({ attendedClasses: attended, totalClasses: total, targetPercentage: 75 });

  return (
    <>
      <Head>
        <title>ClasTrac — Attendance, without the headache</title>
        <meta name="description" content="Track class attendance, know where you stand, and stay on top of every subject." />
      </Head>
      <main className="landing">
        <nav className="site-nav page-shell">
          <Brand />
          <div className="nav-actions">
            <ThemeToggle />
            <Link href="/login" className="nav-login">Log in</Link>
            <Link href="/login?mode=signup" className="button button-dark nav-cta">Start tracking <span aria-hidden="true">↗</span></Link>
          </div>
        </nav>

        <section className="hero page-shell">
          <div className="hero-copy">
            <div className="eyebrow"><span className="eyebrow-dot" /> YOUR SEMESTER, IN SYNC</div>
            <h1>Show up.<br /><span>Stay on track.</span></h1>
            <p className="hero-description">A little clarity goes a long way. Track each class in a tap, see exactly where you stand, and know when you can take a breather.</p>
            <div className="hero-actions">
              <Link href="/login?mode=signup" className="button button-dark button-large">Get started <span aria-hidden="true">→</span></Link>
              <span className="hero-note"><span aria-hidden="true">✳</span> Free, focused, and made for students</span>
            </div>
            <div className="hero-proof">
              <div className="avatar-stack" aria-hidden="true"><span>A</span><span>M</span><span>R</span><span>+</span></div>
              <p><strong>A calmer semester starts here.</strong><br />No spreadsheets. No guesswork.</p>
            </div>
          </div>

          <div className="hero-visual">
            <div className="visual-orbit orbit-one" />
            <div className="visual-orbit orbit-two" />
            <div className="preview-card">
              <div className="preview-topline"><span className="preview-label">YOUR ATTENDANCE</span><span className="live-indicator"><i /> LIVE</span></div>
              <div className="preview-subject">Data Structures<span className="preview-dots">···</span></div>
              <div className="preview-score-row">
                <div><strong className="preview-score">{stats.percentage.toFixed(1)}<small>%</small></strong><span className="preview-muted">current attendance</span></div>
                <div className="preview-fraction"><strong>{attended}<span> / {total}</span></strong><small>classes attended</small></div>
              </div>
              <div className="progress-track"><span className={stats.isSafe ? "progress-safe" : "progress-low"} style={{ width: `${Math.min(stats.percentage, 100)}%` }} /></div>
              <div className={`preview-status ${stats.isSafe ? "status-safe" : "status-low"}`}>
                <span aria-hidden="true">{stats.isSafe ? "✓" : "!"}</span>{stats.message}
              </div>
              <div className="preview-divider" />
              <div className="preview-actions">
                <button type="button" className="button button-present" onClick={() => { setAttended((value) => value + 1); setTotal((value) => value + 1); }}>＋ Present</button>
                <button type="button" className="button button-absent" onClick={() => setTotal((value) => value + 1)}>＋ Absent</button>
              </div>
              <div className="preview-foot"><span>Try it out — your data stays yours</span><span aria-hidden="true">↗</span></div>
            </div>
            <div className="float-note"><span className="float-icon">✦</span><div><strong>One tap is all it takes</strong><small>Every class, accounted for.</small></div></div>
            <div className="scribble" aria-hidden="true">your semester,<br />looking good <span>↗</span></div>
          </div>
        </section>

        <section className="landing-bottom page-shell">
          <div className="bottom-line" />
          <div className="bottom-content"><span>LESS ADMIN, MORE LEARNING</span><p>Simple by design. Helpful by nature.</p></div>
          <div className="bottom-features"><span><i>✓</i> One-tap tracking</span><span><i>✓</i> Clear, honest insights</span><span><i>✓</i> Always free</span></div>
        </section>
      </main>
    </>
  );
}
