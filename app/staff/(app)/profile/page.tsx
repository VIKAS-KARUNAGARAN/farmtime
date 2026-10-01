"use client";
import { useState } from "react";
import { KeyRound, Loader2, Phone } from "lucide-react";
import { Avatar, Badge, Button, CardHead, ErrorState, Modal, PageHeader, PageLoading, Toast, statusTone } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/lib/format";

type Profile = {
  name: string;
  email: string;
  initials: string;
  position: string;
  station: string;
  employment: string;
  status: string;
  roles: string[];
  emergency: { name: string; phone: string } | null;
  passwordChangedDaysAgo: number | null;
};

export default function ProfilePage() {
  const { data, error, loading, reload } = useApi<Profile>("/api/me/profile");
  const { toast, show } = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading && !data) return <PageLoading rows={2} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;
  const a = data;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/me/profile/emergency", { method: "PATCH", body: { name, phone } });
      setEditing(false);
      show("Emergency contact updated");
      reload();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const [pwOpen, setPwOpen] = useState(false);
  const [cur, setCur] = useState("");
  const [nextPw, setNextPw] = useState("");
  const [pwErr, setPwErr] = useState<string | null>(null);
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (nextPw.length < 10) return setPwErr("Use at least 10 characters.");
    setBusy(true);
    setPwErr(null);
    try {
      await api("/api/auth/password", { body: { current: cur, next: nextPw } });
      setPwOpen(false);
      setCur("");
      setNextPw("");
      show("Password changed · other devices signed out");
    } catch (e) {
      setPwErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const rows = [
    ["Email", a.email],
    ["Position", a.position],
    ["Home station", a.station],
    ["Employment", a.employment],
    ["Access", a.roles.map((r) => (r === "admin" ? "Admin" : "Staff")).join(" + ")],
  ];
  return (
    <div>
      <PageHeader eyebrow="Profile" title="My details" />
      <div className="grid gap-6 md:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
        <section className="card">
          <div className="flex items-center gap-4 border-b border-line p-5">
            <Avatar initials={a.initials} tone="staff" size="lg" />
            <div>
              <p className="font-semibold">{a.name}</p>
              <p className="text-sm text-muted">{a.position}</p>
            </div>
            <Badge tone={statusTone(a.status)} className="ml-auto">{a.status}</Badge>
          </div>
          <dl className="divide-y divide-line text-sm">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-5 py-3"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
            ))}
          </dl>
        </section>
        <div className="space-y-6">
          <section className="card">
            <CardHead title="Emergency contact" />
            <div className="flex items-center justify-between gap-3 p-4 text-sm">
              {a.emergency ? (
                <div><p className="font-medium">{a.emergency.name}</p><p className="text-xs text-muted">{a.emergency.phone}</p></div>
              ) : (
                <p className="text-muted">No emergency contact yet.</p>
              )}
              <Button variant="outline" size="sm" onClick={() => { setName(a.emergency?.name ?? ""); setPhone(a.emergency?.phone ?? ""); setErr(null); setEditing(true); }} data-testid="button-edit-emergency">
                <Phone size={14} /> {a.emergency ? "Edit" : "Add"}
              </Button>
            </div>
          </section>
          <section className="card">
            <CardHead title="Security" />
            <div className="space-y-3 p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div><p className="font-medium">Station PIN</p><p className="text-xs text-muted">Used to clock in at tablets and kiosks</p></div>
                <Button variant="outline" size="sm" onClick={() => show("Ask your supervisor to reset your station PIN")}><KeyRound size={14} /> Change</Button>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
                <div><p className="font-medium">Password</p><p className="text-xs text-muted">{a.passwordChangedDaysAgo !== null ? `Last changed ${a.passwordChangedDaysAgo} days ago` : "Never changed"}</p></div>
                <Button variant="outline" size="sm" onClick={() => { setPwErr(null); setPwOpen(true); }} data-testid="button-change-password">Change</Button>
              </div>
            </div>
          </section>
        </div>
      </div>
      {editing && (
        <Modal title="Emergency contact" onClose={() => setEditing(false)}>
          <div className="space-y-3">
            <div><label htmlFor="ec-name" className="mb-1.5 block text-sm font-medium">Name</label><input id="ec-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label htmlFor="ec-phone" className="mb-1.5 block text-sm font-medium">Phone</label><input id="ec-phone" className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          {err && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="staff" onClick={save} disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />} Save</Button>
          </div>
        </Modal>
      )}
      {pwOpen && (
        <Modal title="Change password" onClose={() => setPwOpen(false)}>
          <form onSubmit={changePassword} className="space-y-4" noValidate>
            <div><label className="mb-1.5 block text-sm font-medium" htmlFor="cp">Current password</label><input id="cp" type="password" autoComplete="current-password" className="input" value={cur} onChange={(e) => setCur(e.target.value)} autoFocus data-testid="input-current-password" /></div>
            <div><label className="mb-1.5 block text-sm font-medium" htmlFor="np">New password</label><input id="np" type="password" autoComplete="new-password" className="input" value={nextPw} onChange={(e) => setNextPw(e.target.value)} data-testid="input-new-password" /><p className="mt-1 text-xs text-muted">At least 10 characters. A short phrase is easiest to remember.</p></div>
            {pwErr && <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{pwErr}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setPwOpen(false)}>Cancel</Button><Button type="submit" variant="staff" disabled={busy} data-testid="button-save-password">Change password</Button></div>
          </form>
        </Modal>
      )}
      <Toast text={toast} />
    </div>
  );
}
