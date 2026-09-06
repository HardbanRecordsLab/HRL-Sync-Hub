import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User, Shield, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Shield },
];

export default function Settings() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "profile");

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="hrl-title text-5xl mb-1">SETTINGS</h1>
          <p className="hrl-label text-muted-foreground">Account configuration</p>
        </div>

        <div className="flex gap-6">
          <div className="w-[160px] shrink-0 space-y-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-2.5 w-full rounded px-3 py-2 text-left transition hrl-nav-link",
                  tab === id
                    ? "bg-violet-500/15 text-violet-400 border border-violet-500/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/4"
                )}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />{label}
              </button>
            ))}
          </div>

          <div className="flex-1 hrl-card p-6">
            {tab === "profile" && <ProfileTab />}
            {tab === "security" && <SecurityTab />}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function ProfileTab() {
  const { data, isLoading } = useQuery({ queryKey: ["me"], queryFn: () => api.get<any>("/api/auth/me") });
  const [form, setForm] = useState({ full_name: "", company_name: "" });
  const [initialized, setInitialized] = useState(false);

  if (!initialized && data?.user) {
    setForm({ full_name: data.user.full_name ?? "", company_name: data.user.company_name ?? "" });
    setInitialized(true);
  }

  const mut = useMutation({
    mutationFn: () => api.patch("/api/auth/me", form),
    onSuccess: () => toast.success("Profile updated"),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <h2 className="hrl-title text-2xl">PROFILE</h2>
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="hrl-label mb-1.5 block">Full Name</Label>
              <Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <Label className="hrl-label mb-1.5 block">Company / Label</Label>
              <Input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} placeholder="Hardban Records" />
            </div>
          </div>
          <div>
            <Label className="hrl-label mb-1.5 block">Email</Label>
            <Input value={data?.user?.email ?? ""} disabled className="opacity-60" />
            <p className="text-[11px] text-muted-foreground mt-1">Email cannot be changed</p>
          </div>
          <Button className="hrl-btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
            Save Profile
          </Button>
        </>
      )}
    </div>
  );
}

function SecurityTab() {
  const [form, setForm] = useState({ current_password: "", new_password: "", confirm: "" });
  const mut = useMutation({
    mutationFn: () => {
      if (form.new_password !== form.confirm) throw new Error("Passwords do not match");
      if (form.new_password.length < 8) throw new Error("Password must be at least 8 characters");
      return api.post("/api/auth/change-password", {
        current_password: form.current_password,
        new_password: form.new_password,
      });
    },
    onSuccess: () => { toast.success("Password changed"); setForm({ current_password: "", new_password: "", confirm: "" }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="space-y-5">
      <h2 className="hrl-title text-2xl">SECURITY</h2>
      <div className="space-y-4 max-w-sm">
        <div>
          <Label className="hrl-label mb-1.5 block">Current Password</Label>
          <Input type="password" value={form.current_password} onChange={(e) => setForm((f) => ({ ...f, current_password: e.target.value }))} />
        </div>
        <div>
          <Label className="hrl-label mb-1.5 block">New Password</Label>
          <Input type="password" value={form.new_password} onChange={(e) => setForm((f) => ({ ...f, new_password: e.target.value }))} />
        </div>
        <div>
          <Label className="hrl-label mb-1.5 block">Confirm New Password</Label>
          <Input
            type="password"
            value={form.confirm}
            onChange={(e) => setForm((f) => ({ ...f, confirm: e.target.value }))}
            className={form.confirm && form.confirm !== form.new_password ? "border-violet-500/50" : ""}
          />
        </div>
        <Button
          className="hrl-btn-primary"
          onClick={() => mut.mutate()}
          disabled={!form.current_password || !form.new_password || mut.isPending}
        >
          {mut.isPending ? <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> : null}
          Change Password
        </Button>
      </div>
    </div>
  );
}
