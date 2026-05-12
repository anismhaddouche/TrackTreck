import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OfferStatusBadge } from "../components/OfferStatusBadge";

import { useOfferDetail } from "../hooks/useOfferDetail";
import {
  useDeleteOffer,
  useSaveOffer,
  useValidateOffer,
} from "../hooks/useOfferMutations";
import { OriginalSourcePanel } from "../components/OriginalSourcePanel";
import { ExtractedJsonPanel } from "../components/ExtractedJsonPanel";
import { EditableOfferForm } from "../components/EditableOfferForm";

import { downloadOfferJson } from "@/lib/download";
import { formatPrice } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TourDetail } from "@/lib/types";

export function OfferValidationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, error } = useOfferDetail(id);
  const save = useSaveOffer();
  const validate = useValidateOffer();
  const remove = useDeleteOffer();

  const [draft, setDraft] = useState<TourDetail | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const offer = draft ?? data;
  const dirty = useMemo(
    () => (data && offer ? JSON.stringify(offer) !== JSON.stringify(data) : false),
    [offer, data],
  );
  const isBusy = save.isPending || validate.isPending || remove.isPending;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-[60vh] w-full" />
      </div>
    );
  }
  if (isError || !data || !offer) {
    return (
      <div className="space-y-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/validation">
            <ArrowLeft className="h-4 w-4" />
            Retour à la liste
          </Link>
        </Button>
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Impossible de charger cette offre."}
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleSave() {
    if (!offer) return;
    try {
      await save.mutateAsync(offer);
      toast.success("Corrections enregistrées.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Échec de l'enregistrement.",
      );
    }
  }

  async function handleValidate() {
    if (!offer) return;
    try {
      if (dirty) await save.mutateAsync(offer);
      await validate.mutateAsync(offer.id);
      toast.success("Offre validée.");
      navigate("/admin/validation");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Échec de la validation.",
      );
    }
  }

  async function handleDelete() {
    if (!offer) return;
    try {
      await remove.mutateAsync(offer.id);
      toast.success("Offre supprimée.");
      setConfirmDelete(false);
      navigate("/admin/validation");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Échec de la suppression.",
      );
    }
  }

  function handleReset() {
    if (!data) return;
    setDraft(data);
    toast.info("Modifications annulées.");
  }

  function handleDownload() {
    if (!offer) return;
    downloadOfferJson(offer);
  }

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/admin/validation">
            <ArrowLeft className="h-4 w-4" />
            Retour à la liste
          </Link>
        </Button>
      </div>

      <Card className="overflow-hidden border-border/70">
        <div className="flex flex-col gap-4 border-b bg-gradient-to-br from-muted/60 to-muted/20 p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="soft" className="font-mono">
                #{offer.id}
              </Badge>
              <OfferStatusBadge status={offer.status} />
              {offer.needs_review ? (
                <Badge variant="warning">À vérifier</Badge>
              ) : null}
              {dirty ? (
                <Badge variant="info">Modifications non enregistrées</Badge>
              ) : null}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance lg:text-3xl">
              {offer.title ?? (
                <span className="italic text-muted-foreground">
                  Offre sans titre
                </span>
              )}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {offer.agency?.name || offer.sourceLabel ? (
                <span className="font-medium text-foreground">
                  {offer.agency?.name ?? offer.sourceLabel}
                </span>
              ) : (
                <span className="italic">Agence inconnue</span>
              )}
              {(offer.countries ?? []).length > 0 ? (
                <>
                  <span>·</span>
                  <span className="flex flex-wrap gap-1">
                    {(offer.countries ?? []).map((c) => (
                      <Badge key={c} variant="outline" className="font-normal">
                        {c}
                      </Badge>
                    ))}
                  </span>
                </>
              ) : null}
              {offer.duration_nights ? (
                <>
                  <span>·</span>
                  <span>{offer.duration_nights} nuits</span>
                </>
              ) : null}
              {offer.airline ? (
                <>
                  <span>·</span>
                  <span>{offer.airline}</span>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 rounded-lg border border-border/60 bg-background/40 px-4 py-3">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Prix d'appel
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatPrice(offer.lead_price)}
            </span>
          </div>
        </div>

        <div className="sticky top-14 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 bg-background/85 p-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isBusy || !dirty}
            >
              <RotateCcw className="h-4 w-4" />
              Réinitialiser
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Télécharger le JSON
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isBusy || !dirty}
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Enregistrer les corrections
            </Button>
          </div>

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={isBusy}
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </Button>
            <Button
              size="sm"
              onClick={handleValidate}
              disabled={isBusy}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {validate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Valider
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <OriginalSourcePanel
          offerId={offer.id}
          agencyId={offer.agency_id}
          agencyName={offer.agency?.name ?? offer.sourceLabel}
          title={offer.title}
          countries={offer.countries}
          photoUrls={offer.photo_urls}
        />

        <Card className="flex h-full flex-col overflow-hidden border-border/70">
          <div className="space-y-1 border-b bg-muted/30 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Données extraites
            </h2>
            <p className="text-sm text-muted-foreground/80">
              Modifiez les champs directement ou ajustez le JSON. Les deux vues
              restent synchronisées.
            </p>
          </div>
          <CardContent className="flex-1 p-4">
            <Tabs defaultValue="form" className="flex h-full flex-col">
              <TabsList className="self-start">
                <TabsTrigger value="form">Formulaire</TabsTrigger>
                <TabsTrigger value="json">JSON</TabsTrigger>
              </TabsList>
              <TabsContent value="form" className="mt-4 flex-1">
                <div className="max-h-[65vh] overflow-y-auto pr-2">
                  <EditableOfferForm offer={offer} onChange={setDraft} />
                </div>
              </TabsContent>
              <TabsContent value="json" className="mt-4 flex-1">
                <ExtractedJsonPanel offer={offer} onChange={setDraft} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Supprimer définitivement cette offre ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              L'offre <strong>#{offer.id}</strong> ainsi que ses étapes,
              options d'hôtels et départs seront supprimés de la base de
              données. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className={cn(buttonVariants({ variant: "destructive" }))}
              disabled={remove.isPending}
            >
              {remove.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Supprimer l'offre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
