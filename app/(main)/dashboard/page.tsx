import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import StatusBadge from "@/components/StatusBadge";
import AvatarInitials from "@/components/AvatarInitials";
import { shifts, exceptions } from "@/lib/mockData";
import { Clock } from "lucide-react";

export default function DashboardPage() {
  const stats = [
    { label: "Scheduled hours", value: "25.5h", note: "↑ 12% from last week" },
    { label: "Worked hours", value: "16.2h", note: "63% of scheduled" },
    { label: "Pending exceptions", value: "03", note: "2 require action" },
    { label: "Active staff", value: "05", note: "On the farm today", filled: true },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Overview / Today"
        title="Daily operations dashboard"
        description="A live pulse on shifts, people, and the details that need your attention."
        action={
          <Button variant="secondary">
            <Clock size={16} /> Clock in / out
          </Button>
        }
      />

      <div className="grid grid-cols-4 gap-4 mb-6">
        {stats.map((s) => (
          <div key={s.label} className={`card ${s.filled ? "bg-navy text-white" : ""}`}>
            <div className={`text-sm mb-2 ${s.filled ? "text-white/70" : "text-neutralMid"}`}>{s.label}</div>
            <div className="text-3xl font-bold mb-1">{s.value}</div>
            <div className={`text-xs ${s.filled ? "text-white/60" : "text-neutralMid"}`}>{s.note}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="eyebrow">Live feed</div>
              <h3 className="font-bold text-lg">Today on the farm</h3>
            </div>
            <a href="/roster" className="text-primary text-sm font-semibold">Open roster →</a>
          </div>
          <div className="flex flex-col gap-3">
            {shifts.slice(0, 4).map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AvatarInitials name={s.staff} />
                  <div>
                    <div className="font-medium text-sm">{s.staff}</div>
                    <div className="text-neutralMid text-xs">{s.station}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">{s.start}</div>
                  <StatusBadge status={s.status === "Good" ? "On shift" : "Scheduled"} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="eyebrow">Needs review</div>
              <h3 className="font-bold text-lg">Pending exceptions</h3>
            </div>
            <span className="bg-red-100 text-danger text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center">
              {exceptions.length}
            </span>
          </div>
          <div className="flex flex-col gap-3 mb-4">
            {exceptions.map((e) => (
              <div key={e.id} className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">{e.type}</div>
                  <div className="text-neutralMid text-xs">{e.person} · {e.date}</div>
                </div>
                <StatusBadge status={e.severity} />
              </div>
            ))}
          </div>
          <Button variant="secondary" className="w-full justify-center">View all exceptions</Button>
        </div>
      </div>
    </>
  );
}
