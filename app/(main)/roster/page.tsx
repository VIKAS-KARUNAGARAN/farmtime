"use client";

import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import Banner from "@/components/Banner";
import StatusBadge from "@/components/StatusBadge";
import AvatarInitials from "@/components/AvatarInitials";
import { shifts } from "@/lib/mockData";
import { CalendarPlus, Sparkles, ChevronLeft, ChevronRight } from "lucide-react";

export default function RosterPage() {
  const [view, setView] = useState<"Day" | "Week" | "Fortnight">("Week");

  return (
    <>
      <PageHeader
        eyebrow="Planning / Calendar"
        title="Roster management"
        description="Build a rhythm that works for the farm, with quick assignment and clear visibility."
        action={
          <div className="flex gap-2">
            <Button>
              <CalendarPlus size={16} /> Quick add shift
            </Button>
            <Button variant="secondary">
              <Sparkles size={16} /> Apply roster optimisation
            </Button>
          </div>
        }
      />

      <div className="flex items-center gap-3 mb-4">
        <div className="flex bg-white border border-gray-200 rounded-card p-1">
          {(["Day", "Week", "Fortnight"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium ${
                view === v ? "bg-primary text-white" : "text-neutralMid"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 border border-gray-200 rounded-card px-3 py-2 text-sm">
          <ChevronLeft size={16} className="cursor-pointer" />
          02 — 08 May 2026
          <ChevronRight size={16} className="cursor-pointer" />
        </div>
      </div>

      <Banner variant="warning">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-secondary" />
          <div>
            <div className="font-semibold text-sm">Good week for field work</div>
            <div className="text-xs text-neutralMid">Weather flag: low wind across all outdoor shifts</div>
          </div>
        </div>
        <div className="flex gap-4 text-sm">
          <span>MON 18°</span><span>TUE 21°</span><span>WED 19°</span><span>THU 20°</span>
        </div>
      </Banner>

      <div className="card mt-4">
        <div className="flex items-center justify-between mb-4">
          <span className="font-semibold text-sm">{shifts.length} shifts scheduled</span>
          <Button variant="ghost">View leave requests →</Button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutralMid border-b border-gray-100">
              <th className="pb-3 font-medium">Date</th>
              <th className="pb-3 font-medium">Staff member</th>
              <th className="pb-3 font-medium">Station</th>
              <th className="pb-3 font-medium">Start</th>
              <th className="pb-3 font-medium">Duration</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="py-3">{s.date}</td>
                <td className="flex items-center gap-2 py-3">
                  <AvatarInitials name={s.staff} /> {s.staff}
                </td>
                <td>{s.station}</td>
                <td>{s.start}</td>
                <td className="flex items-center gap-2">
                  {s.hours.toFixed(1)}h <StatusBadge status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
