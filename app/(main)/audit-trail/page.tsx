import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import { auditLog } from "@/lib/mockData";
import { Download, Search, DollarSign, Plus, ArrowUpRight, UserPlus, Sparkles } from "lucide-react";

const iconMap = {
  pay: { icon: DollarSign, bg: "bg-primaryLight text-primary" },
  shift: { icon: Plus, bg: "bg-secondaryLight text-secondary" },
  correction: { icon: ArrowUpRight, bg: "bg-primaryLight text-primary" },
  profile: { icon: UserPlus, bg: "bg-secondaryLight text-secondary" },
  optimisation: { icon: Sparkles, bg: "bg-primaryLight text-primary" },
};

export default function AuditTrailPage() {
  return (
    <>
      <PageHeader
        eyebrow="Control / Transparency"
        title="Audit trail"
        description="A clear record of changes across people, rosters, and payroll."
        action={
          <Button variant="secondary">
            <Download size={16} /> Export log
          </Button>
        }
      />

      <div className="flex gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-card px-3 py-2 flex-1">
          <Search size={16} className="text-neutralMid" />
          <input placeholder="Search activity" className="outline-none text-sm w-full" />
        </div>
        <select className="border border-gray-200 rounded-card px-3 py-2 text-sm">
          <option>All activity</option>
        </select>
        <span className="border border-gray-200 rounded-card px-3 py-2 text-sm text-neutralMid">01 May — 02 May 2026</span>
      </div>

      <div className="card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutralMid border-b border-gray-100">
              <th className="pb-3 font-medium">Activity</th>
              <th className="pb-3 font-medium">Operator</th>
              <th className="pb-3 font-medium">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {auditLog.map((a, i) => {
              const { icon: Icon, bg } = iconMap[a.type];
              return (
                <tr key={i} className="border-b border-gray-50 last:border-0">
                  <td className="py-4 flex items-center gap-3">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center ${bg}`}>
                      <Icon size={16} />
                    </span>
                    <div>
                      <div className="font-medium">{a.activity}</div>
                      <div className="text-neutralMid text-xs">{a.detail}</div>
                    </div>
                  </td>
                  <td className="font-medium">{a.operator}</td>
                  <td className="text-neutralMid">{a.timestamp}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
