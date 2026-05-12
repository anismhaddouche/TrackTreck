import { Outlet } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export function AdminLayout() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-background/95">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur supports-[backdrop-filter]:bg-background/55">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground/90">
              Administration
            </span>
            <Badge variant="soft" className="text-[10px]">
              TrackTreck
            </Badge>
          </div>

          <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span>Session sécurisée · clé anonyme</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
