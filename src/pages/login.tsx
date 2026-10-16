import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { FormEvent, useEffect, useState } from "react";
import Brand from "@/components/Brand";
import ThemeToggle from "@/components/ThemeToggle";
import { ApiError, apiRequest, User } from "@/lib/client-api";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    setMode(router.query.mode === "signup" ? "signup" : "login");
    let cancelled = false;
    apiRequest<{ user: User }>("/api/auth/me")
      .then(() => {
        if (!cancelled) void router.replace("/dashboard");
      })
      .catch((requestError: unknown) => {
        if (cancelled || (requestError instanceof ApiError && requestError.status === 401)) return;
        setError(requestError instanceof Error ? requestError.message : "Could not verify your session. Please try again.");
      });
    return () => { cancelled = true; };
  }, [router.isReady, router.query.mode, router]);

  function changeMode(next: "login" | "signup") {
    setMode(next);
    setError("");
    void router.replace(next === "signup" ? "/login?mode=signup" : "/login", undefined, { shallow: true });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const body = mode === "signup" ? { name, email, password } : { email, password };
      await apiRequest<{ user: User }>(`/api/auth/${mode === "signup" ? "signup" : "login"}`, {
        method: "POST",
        body
      });
      await router.push("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>{`${mode === "signup" ? "Create your account" : "Welcome back"} — ClasTrac`}</title>
        <meta name="description" content="Log in or create your free ClasTrac account." />
      </Head>
      <main className="auth-page">
        <div className="auth-decoration auth-decoration-one" />
        <div className="auth-decoration auth-decoration-two" />
        <header className="auth-nav"><Brand /><div className="auth-nav-actions"><ThemeToggle /><Link href="/" className="auth-back">← Back home</Link></div></header>
        <div className="auth-layout">
          <section className="auth-aside">
            <div className="eyebrow"><span className="eyebrow-dot" /> A BETTER WAY TO KEEP COUNT</div>
            <h1>Make room<br />for <span>what matters.</span></h1>
            <p>Your classes are happening. Keep track of them without letting the tracking take over.</p>
            <div className="auth-aside-note"><span>“</span><div><p>Turns out, knowing where I stand makes showing up a whole lot easier.</p><small>— A student, probably you soon</small></div></div>
          </section>
          <section className="auth-card">
            <div className="auth-card-heading">
              <span className="auth-card-kicker">{mode === "signup" ? "YOUR FRESH START" : "GOOD TO SEE YOU"}</span>
              <h2>{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
              <p>{mode === "signup" ? "A little less admin starts right here." : "Pick up right where you left off."}</p>
            </div>
            <div className="auth-tabs" role="tablist" aria-label="Account access">
              <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => changeMode("login")}>Log in</button>
              <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => changeMode("signup")}>Sign up</button>
            </div>
            <form className="form-stack" onSubmit={submit}>
              {mode === "signup" && (
                <label className="field-label">Full name
                  <input className="text-input" type="text" autoComplete="name" placeholder="What should we call you?" value={name} onChange={(event) => setName(event.target.value)} maxLength={100} required />
                </label>
              )}
              <label className="field-label">Email address
                <input className="text-input" type="email" autoComplete="email" placeholder="you@university.edu" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required />
              </label>
              <label className="field-label">Password
                <input className="text-input" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={mode === "signup" ? 8 : 1} maxLength={72} required />
              </label>
              {error && <div className="form-error" role="alert"><span>!</span>{error}</div>}
              <button className="button button-dark auth-submit" type="submit" disabled={submitting}>
                {submitting ? "One moment…" : mode === "signup" ? "Create my account" : "Log in"} <span aria-hidden="true">→</span>
              </button>
            </form>
            <p className="auth-terms">By continuing, you agree to keep showing up for yourself. <span>✳</span></p>
          </section>
        </div>
        <footer className="auth-footer"><span>© ClasTrac</span><span>Keep it simple. Keep showing up.</span><Link href="/">Home</Link></footer>
      </main>
    </>
  );
}
