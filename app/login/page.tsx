"use client";
import { useState } from "react";
import { api, Button, Field, inputCls, Notice } from "../components/ui";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await api("/api/auth/login", { method: "POST", json: { username, password } });
      window.location.href = "/";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-gradient-to-br from-slate-50 to-indigo-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-indigo-600 font-bold text-white">TD</div>
          <h1 className="text-xl font-semibold text-slate-900">Trade DB</h1>
          <p className="text-sm text-slate-500">Trading and market surveillance</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Field label="Username">
            <input className={inputCls} value={username} onChange={(e) => setUsername(e.target.value)} autoFocus autoComplete="username" />
          </Field>
          <Field label="Password">
            <input className={inputCls} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          {error && <Notice>{error}</Notice>}
          <Button className="w-full" disabled={busy || !username || !password}>{busy ? "Signing in…" : "Sign in"}</Button>
          <p className="text-xs leading-relaxed text-slate-500">
            Demo accounts: <b>trader1</b>–<b>trader5</b> (one per strategy) and <b>compliance</b>.
            Passwords are set in <code>.env.local</code>.
          </p>
        </form>
      </div>
    </main>
  );
}
