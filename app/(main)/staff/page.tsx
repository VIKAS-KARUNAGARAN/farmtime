"use client";

import PageHeader from "@/components/PageHeader";
import Button from "@/components/Button";
import StatusBadge from "@/components/StatusBadge";
import AvatarInitials from "@/components/AvatarInitials";
import { staffList } from "@/lib/mockData";
import { UserPlus, Search } from "lucide-react";

export default function StaffPage() {
  return (
    <>
      <PageHeader
        eyebrow="People / Directory"
        title="Staff management"
        description="Keep your team records, pay rates, and identity status in one place."
        action={
          <Button>
            <UserPlus size={16} /> Onboard new staff
          </Button>
        }
      />

      <div className="flex gap-3 mb-4">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-card px-3 py-2 flex-1">
          <Search size={16} className="text-neutralMid" />
          <input placeholder="Find a staff member" className="outline-none text-sm w-full" />
        </div>
        <select className="border border-gray-200 rounded-card px-3 py-2 text-sm">
          <option>All roles</option>
        </select>
        <select className="border border-gray-200 rounded-card px-3 py-2 text-sm">
          <option>All statuses</option>
        </select>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4 text-sm">
          <span className="font-semibold">{staffList.length} team members</span>
          <span className="flex items-center gap-2 text-success">
            <span className="w-2 h-2 rounded-full bg-success inline-block" /> Identity service connected
          </span>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-neutralMid border-b border-gray-100">
              <th className="pb-3 font-medium">Employee</th>
              <th className="pb-3 font-medium">Role / Contract</th>
              <th className="pb-3 font-medium">Base rate</th>
              <th className="pb-3 font-medium">Identity</th>
              <th className="pb-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {staffList.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 last:border-0">
                <td className="py-3 flex items-center gap-3">
                  <AvatarInitials name={s.name} />
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-neutralMid text-xs">{s.id}</div>
                  </div>
                </td>
                <td>
                  <div className="font-medium">{s.role}</div>
                  <div className="text-neutralMid text-xs">{s.contract}</div>
                </td>
                <td>
                  <div className="flex items-center gap-1">
                    $<input defaultValue={s.rate.toFixed(2)} className="border border-gray-200 rounded-md px-2 py-1 w-20 text-sm" /> /hr
                  </div>
                </td>
                <td><StatusBadge status={s.identity} /></td>
                <td>
                  <Button variant="secondary">Save</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
