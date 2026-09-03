import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import AvatarInitials from "@/components/AvatarInitials";
import { CreditCard, ScanFace, Fingerprint, ShieldCheck, RefreshCw } from "lucide-react";

const methods = [
  { label: "Staff card", note: "Tap your registered card", icon: CreditCard, active: true },
  { label: "Face match", note: "Use the device camera", icon: ScanFace, active: false },
  { label: "Fingerprint", note: "Use connected scanner", icon: Fingerprint, active: false },
];

const activity = [
  { day: "Today", station: "North Orchard Gate", in: "07:42", out: "In progress", total: "—" },
  { day: "Yesterday", station: "Packhouse Entry", in: "07:30", out: "15:35", total: "8.1h" },
];

export default function ClockingStationPage() {
  return (
    <>
      <PageHeader
        eyebrow="Field device / Live"
        title="Clocking station"
        description="Fast, verified time capture for the people on the ground."
        action={
          <span className="flex items-center gap-2 border border-gray-200 rounded-card px-3 py-2 text-sm">
            <span className="w-2 h-2 rounded-full bg-success inline-block" /> North Orchard Gate
          </span>
        }
      />

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card bg-navy text-white">
          <div className="flex items-center justify-between mb-4">
            <div className="eyebrow text-white/50">Current operator</div>
            <span className="bg-white/10 text-xs px-2 py-1 rounded-full">Ready to clock in</span>
          </div>
          <div className="flex items-center gap-3 mb-6">
            <AvatarInitials name="Vikas Karunagaran" />
            <div>
              <div className="font-semibold">Vikas Karunagaran</div>
              <div className="text-white/60 text-xs">staff01 · Field lead</div>
            </div>
          </div>
          <div className="text-5xl font-bold mb-1">07:42</div>
          <div className="text-white/60 text-sm mb-6">Tuesday · 02 May 2026</div>
          <Button className="w-full justify-center bg-secondary text-navy hover:bg-secondary">
            Clock in →
          </Button>
          <div className="text-white/50 text-xs text-center mt-3">Location verified within assigned station</div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="eyebrow">Verification</div>
              <h3 className="font-bold text-lg">Identity method</h3>
            </div>
            <RefreshCw size={16} className="text-neutralMid cursor-pointer" />
          </div>
          <div className="flex flex-col gap-3 mb-4">
            {methods.map((m) => (
              <div
                key={m.label}
                className={`flex items-center justify-between p-3 rounded-card border ${
                  m.active ? "border-primary bg-primaryLight" : "border-gray-200"
                }`}
              >
                <div className="flex items-center gap-3">
                  <m.icon size={18} className="text-primary" />
                  <div>
                    <div className="font-medium text-sm">{m.label}</div>
                    <div className="text-neutralMid text-xs">{m.note}</div>
                  </div>
                </div>
                {m.active ? <ShieldCheck size={16} className="text-success" /> : <span className="text-xs text-neutralMid">Soon</span>}
              </div>
            ))}
          </div>
          <div className="bg-secondaryLight text-xs text-neutralDark rounded-card p-3">
            Clock-in is only accepted when the device is within 100m of the assigned station.
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="eyebrow">Recent activity</div>
            <h3 className="font-bold text-lg">My time this week</h3>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">16.2</div>
            <div className="text-neutralMid text-xs">hours</div>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutralMid border-b border-gray-100">
              <th className="pb-3 font-medium">Day</th>
              <th className="pb-3 font-medium">Station</th>
              <th className="pb-3 font-medium">Clock in</th>
              <th className="pb-3 font-medium">Clock out</th>
              <th className="pb-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {activity.map((a, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                <td className="py-3">{a.day}</td>
                <td>{a.station}</td>
                <td>{a.in}</td>
                <td>{a.out}</td>
                <td>{a.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
