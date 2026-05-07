import { useOffersToValidate } from "../hooks/useOffers";
import { OffersReviewList } from "../components/OffersReviewList";
import { ManualOfferUpload } from "../components/ManualOfferUpload";

export function AdminValidationPage() {
  const { data, isLoading, isError, error } = useOffersToValidate();

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-primary/80">
          Pipeline des offres
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          File de validation
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Vérifiez les offres extraites avant leur mise en ligne. Comparez la
          source originale avec les données structurées, corrigez ce qui doit
          l'être, puis validez ou supprimez le brouillon.
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
