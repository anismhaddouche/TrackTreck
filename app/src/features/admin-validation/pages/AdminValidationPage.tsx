import { useMemo } from "react";
import { ClipboardCheck, FileEdit, Inbox } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { useOffersToValidate } from "../hooks/useOffers";
import { OffersReviewList } from "../components/OffersReviewList";
import { ManualOfferUpload } from "../components/ManualOfferUpload";

export function AdminValidationPage() {
  const { data, isLoading, isError, error } = useOffersToValidate();
  const offers = data ?? [];

  const stats = useMemo(() => {
    let toReview = 0;
    let drafts = 0;
    let inProgress = 0;
    for (const o of offers) {
      if (o.needs_review) toReview++;
      if (o.status === "draft") drafts++;
      if (o.status === "pending_review") inProgress++;
    }
    return { toReview, drafts, inProgress };
  }, [offers]);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">
          Pipeline des offres
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          File de validation
        </h1>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Inbox}
          label="Offres à vérifier"
          value={stats.toReview}
          tone="amber"
          loading={isLoading}
        />
        <StatCard
          icon={FileEdit}
          label="Brouillons"
          value={stats.drafts}
          tone="slate"
          loading={isLoading}
        />
        <StatCard
          icon={ClipboardCheck}
          label="En cours"
          value={stats.inProgress}
          tone="sky"
          loading={isLoading}
        />
      </div>

      <OffersReviewList
        offers={offers}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error instanceof Error ? error.message : undefined}
      />

      <ManualOfferUpload />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "amber" | "slate" | "sky";
  loading: boolean;
}) {
  const toneClasses: Record<typeof tone, string> = {
    amber: "from-amber-500/15 to-amber-500/0 text-amber-300",
    slate: "from-slate-400/15 to-slate-400/0 text-slate-300",
    sky: "from-sky-500/15 to-sky-500/0 text-sky-300",
  };
  return (
    <Card className="overflow-hidden border-border/60">
      <CardContent
        className={cn(
          "relative flex items-center justify-between gap-4 bg-gradient-to-br p-5",
          toneClasses[tone],
        )}
      >
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {label}
          </p>
          <p className="text-3xl font-semibold tabular-nums text-foreground">
            {loading ? "—" : value}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/50 p-2.5">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}
