"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Copy, KeyRound, Loader2, Plus, RotateCcw, Search, ShieldOff, UserMinus } from "lucide-react";
import { Avatar, Badge, Button, EmptyState, ErrorState, Field, FormError, Modal, NoAccess, PageHeader, PageLoading, Segmented, Toast, statusTone, td, th } from "@/components/ui";
import { ACCESS_ROLES, type AccessRole, type ContractType, type StaffMember } from "@/lib/data";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useCan } from "@/lib/store";
import { fmtDateTime, fmtHm, hrs, money2, useToast } from "@/lib/format";

type List = { staff: StaffMember[]; roles: AccessRole[]; contractTypes: ContractType[] };

export default function StaffPage() {
  const can = useCan();
  const [status, setStatus] = useState<"active" | "removed" | "all">("active");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, error, loading, reload } = useApi<List>(can("staff.read") ? `/api/admin/staff?status=${status}${query ? `&q=${encodeURIComponent(query)}` : ""}` : null);
  const { toast, show } = useToast(4000);
  const [openId, setOpenId] = useState<number | "new" | null>(null);
  const write = can("staff.write");

  if (!can("staff.read")) return <NoAccess what="Staff management" />;
  if (loading && !data) return <PageLoading />;
  if (error && !data) return <ErrorState error={error} onRetry={reload} />;
  if (!data) return null;

  return (
    <div>
      <PageHeader
        title="Staff management"
        desc={write ? "Add people, set their access roles and pay, issue clock PINs, and remove people who leave. Removing keeps their history for payroll and audit." : "Read-only view. Only an Office Admin can change staff records."}
        actions={write && <Button variant="admin" onClick={() => setOpenId("new")} data-testid="button-add-staff"><Plus size={16} /> Add staff member</Button>}
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented label="Status" value={status} onChange={setStatus} options={[{ value: "active", label: "Active" }, { value: "removed", label: "Removed" }, { value: "all", label: "All" }]} />
        <label className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <span className="sr-only">Search staff</span>
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input className="input pl-9" placeholder="Search name, job or email" value={q} onChange={(e) => setQ(e.target.value)} data-testid="input-search-staff" />
        </label>
        <span className="text-sm text-muted">{data.staff.length} people</span>
      </div>

      <section className="card overflow-hidden">
        {data.staff.length === 0 ? (
          <EmptyState title="No staff match" text={status === "removed" ? "Nobody has been removed." : "Try a different search."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line"><tr>
                <th className={th}>Name</th><th className={th}>Job · contract</th><th className={th}>Access roles</th><th className={`${th} text-right`}>Hours / wk</th>{write && <th className={`${th} text-right`}>Rate</th>}<th className={th}>Status</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {data.staff.map((s) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-surface-2" onClick={() => setOpenId(s.id)} data-testid={`row-staff-${s.id}`}>
                    <td className={td}>
                      <div className="flex items-center gap-3">
                        <Avatar initials={s.initials} size="sm" tone={s.status === "Removed" ? "neutral" : "admin"} />
                        <div>
                          <p className="font-medium">{s.name}</p>
                          <p className="text-xs text-muted">{s.login?.email ?? "No login"}</p>
                        </div>
                      </div>
                    </td>
                    <td className={td}>{s.jobTitle ?? "—"}<p className="text-xs text-muted">{s.contractType}{s.hoursType === "Patterned" ? " · patterned" : ""}</p></td>
                    <td className={td}><div className="flex flex-wrap gap-1">{(s.login?.roles ?? []).map((r) => <Badge key={r} tone={r === "Worker" ? "staff" : "admin"}>{r}</Badge>)}</div></td>
                    <td className={`${td} tabular text-right`}>{s.standardHours}</td>
                    {write && <td className={`${td} tabular text-right`}>{s.standardRate != null ? money2(s.standardRate) : "—"}</td>}
                    <td className={td}><Badge tone={statusTone(s.status ?? "Active")}>{s.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openId === "new" && (
        <StaffForm
          onClose={() => setOpenId(null)}
          onSaved={(m, id) => {
            show(m);
            reload();
            setOpenId(id);
          }}
        />
      )}
      {typeof openId === "number" && <StaffDetail id={openId} write={write} onClose={() => setOpenId(null)} onChanged={(m) => { show(m); reload(); }} />}
      <Toast text={toast} />
    </div>
  );
}

type FormState = {
  firstName: string; lastName: string; jobTitle: string; contractType: ContractType; standardHours: string; standardRate: string; overtimeRate: string;
  credentialRef: string; hoursType: "Weekly" | "Patterned"; patternDays: string; patternStart: string; patternEnd: string;
  annualLeaveHours: string; personalLeaveHours: string; emergencyContactName: string; emergencyContactPhone: string;
};
const toForm = (s?: StaffMember): FormState => ({
  firstName: s?.firstName ?? "", lastName: s?.lastName ?? "", jobTitle: s?.jobTitle ?? "", contractType: s?.contractType ?? "Casual",
  standardHours: String(s?.standardHours ?? 38), standardRate: s?.standardRate != null ? String(s.standardRate) : "", overtimeRate: s?.overtimeRate != null ? String(s.overtimeRate) : "",
  credentialRef: s?.credentialRef ?? "", hoursType: s?.hoursType ?? "Weekly", patternDays: s?.patternDays ?? "", patternStart: s?.patternStart ?? "", patternEnd: s?.patternEnd ?? "",
  annualLeaveHours: String(s?.annualLeaveHours ?? 0), personalLeaveHours: String(s?.personalLeaveHours ?? 0), emergencyContactName: s?.emergencyContactName ?? "", emergencyContactPhone: s?.emergencyContactPhone ?? "",
});
const toBody = (f: FormState) => ({
  firstName: f.firstName.trim(), lastName: f.lastName.trim(), jobTitle: f.jobTitle.trim() || null, contractType: f.contractType, standardHours: Number(f.standardHours),
  standardRate: Number(f.standardRate), overtimeRate: f.overtimeRate ? Number(f.overtimeRate) : undefined, credentialRef: f.credentialRef.trim() || null, hoursType: f.hoursType,
  patternDays: f.hoursType === "Patterned" ? f.patternDays.trim() : null, patternStart: f.hoursType === "Patterned" ? f.patternStart : null, patternEnd: f.hoursType === "Patterned" ? f.patternEnd : null,
  annualLeaveHours: Number(f.annualLeaveHours || 0), personalLeaveHours: Number(f.personalLeaveHours || 0), emergencyContactName: f.emergencyContactName.trim() || null, emergencyContactPhone: f.emergencyContactPhone.trim() || null,
});

function StaffFields({ f, set }: { f: FormState; set: (p: Partial<FormState>) => void }) {
  const inp = (k: keyof FormState, extra: Record<string, unknown> = {}) => ({ id: `sf-${k}`, className: "input", value: f[k] as string, onChange: (e: { target: { value: string } }) => set({ [k]: e.target.value } as Partial<FormState>), ...extra });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="First name" htmlFor="sf-firstName"><input {...inp("firstName", { maxLength: 50, required: true })} data-testid="input-first-name" /></Field>
      <Field label="Last name" htmlFor="sf-lastName"><input {...inp("lastName", { maxLength: 50, required: true })} data-testid="input-last-name" /></Field>
      <Field label="Job title" htmlFor="sf-jobTitle"><input {...inp("jobTitle", { maxLength: 50, placeholder: "e.g. Picker" })} /></Field>
      <Field label="Contract" htmlFor="sf-contractType">
        <select {...inp("contractType")}>{(["Casual", "Part Time", "Full Time"] as ContractType[]).map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      <Field label="Standard hours per week" htmlFor="sf-standardHours"><input {...inp("standardHours", { type: "number", min: 0, max: 60, step: 0.5 })} /></Field>
      <Field label="Clock ID (QR / badge)" htmlFor="sf-credentialRef"><input {...inp("credentialRef", { maxLength: 100, placeholder: "e.g. QR-1021" })} /></Field>
      <Field label="Standard rate ($/h)" htmlFor="sf-standardRate"><input {...inp("standardRate", { type: "number", min: 0, step: 0.01, required: true })} data-testid="input-rate" /></Field>
      <Field label="Overtime rate ($/h)" htmlFor="sf-overtimeRate" hint="Leave blank for 1.5 × standard rate."><input {...inp("overtimeRate", { type: "number", min: 0, step: 0.01 })} /></Field>
      <Field label="Hours pattern" htmlFor="sf-hoursType">
        <select {...inp("hoursType")}><option value="Weekly">Weekly</option><option value="Patterned">Patterned (set days and times)</option></select>
      </Field>
      {f.hoursType === "Patterned" ? (
        <Field label="Days" htmlFor="sf-patternDays" hint="e.g. Mon,Tue,Wed"><input {...inp("patternDays", { maxLength: 30 })} /></Field>
      ) : <div />}
      {f.hoursType === "Patterned" && (
        <>
          <Field label="Pattern start" htmlFor="sf-patternStart"><input {...inp("patternStart", { type: "time" })} /></Field>
          <Field label="Pattern end" htmlFor="sf-patternEnd"><input {...inp("patternEnd", { type: "time" })} /></Field>
        </>
      )}
      <Field label="Annual leave (hours)" htmlFor="sf-annualLeaveHours"><input {...inp("annualLeaveHours", { type: "number", min: 0, step: 0.5 })} /></Field>
      <Field label="Personal leave (hours)" htmlFor="sf-personalLeaveHours"><input {...inp("personalLeaveHours", { type: "number", min: 0, step: 0.5 })} /></Field>
      <Field label="Emergency contact" htmlFor="sf-emergencyContactName"><input {...inp("emergencyContactName", { maxLength: 100 })} /></Field>
      <Field label="Emergency phone" htmlFor="sf-emergencyContactPhone"><input {...inp("emergencyContactPhone", { maxLength: 30, inputMode: "tel" })} /></Field>
    </div>
  );
}

function RolePicker({ roles, set }: { roles: AccessRole[]; set: (r: AccessRole[]) => void }) {
  const desc: Record<AccessRole, string> = {
    "Office Admin": "Staff, pay, payroll, settings, approvals, audit",
    "Roster Admin": "Rosters and stations",
    "Manager/Supervisor": "Rosters, approvals, exceptions, reports",
    Worker: "Clocks in and out (Staff portal)",
  };
  return (
    <fieldset className="grid gap-2 sm:grid-cols-2">
      <legend className="mb-1.5 text-sm font-medium">Access roles</legend>
      {ACCESS_ROLES.map((r) => (
        <label key={r} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${roles.includes(r) ? "border-admin bg-admin-soft" : "border-line"}`}>
          <input type="checkbox" className="mt-0.5" checked={roles.includes(r)} onChange={(e) => set(e.target.checked ? [...roles, r] : roles.filter((x) => x !== r))} data-testid={`check-role-${r}`} />
          <span><span className="font-medium">{r}</span><span className="block text-xs text-muted">{desc[r]}</span></span>
        </label>
      ))}
    </fieldset>
  );
}

function Secret({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-wheat/40 bg-wheat-soft p-3 text-sm">
      <p className="font-medium">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <code className="tabular rounded bg-surface px-2 py-1 text-base font-semibold" data-testid="text-secret">{value}</code>
        <button type="button" className="rounded p-1 text-muted hover:text-fg" aria-label="Copy" onClick={() => navigator.clipboard?.writeText(value)}><Copy size={15} /></button>
      </div>
      <p className="mt-1 text-xs text-muted">{note}</p>
    </div>
  );
}

function StaffForm({ onClose, onSaved }: { onClose: () => void; onSaved: (m: string, id: number) => void }) {
  const [f, setF] = useState<FormState>(toForm());
  const [withLogin, setWithLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<AccessRole[]>(["Worker"]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState<{ pw: string; id: number } | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!f.firstName.trim() || !f.lastName.trim()) return setErr("Enter a first and last name.");
    if (!(Number(f.standardRate) > 0)) return setErr("Enter the standard pay rate.");
    if (withLogin && !email.trim()) return setErr("Enter an email for the login, or untick “Create a login”.");
    if (withLogin && roles.length === 0) return setErr("Pick at least one access role.");
    setBusy(true);
    try {
      const r = await api<{ staff: StaffMember; temporaryPassword: string | null }>("/api/admin/staff", { body: { ...toBody(f), login: withLogin ? { email: email.trim(), roles } : null } });
      if (r.temporaryPassword) setTemp({ pw: r.temporaryPassword, id: r.staff.id });
      else onSaved(`${r.staff.name} added.`, r.staff.id);
    } catch (x) {
      setErr((x as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  if (temp)
    return (
      <Modal title="Staff member added" onClose={() => onSaved("Staff member added.", temp.id)}>
        <Secret label="Temporary password" value={temp.pw} note="Shown once. Give it to them in person; they sign in with their email and this password, then change it on their Profile page." />
        <div className="mt-4 flex justify-end"><Button variant="admin" onClick={() => onSaved("Staff member added.", temp.id)}>Done</Button></div>
      </Modal>
    );

  return (
    <Modal title="Add staff member" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-5" noValidate>
        <StaffFields f={f} set={(p) => setF((x) => ({ ...x, ...p }))} />
        <div className="space-y-3 border-t border-line pt-4">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={withLogin} onChange={(e) => setWithLogin(e.target.checked)} /> Create a login</label>
          {withLogin && (
            <>
              <Field label="Login email" htmlFor="sf-email"><input id="sf-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@farm.com.au" data-testid="input-login-email" /></Field>
              <RolePicker roles={roles} set={setRoles} />
            </>
          )}
        </div>
        <FormError text={err} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="admin" disabled={busy} data-testid="button-save-staff">{busy && <Loader2 size={16} className="animate-spin" />} Add staff member</Button>
        </div>
      </form>
    </Modal>
  );
}

function StaffDetail({ id, write, onClose, onChanged }: { id: number; write: boolean; onClose: () => void; onChanged: (m: string) => void }) {
  const { data, error, reload } = useApi<{ staff: StaffMember }>(`/api/admin/staff/${id}`);
  const [tab, setTab] = useState<"details" | "login" | "remove">("details");
  const [f, setF] = useState<FormState | null>(null);
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<AccessRole[]>([]);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [secret, setSecret] = useState<{ label: string; value: string; note: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setF(toForm(data.staff));
    setEmail(data.staff.login?.email ?? "");
    setRoles(data.staff.login?.roles ?? ["Worker"]);
  }, [data]);

  const s = data?.staff;
  const removed = !!s?.removedAt;

  async function act(key: string, fn: () => Promise<unknown>, msg: string) {
    setErr(null);
    setBusy(key);
    try {
      await fn();
      onChanged(msg);
      await reload();
      return true;
    } catch (x) {
      setErr((x as ApiError).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal title={s ? s.name : "Staff member"} onClose={onClose} wide>
      {error && <FormError text={error.message} />}
      {!s || !f ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted"><Loader2 size={16} className="animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone={removed ? "danger" : "ok"}>{removed ? "Removed" : "Active"}</Badge>
            {(s.login?.roles ?? []).map((r) => <Badge key={r} tone={r === "Worker" ? "staff" : "admin"}>{r}</Badge>)}
            {s.login && <span className="text-xs text-muted">MFA {s.login.mfaEnrolled ? "set up" : "not set up"}{s.login.disabled ? " · login disabled" : ""}</span>}
            {s.hasPin && <span className="text-xs text-muted">· PIN valid until {fmtDateTime(s.pinExpiresAt)}</span>}
          </div>

          {write && !removed && (
            <Segmented label="Section" value={tab} onChange={(v) => { setTab(v); setErr(null); }} options={[{ value: "details", label: "Details" }, { value: "login", label: "Login & access" }, { value: "remove", label: "Remove" }]} />
          )}

          {(!write || removed || tab === "details") && (
            write && !removed ? (
              <form
                className="space-y-4"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  act("save", () => api(`/api/admin/staff/${id}`, { method: "PATCH", body: toBody(f) }), "Staff details saved.");
                }}
              >
                <StaffFields f={f} set={(p) => setF((x) => ({ ...x!, ...p }))} />
                <FormError text={err} />
                <div className="flex justify-end"><Button type="submit" variant="admin" disabled={!!busy} data-testid="button-save-details">{busy === "save" && <Loader2 size={16} className="animate-spin" />} Save details</Button></div>
              </form>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
                {[
                  ["Job title", s.jobTitle ?? "—"], ["Contract", s.contractType], ["Standard hours", `${s.standardHours} h / wk`],
                  ["Hours pattern", s.hoursType === "Patterned" ? `${s.patternDays} ${fmtHm(s.patternStart)}–${fmtHm(s.patternEnd)}` : "Weekly"],
                  ["Clock ID", s.credentialRef ?? "—"], ["Login", s.login?.email ?? "None"],
                  ["Annual leave", hrs(s.annualLeaveHours)], ["Personal leave", hrs(s.personalLeaveHours)], ["Emergency contact", s.emergencyContactName ?? "—"],
                ].map(([k, v]) => <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
              </dl>
            )
          )}

          {write && removed && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line p-3 text-sm">
              <span>Removed {fmtDateTime(s.removedAt)}. Their history is kept.</span>
              <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act("restore", () => api(`/api/admin/staff/${id}/restore`, { body: {} }), `${s.name} restored. Their login works again.`)} data-testid="button-restore">
                <RotateCcw size={14} /> Restore
              </Button>
            </div>
          )}

          {write && !removed && tab === "login" && (
            <div className="space-y-4">
              <Field label="Login email" htmlFor="sd-email"><input id="sd-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
              <RolePicker roles={roles} set={setRoles} />
              <FormError text={err} />
              {secret && <Secret {...secret} />}
              <div className="flex flex-wrap justify-end gap-2">
                {s.login && (
                  <Button variant="outline" size="sm" disabled={!!busy} onClick={() => act("mfa", () => api(`/api/admin/staff/${id}/login/reset-mfa`, { body: {} }), "Authenticator reset. They set it up again at their next admin sign-in.")}>
                    <ShieldOff size={14} /> Reset MFA
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!!busy}
                  onClick={async () => {
                    setErr(null);
                    setBusy("pin");
                    try {
                      const r = await api<{ pin: string; expiresAt: string }>(`/api/admin/staff/${id}/pin`, { body: {} });
                      setSecret({ label: "Temporary clock PIN", value: r.pin, note: `Shown once. Valid until ${fmtDateTime(r.expiresAt)}.` });
                      onChanged("PIN issued.");
                      reload();
                    } catch (x) {
                      setErr((x as ApiError).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  data-testid="button-issue-pin"
                >
                  <KeyRound size={14} /> Issue PIN
                </Button>
                <Button
                  variant="admin"
                  size="sm"
                  disabled={!!busy}
                  onClick={async () => {
                    setErr(null);
                    if (!email.trim()) return setErr("Enter an email.");
                    if (!roles.length) return setErr("Pick at least one access role.");
                    setBusy("login");
                    try {
                      const r = await api<{ temporaryPassword: string | null }>(`/api/admin/staff/${id}/login`, { method: "PUT", body: { email: email.trim(), roles } });
                      if (r.temporaryPassword) setSecret({ label: "Temporary password", value: r.temporaryPassword, note: "Shown once. They change it on their Profile page after signing in." });
                      onChanged(s.login ? "Login and access roles saved." : "Login created.");
                      reload();
                    } catch (x) {
                      setErr((x as ApiError).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  data-testid="button-save-login"
                >
                  {busy === "login" && <Loader2 size={14} className="animate-spin" />} {s.login ? "Save login" : "Create login"}
                </Button>
              </div>
            </div>
          )}

          {write && !removed && tab === "remove" && (
            <div className="space-y-3">
              <p className="text-sm text-muted">
                {s.canHardDelete
                  ? "This person has no time, pay or leave history, so their record will be deleted completely."
                  : "Their login is disabled, future shifts are taken off the roster and pending leave is declined. Their time, pay and audit history stay for payroll and records. You can restore them later."}
              </p>
              <Field label="Reason (optional)" htmlFor="sd-reason"><input id="sd-reason" className="input" maxLength={150} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Season finished" /></Field>
              <FormError text={err} />
              <div className="flex justify-end">
                <Button
                  variant="danger"
                  disabled={!!busy}
                  onClick={async () => {
                    setErr(null);
                    setBusy("remove");
                    try {
                      const r = await api<{ result: "deleted" | "removed" }>(`/api/admin/staff/${id}`, { method: "DELETE", body: { reason: reason.trim() || undefined } });
                      onChanged(r.result === "deleted" ? `${s.name} deleted.` : `${s.name} removed. History kept.`);
                      onClose();
                    } catch (x) {
                      setErr((x as ApiError).message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                  data-testid="button-remove-staff"
                >
                  {busy === "remove" ? <Loader2 size={16} className="animate-spin" /> : <UserMinus size={16} />} {s.canHardDelete ? "Delete staff member" : "Remove staff member"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
