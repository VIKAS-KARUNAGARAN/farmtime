import { Landing } from "@/components/Landing";
import { HashApp } from "@/components/HashApp";

// In preview mode every screen is served from this page via hash routes.
export default function Page() {
  return process.env.NEXT_PUBLIC_HASH_ROUTER === "1" ? <HashApp /> : <Landing />;
}
