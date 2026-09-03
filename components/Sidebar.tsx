"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  Clock,
  Wallet,
  ShieldCheck,
  Settings,
  LogOut,
  Wheat,
} from "lucide-react";
import { currentUser } from "@/lib/mockData";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Staff", href: "/staff", icon: Users },
  { label: "Roster", href: "/roster", icon: CalendarDays },
  { label: "Clocking station", href: "/clocking-station", icon: Clock },
  { label: "Payroll / reports", href: "/payroll-reports", icon: Wallet, badge: 3 },
  { label: "Audit trail", href: "/audit-trail", icon: ShieldCheck },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-[260px] shrink-0 bg-navy text-white flex flex-col h-screen sticky top-0 px-4 py-6">
      <div className="flex items-center gap-2 px-2 mb-1">
        <Wheat size={26} className="text-secondary" />
        <div>
          <div className="font-bold text-lg leading-tight">FarmTime</div>
          <div className="text-[11px] text-white/60 leading-tight">Workforce Time Mgmt</div>
        </div>
      </div>

      <div className="mt-4 mb-6 flex items-center justify-between bg-white/10 rounded-card px-3 py-2 text-sm">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-secondary inline-block" />
          Farm day active
        </span>
        <span className="font-semibold">07:42</span>
      </div>

      <div className="eyebrow text-white/50 px-2 mb-2">Workspace</div>
      <nav className="flex flex-col gap-1">
        {navItems.map(({ label, href, icon: Icon, badge }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center justify-between px-3 py-2 rounded-card text-sm transition ${
                active ? "bg-primaryLight text-navy font-semibold" : "text-white/80 hover:bg-white/10"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon size={18} />
                {label}
              </span>
              {badge ? (
                <span className="bg-secondary text-navy text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-3">
        <div className="bg-secondary/20 border border-secondary/40 rounded-card p-3 text-sm">
          <div className="flex items-center gap-1 text-secondary font-medium mb-1">Good conditions</div>
          <div className="text-2xl font-bold">18°</div>
          <div className="text-white/60 text-xs">Clear / low wind</div>
        </div>

        <Link href="#" className="flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/10 rounded-card">
          <Settings size={18} /> Settings
        </Link>
        <Link href="/login" className="flex items-center gap-2 px-3 py-2 text-sm text-white/70 hover:bg-white/10 rounded-card">
          <LogOut size={18} /> Log out
        </Link>

        <div className="flex items-center gap-2 border-t border-white/10 pt-3 px-1">
          <div className="w-8 h-8 rounded-full bg-secondary text-navy font-bold flex items-center justify-center text-xs">
            VK
          </div>
          <div className="text-sm">
            <div className="font-semibold leading-tight">{currentUser.name}</div>
            <div className="text-white/50 text-xs leading-tight">{currentUser.role}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
