import { Search, HelpCircle, TriangleAlert } from "lucide-react";
import { currentUser } from "@/lib/mockData";

export default function TopBar({ alertCount = 3 }: { alertCount?: number }) {
  return (
    <div className="flex items-center gap-4 bg-white px-6 py-4 border-b border-gray-100 sticky top-0 z-10">
      <div className="flex-1 flex items-center gap-2 bg-bg rounded-card px-4 py-2 max-w-md">
        <Search size={16} className="text-neutralMid" />
        <input
          placeholder="Search shifts, staff, reports"
          className="bg-transparent outline-none text-sm w-full placeholder:text-neutralMid"
        />
      </div>

      <button className="flex items-center gap-1 border border-gray-200 rounded-card px-3 py-2 text-sm text-neutralMid hover:bg-bg">
        <HelpCircle size={16} /> Help
      </button>

      <button className="flex items-center gap-1 border border-gray-200 rounded-card px-3 py-2 text-sm text-secondary font-semibold hover:bg-secondaryLight">
        <TriangleAlert size={16} /> {alertCount}
      </button>

      <div className="flex items-center gap-2 text-sm">
        <span className="w-2 h-2 rounded-full bg-success inline-block" />
        <span className="text-neutralDark font-medium">Admin / {currentUser.id}</span>
      </div>
    </div>
  );
}
