"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wheat, ShieldCheck, Users, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [role, setRole] = useState<"Admin" | "Staff">("Admin");
  const router = useRouter();

  return (
    <div className="min-h-screen flex">
      <div className="hidden md:flex flex-col justify-between w-1/2 bg-navy text-white p-12">
        <div className="flex items-center gap-2">
          <Wheat size={26} className="text-secondary" />
          <span className="font-bold text-xl">FarmTime</span>
        </div>

        <div>
          <div className="eyebrow text-white/50 mb-2">Cultivated Horizon / 2026</div>
          <h1 className="text-5xl font-bold leading-tight mb-4">
            Make every <span className="text-secondary">hour</span> count.
          </h1>
          <p className="text-white/70 max-w-sm">
            A calmer way to run your farm day. Keep your people, plans, and payroll moving together.
          </p>
          <div className="flex gap-8 mt-8">
            <div>
              <div className="text-2xl font-bold">07</div>
              <div className="text-white/50 text-sm">core modules</div>
            </div>
            <div>
              <div className="text-2xl font-bold">24/7</div>
              <div className="text-white/50 text-sm">live visibility</div>
            </div>
          </div>
        </div>

        <div className="text-white/50 text-sm">Built for the people who keep things growing →</div>
      </div>

      <div className="flex-1 flex items-center justify-center bg-white p-8">
        <div className="w-full max-w-sm">
          <div className="eyebrow mb-2">Secure access / 01</div>
          <h2 className="text-3xl font-bold mb-1">Good morning.</h2>
          <p className="text-neutralMid text-sm mb-6">Sign in to your farm operations workspace.</p>

          <div className="text-sm font-medium mb-2">Choose your role</div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <button
              onClick={() => setRole("Admin")}
              className={`flex items-center gap-2 p-3 rounded-card border text-left text-sm ${
                role === "Admin" ? "border-primary bg-primaryLight" : "border-gray-200"
              }`}
            >
              <ShieldCheck size={18} className="text-primary" />
              <div>
                <div className="font-semibold">Admin</div>
                <div className="text-neutralMid text-xs">Full access</div>
              </div>
            </button>
            <button
              onClick={() => setRole("Staff")}
              className={`flex items-center gap-2 p-3 rounded-card border text-left text-sm ${
                role === "Staff" ? "border-primary bg-primaryLight" : "border-gray-200"
              }`}
            >
              <Users size={18} className="text-primary" />
              <div>
                <div className="font-semibold">Staff</div>
                <div className="text-neutralMid text-xs">Personal view</div>
              </div>
            </button>
          </div>

          <label className="text-sm font-medium">Operator ID</label>
          <input defaultValue="admin01" className="w-full border border-gray-200 rounded-card px-3 py-2.5 mt-1 mb-4 text-sm" />

          <label className="text-sm font-medium">Password</label>
          <input type="password" defaultValue="password123" className="w-full border border-gray-200 rounded-card px-3 py-2.5 mt-1 mb-4 text-sm" />

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full bg-primary text-white rounded-card py-3 font-semibold flex items-center justify-center gap-2 hover:bg-navy"
          >
            Enter workspace <ArrowRight size={16} />
          </button>

          <p className="text-xs text-neutralMid mt-4 text-center">
            Your session is protected with role-based access and automatic timeout.
          </p>
        </div>
      </div>
    </div>
  );
}
