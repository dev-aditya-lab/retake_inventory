import { Header } from "./Header";
import { Sidebar } from "./Sidebar";
import { BottomNav } from "./BottomNav";

/**
 * Shared authenticated-app layout: top header, desktop sidebar, mobile bottom
 * nav. Wrap protected route groups with this once auth (Phase 1) is wired up.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1 overflow-x-hidden px-4 py-4 pb-20 sm:px-6 sm:py-6 md:pb-6">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
