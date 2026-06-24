import Link from "next/link";
import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg px-3 py-1.5 font-medium transition-colors",
        active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
      )}
    >
      {children}
    </Link>
  );
}

export function Header({ active }: { active?: "chat" | "admin" }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600 text-white">
            <Scale className="h-4 w-4" />
          </span>
          RefundWise
        </Link>
        <nav className="ml-auto flex items-center gap-1 text-sm">
          <NavLink href="/chat" active={active === "chat"}>
            Customer chat
          </NavLink>
          <NavLink href="/admin" active={active === "admin"}>
            Admin
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
