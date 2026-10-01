"use client";
import { useState } from "react";
import { Check, Loader2, Lock, Minus, Pencil } from "lucide-react";
import { Badge, Button, CardHead, ErrorState, Modal, PageHeader, PageLoading, Toast } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useToast } from "@/lib/format";

type Values = { lockout_attempts: number; lockout_minutes: number; admin_idle_minutes: number; staff_session_hours: number; audit_retention_years: number };
type Data = {
  permissions: { key: string; label: string; staff: boolean; admin: boolean }[];
  policies: { key: string; name: string; value: string; locked: boolean }[];
  values: Values;
};

const FIELDS: { key: keyof Values; label: string; min: number; max: number; unit: string }[] = [
  { key: "lockout_attempts", label: "Failed sign-ins before lock", min: 3, max: 10, unit: "attempts" },
  { key: "lockout_minutes", label: "Lock duration", min: 5, max: 120, unit: "min" },
  { key: "admin_idle_minutes", label: "Admin idle timeout", min: 5, max: 120, unit: "min" },
  { key: "staff_session_hours", label: "Staff session length", min: 1, max: 16, unit: "h" },
];

export default function Settings() {
  const { data, error, loading, reload } = useApi<Data>("/api/admin/settings");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Values>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast, show } = useToast();

  if (loading && !data) return <PageLoading rows={2} />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const patch: Partial<Values> = {};
      for (const f of FIELDS) if (form[f.key] !== undefined && form[f.key] !== data!.values[f.key]) patch[f.key] = Number(form[f.key]);
      if (!Object.keys(patch).length) { setEditing(false); return; }
      await api("/api/admin/settings", { method: "PATCH", body: patch });
      setEditing(false);
      show("Security settings saved · change logged");
      reload();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader eyebrow="Governance" title="Access & settings" desc="Who can do what, and the security rules the server applies at each entrance." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section className="card overflow-x-auto">
          <CardHead title="Permissions by role" />
          <table className="w-full min-w-[440px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="px-4 py-3 font-medium">Capability</th>
                <th className="w-24 px-4 py-3 text-center font-medium"><Badge tone="staff">Staff</Badge></th>
                <th className="w-24 px-4 py-3 text-center font-medium"><Badge tone="admin">Admin</Badge></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.permissions.map((p) => (
                <tr key={p.key}>
                  <td className="px-4 py-2.5">{p.label} <span className="ml-1 font-mono text-[11px] text-faint">{p.key}</span></td>
                  <td className="px-4 py-2.5 text-center">{p.staff ? <Check size={16} className="mx-auto text-ok" aria-label="Allowed" /> : <Minus size={16} className="mx-auto text-faint" aria-label="Not allowed" />}</td>
                  <td className="px-4 py-2.5 text-center">{p.admin ? <Check size={16} className="mx-auto text-ok" aria-label="Allowed" /> : <Minus size={16} className="mx-auto text-faint" aria-label="Not allowed" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-line px-4 py-3 text-xs text-muted">Accounts with both roles get both columns. Admin capabilities also require a verified MFA session.</p>
        </section>
        <section className="card self-start">
          <CardHead
            title="Security policies"
            action={<Button variant="ghost" size="sm" onClick={() => { setForm({ ...data.values }); setErr(null); setEditing(true); }} data-testid="button-edit-policies"><Pencil size={13} /> Edit</Button>}
          />
          <ul className="divide-y divide-line">
            {data.policies.map((p) => (
              <li key={p.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>{p.name}</span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-muted">{p.locked && <Lock size={12} aria-label="Locked" />} {p.value}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
      {editing && (
        <Modal title="Edit security policies" onClose={() => setEditing(false)}>
          <div className="space-y-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <label htmlFor={f.key} className="text-sm">{f.label}</label>
                <div className="flex items-center gap-2">
                  <input id={f.key} type="number" min={f.min} max={f.max} className="input tabular h-9 w-20 text-right" value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  <span className="w-16 text-xs text-muted">{f.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-faint">MFA for admins and role-based routing are locked and can’t be turned off.</p>
          {err && <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">{err}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="admin" onClick={save} disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />} Save</Button>
          </div>
        </Modal>
      )}
      <Toast text={toast} />
    </div>
  );
}
