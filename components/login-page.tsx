"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LogIn, UserPlus } from "lucide-react";
import BokaNav from "@/components/boka-nav";

type AuthMode = "login" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") || "/bookings";
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const copy = useMemo(
    () =>
      mode === "signup"
        ? {
            eyebrow: "Nytt konto",
            title: "Skapa konto",
            action: "Skapa konto",
            switchText: "Har du redan konto?",
            switchAction: "Logga in",
            icon: <UserPlus size={17} />,
          }
        : {
            eyebrow: "Mitt konto",
            title: "Logga in",
            action: "Logga in",
            switchText: "Ny på Bokabana?",
            switchAction: "Skapa konto",
            icon: <LogIn size={17} />,
          },
    [mode],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, mode }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        throw new Error(body?.message || "Kunde inte logga in.");
      }
      router.push(returnTo.startsWith("/") ? returnTo : "/bookings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="page-shell warm">
      <BokaNav current="login" />
      <section className="account-hero">
        <div className="container">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
        </div>
      </section>

      <section className="container narrow auth-wrap">
        <form className="booking-panel auth-panel" onSubmit={submit}>
          <div className="auth-mode">
            <button className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")} type="button">
              Logga in
            </button>
            <button className={mode === "signup" ? "selected" : ""} onClick={() => setMode("signup")} type="button">
              Skapa konto
            </button>
          </div>

          <div className="form-grid single">
            {mode === "signup" ? (
              <label>
                Namn
                <input
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </label>
            ) : null}
            <label>
              E-post
              <input
                autoComplete="email"
                required
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              />
            </label>
            <label>
              Lösenord
              <input
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                minLength={mode === "signup" ? 8 : undefined}
                required
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              />
            </label>
          </div>

          {error ? <div className="notice error">{error}</div> : null}

          <button className="btn dark full" disabled={loading} type="submit">
            {copy.icon}
            {loading ? "Vänta..." : copy.action}
          </button>

          <p className="auth-switch">
            {copy.switchText}{" "}
            <button onClick={() => setMode(mode === "signup" ? "login" : "signup")} type="button">
              {copy.switchAction}
            </button>
          </p>
        </form>
      </section>
    </main>
  );
}
