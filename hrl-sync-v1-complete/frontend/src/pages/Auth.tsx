import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, Music2 } from "lucide-react";

export default function Auth() {
  const [mode, setMode]     = useState<"login" | "register">("login");
  const [email, setEmail]   = useState("");
  const [pass, setPass]     = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password: pass });
        if (error) throw error;
        toast.success("Check your email to confirm your account");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      {/* Background grid is in CSS */}
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 mx-auto mb-5 rounded border border-red-500/40 flex items-center justify-center bg-red-500/8">
            <Music2 className="w-7 h-7 text-red-500" />
          </div>
          <h1 className="hrl-title text-5xl text-foreground tracking-wider">HRL SYNC</h1>
          <p className="hrl-label mt-1" style={{ color: "var(--hrl-red)", letterSpacing: "0.15em" }}>
            HARDBAN RECORDS LAB
          </p>
        </div>

        {/* Card */}
        <div className="hrl-card p-7">
          {/* Tabs */}
          <div className="flex rounded border border-border overflow-hidden mb-6">
            {(["login", "register"] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 hrl-label text-xs transition ${mode === m ? "bg-red-500/15 text-red-400" : "text-muted-foreground hover:text-foreground"}`}
              >
                {m === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            <div>
              <Label className="hrl-label mb-1.5 block">Email</Label>
              <Input
                type="email"
                placeholder="you@hardbanrecords.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                autoComplete="email"
              />
            </div>
            <div>
              <Label className="hrl-label mb-1.5 block">Password</Label>
              <Input
                type="password"
                placeholder={mode === "register" ? "Min 8 characters" : "••••••••"}
                value={pass}
                onChange={e => setPass(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submit()}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
              />
            </div>
            <Button
              className="hrl-btn-primary w-full py-2.5"
              disabled={!email || !pass || loading}
              onClick={submit}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : mode === "login" ? "SIGN IN" : "CREATE ACCOUNT"}
            </Button>
          </div>
        </div>

        <p className="hrl-label text-muted-foreground text-center mt-5">
          Internal platform — Hardban Records Lab
        </p>
      </div>
    </div>
  );
}
