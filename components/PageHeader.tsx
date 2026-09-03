import { ReactNode } from "react";

export default function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <div className="eyebrow mb-1">{eyebrow}</div>
        <h1 className="text-3xl font-bold text-neutralDark mb-1">{title}</h1>
        <p className="text-neutralMid text-sm">{description}</p>
      </div>
      {action}
    </div>
  );
}
