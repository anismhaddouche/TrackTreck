import { useOffersToValidate } from "../hooks/useOffers";
import { OffersReviewList } from "../components/OffersReviewList";
import { ManualOfferUpload } from "../components/ManualOfferUpload";

export function AdminValidationPage() {
  const { data, isLoading, isError, error } = useOffersToValidate();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-primary/70">
          Offer pipeline
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          Validation queue
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Review extracted offers before they go live. Compare the original
          source content with the structured data, fix anything off, then
          validate, reject, or delete the draft.
        </p>
      </header>

      <OffersReviewList
        offers={data ?? []}
        isLoading={isLoading}
        isError={isError}
        errorMessage={error instanceof Error ? error.message : undefined}
      />

      <ManualOfferUpload />
    </div>
  );
}
