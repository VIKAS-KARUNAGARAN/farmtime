const styles: Record<string, string> = {
  Registered: "bg-primaryLight text-primary",
  Pending: "bg-secondaryLight text-secondary",
  Good: "bg-primaryLight text-primary",
  Check: "bg-secondaryLight text-secondary",
  High: "bg-red-100 text-danger",
  Review: "bg-secondaryLight text-secondary",
  "On shift": "bg-primaryLight text-primary",
  Scheduled: "bg-secondaryLight text-secondary",
};

export default function StatusBadge({ status }: { status: string }) {
  const style = styles[status] || "bg-gray-100 text-neutralMid";
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${style}`}>
      {status}
    </span>
  );
}
