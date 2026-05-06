import { Outlet, NavLink } from "react-router-dom";
import { Inbox, Plane, ShieldCheck } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/admin/validation", label: "Validation", icon: Inbox },
];

export function AdminLayout() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/70 backdrop-blur supports-[backdrop-filter]:bg-card/55">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-6 px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.35),0_8px_24px_-12px_hsl(var(--primary)/0.6)]">
              <Plane className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">TrackTreck</span>
            <Badge variant="soft" className="hidden sm:inline-flex">
              Admin
            </Badge>
          </div>

          <nav className="flex flex-1 items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                    isActive &&
                      "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Clé anon uniquement · clé service jamais exposée</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
