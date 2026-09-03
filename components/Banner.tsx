import { ReactNode } from "react";

export default function Banner({
  children,
  variant = "info",
}: {
  children: ReactNode;
  variant?: "info" | "warning";
}) {
  const styles =
    variant === "info"
      ? "bg-navy text-white"
      : "bg-secondaryLight text-neutralDark border border-secondary/30";
  return <div className={`rounded-card p-4 flex items-center justify-between ${styles}`}>{children}</div>;
}
