import Link from "@/lib/nav";
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="label">404</p>
      <h1 className="text-2xl font-bold">This page doesn’t exist</h1>
      <Link href="/" className="text-sm text-muted underline underline-offset-2 hover:text-fg">Back to entrances</Link>
    </div>
  );
}
