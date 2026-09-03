const colors = ["#3E7CB1", "#E0A458", "#4CA771", "#1E3A5F", "#D9534F"];

function hashColor(name: string) {
  const sum = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return colors[sum % colors.length];
}

export default function AvatarInitials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
      style={{ backgroundColor: hashColor(name) }}
    >
      {initials}
    </div>
  );
}
