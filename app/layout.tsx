import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "FarmTime — Workforce Time Management System",
  description: "A calmer way to run your farm workforce, plans, and payroll.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
