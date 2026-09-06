import { useState, FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // AuthProvider flips isAuthenticated → App swaps to the dashboard.
    } catch (e) {
      setErr((e as Error).message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="HRL Sync Hub" className="w-44 mx-auto mb-5 object-contain rounded-2xl bg-white/95 p-3 shadow-[0_0_40px_-8px_rgba(139,92,246,0.5)]" />
          <p className="hrl-label hrl-gradient-text" style={{ letterSpacing: "0.2em" }}>
            HARDBAN RECORDS LAB
          </p>
        </div>

        <form onSubmit={onSubmit} className="hrl-card p-6 space-y-4">
          <div>
            <Label className="hrl-label mb-1.5 block">Email</Label>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <Label className="hrl-label mb-1.5 block">Password</Label>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {err && (
            <p className="text-sm text-violet-400 bg-violet-500/10 border border-violet-500/20 rounded px-3 py-2">{err}</p>
          )}

          <button
            type="submit"
            className="hrl-btn-primary w-full rounded py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-60"
            disabled={submitting || !email || !password}
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Sign In
          </button>
        </form>

        <p className="hrl-label text-muted-foreground text-center mt-6 opacity-50 text-[10px] tracking-widest">
          Private library · accounts are created by an administrator
        </p>
      </div>
    </div>
  );
}
