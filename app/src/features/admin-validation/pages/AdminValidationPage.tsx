import { useMemo, useState } from "react";

import { useOffersToValidate } from "../hooks/useOffers";
import { OffersReviewList } from "../components/OffersReviewList";
import { ManualOfferUpload } from "../components/ManualOfferUpload";
import { OffersDistributionKpiCard } from "../components/OffersDistributionKpiCard";
import type { OfferStatus } from "@/lib/types";

export function AdminValidationPage() {
  const { data, isLoading, isError, error } = useOffersToValidate();
  const offers = data ?? [];

  const [activeStatus, setActiveStatus] = useState<OfferStatus | "all">("all");

  const stats = useMemo(() => {
    let drafts = 0;
    let inProgress = 0;
    let validated = 0;
    for (const o of offers) {
      if (o.status === "draft") drafts++;
      else if (o.status === "pending_review") inProgress++;
      else if (o.status === "published") validated++;
      else drafts++;
    }
    return {
      total: offers.length,
      drafts,
      inProgress,
      validated,
    };
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

      {/* Grand KPI unifié façon Shadcn Studio (Total des offres + Répartition) */}
      <OffersDistributionKpiCard
        totalOffers={stats.total}
        draftsCount={stats.drafts}
        inProgressCount={stats.inProgress}
        validatedCount={stats.validated}
        isLoading={isLoading}
        activeStatus={activeStatus}
        onSelectStatus={setActiveStatus}
      />

      <OffersReviewList
        offers={offers}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error instanceof Error ? error.message : undefined}
        statusFilter={activeStatus}
        onStatusFilterChange={setActiveStatus}
      />

      <ManualOfferUpload />
    </div>
  );
}

