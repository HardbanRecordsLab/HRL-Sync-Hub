import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Settings as SettingsIcon, User, HardDrive, Bell, Shield, Loader2, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import Layout from "@/components/Layout";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "profile",       label: "Profile",       icon: User },
  { id: "integrations",  label: "Integrations",  icon: HardDrive },
  { id: "security",      label: "Security",       icon: Shield },
];

export default function Settings() {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(params.get("tab") || "profile");

  const driveStatus = params.get("drive");
  const showDriveMsg = driveStatus === "connected" || driveStatus === "error";

  return (
    <Layout>
      <div className="animate-fade-in space-y-6">
        <div>
          <h1 className="hrl-title text-5xl mb-1">SETTINGS</h1>
          <p className="hrl-label text-muted-foreground">Account and integration configuration</p>
        </div>

        {showDriveMsg && (
          <div className={cn(
            "flex items-center gap-2 p-3 rounded border text-sm",
            driveStatus === "connected" ? "border-green-500/30 bg-green-500/8 text-green-400" : "border-red-500/30 bg-red-500/8 text-red-400"
          )}>
            {driveStatus === "connected" ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {driveStatus === "connected" ? "Google Drive connected successfully." : "Failed to connect Google Drive. Please try again."}
          </div>
        )}

        <div className="flex gap-6">
          {/* Tab nav */}
          <div className="w-[160px] shrink-0 space-y-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  "flex items-center gap-2.5 w-full rounded px-3 py-2 text-left transition hrl-nav-link",
                  tab === id
                    ? "bg-red-500/15 text-red-400 border border-red-500/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/4"
                )}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />{label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 hrl-card p-6">
            {tab === "profile"      && <ProfileTab />}
            {tab === "integrations" && <IntegrationsTab />}
            {tab === "security"     && <SecurityTab />}
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
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <Label className="hrl-label mb-1.5 block">Company / Label</Label>
              <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Hardban Records" />
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

function IntegrationsTab() {
  const { data: driveStatus, isLoading, refetch } = useQuery({
    queryKey: ["drive-status"],
    queryFn: () => api.get<any>("/api/drive/status"),
  });

  const connectMut = useMutation({
    mutationFn: async () => {
      const { url } = await api.get<any>("/api/drive/auth-url");
      window.location.href = url;
    },
  });

  const disconnectMut = useMutation({
    mutationFn: () => api.delete("/api/drive/disconnect"),
    onSuccess: () => { refetch(); toast.success("Google Drive disconnected"); },
  });

  return (
    <div className="space-y-6">
      <h2 className="hrl-title text-2xl">INTEGRATIONS</h2>

      {/* Google Drive */}
      <div className="p-4 rounded border border-border bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded border border-border flex items-center justify-center bg-card">
              <HardDrive className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">Google Drive</p>
              <p className="hrl-label text-muted-foreground">Primary file storage for audio tracks</p>
            </div>
          </div>
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : (
            driveStatus?.connected ? (
              <div className="flex items-center gap-2">
                <span className="hrl-badge-red flex items-center gap-1"><Check className="w-2.5 h-2.5" /> Connected</span>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => disconnectMut.mutate()} disabled={disconnectMut.isPending}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button className="hrl-btn-primary h-8 text-xs" onClick={() => connectMut.mutate()} disabled={connectMut.isPending}>
                {connectMut.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                Connect Drive
              </Button>
            )
          )}
        </div>
        {driveStatus?.tokenExpired && (
          <div className="mt-3 flex items-center gap-2 text-xs text-yellow-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            Token expired — please reconnect to restore audio streaming.
          </div>
        )}
        {!driveStatus?.connected && (
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground">
            {["Stream audio on demand", "Zero file copies on VPS", "Sync lyrics from Docs"].map(t => (
              <div key={t} className="flex items-center gap-1.5"><Check className="w-3 h-3 text-green-400 shrink-0" />{t}</div>
            ))}
          </div>
        )}
      </div>
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
          <Input type="password" value={form.current_password} onChange={e => setForm(f => ({ ...f, current_password: e.target.value }))} />
        </div>
        <div>
          <Label className="hrl-label mb-1.5 block">New Password</Label>
          <Input type="password" value={form.new_password} onChange={e => setForm(f => ({ ...f, new_password: e.target.value }))} />
        </div>
        <div>
          <Label className="hrl-label mb-1.5 block">Confirm New Password</Label>
          <Input
            type="password"
            value={form.confirm}
            onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
            className={form.confirm && form.confirm !== form.new_password ? "border-red-500/50" : ""}
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
