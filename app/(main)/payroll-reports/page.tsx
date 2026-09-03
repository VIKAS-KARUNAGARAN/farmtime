import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import Banner from "@/components/Banner";
import StatusBadge from "@/components/StatusBadge";
import { staffList, exceptions } from "@/lib/mockData";
import { FileText, RefreshCw } from "lucide-react";

const payInfo = [
  { name: "Baozhi Li", id: "admin01", pay: 0 },
  { name: "Vikas Karunagaran", id: "staff01", pay: 551.82 },
  { name: "Ruining Li", id: "staff02", pay: 185.1 },
  { name: "Wanwan Wang", id: "staff03", pay: 0 },
  { name: "Yi Deng", id: "staff04", pay: 510.51 },
];

const timeInfo = [
  { name: "Baozhi Li", id: "Full time", hours: 0, pct: 0 },
  { name: "Vikas Karunagaran", id: "Full time", hours: 16.2, pct: 80 },
  { name: "Ruining Li", id: "Part time", hours: 6.2, pct: 40 },
  { name: "Wanwan Wang", id: "Casual", hours: 0, pct: 0 },
  { name: "Yi Deng", id: "Full time", hours: 15.5, pct: 75 },
];

export default function PayrollReportsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Finance / Pay period 04"
        title="Payroll & reports"
        description="Turn attendance into a clean, reviewable pay run."
        action={
          <Button>
            <FileText size={16} /> Generate pay slips
          </Button>
        }
      />

      <Banner>
        <div>
          <div className="eyebrow text-white/50">Active period</div>
          <div className="text-xl font-bold">26 Apr — 09 May 2026</div>
        </div>
        <Button variant="secondary">
          <RefreshCw size={16} /> Load time information
        </Button>
      </Banner>

      <div className="grid grid-cols-2 gap-4 my-4">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="eyebrow">Attendance</div>
              <h3 className="font-bold text-lg">Time information</h3>
            </div>
            <span className="text-neutralMid text-sm">{staffList.length} people</span>
          </div>
          <div className="flex flex-col gap-4">
            {timeInfo.map((t) => (
              <div key={t.name}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-neutralMid">{t.hours.toFixed(1)} hours</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: `${t.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="eyebrow">Pay run 04</div>
              <h3 className="font-bold text-lg">Pay information</h3>
            </div>
            <span className="text-xl font-bold text-primary">$1,099.48</span>
          </div>
          <div className="flex flex-col gap-3 mb-4 text-sm">
            {payInfo.map((p) => (
              <div key={p.name} className="flex justify-between">
                <span className="font-medium">{p.name}</span>
                <span>${p.pay.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-gray-100 pt-3 flex flex-col gap-2 text-sm">
            <div className="flex justify-between"><span>Gross labour cost</span><span className="font-medium">$1,099.48</span></div>
            <div className="flex justify-between"><span>Estimated overtime</span><span className="font-medium">$184.20</span></div>
            <div className="flex justify-between"><span>Staff with exceptions</span><span className="text-secondary font-medium">03</span></div>
            <div className="flex justify-between text-base font-bold pt-2 border-t border-gray-100"><span>Total projected</span><span className="text-primary">$1,283.68</span></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="eyebrow">Compliance / Actions</div>
            <h3 className="font-bold text-lg">Exception report</h3>
          </div>
          <Button variant="secondary">
            <RefreshCw size={16} /> Refresh exceptions
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutralMid border-b border-gray-100">
              <th className="pb-3 font-medium">ID</th>
              <th className="pb-3 font-medium">Type</th>
              <th className="pb-3 font-medium">Date</th>
              <th className="pb-3 font-medium">Severity</th>
              <th className="pb-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {exceptions.map((e) => (
              <tr key={e.id} className="border-b border-gray-50 last:border-0">
                <td className="py-3">{e.id}</td>
                <td>{e.type}</td>
                <td>{e.date}</td>
                <td><StatusBadge status={e.severity} /></td>
                <td><Button variant="secondary">Resolve</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
