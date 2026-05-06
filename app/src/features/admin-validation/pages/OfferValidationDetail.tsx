import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Ban,
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
  useRejectOffer,
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
  const reject = useRejectOffer();
  const remove = useDeleteOffer();

  const [draft, setDraft] = useState<TourDetail | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);

  const offer = draft ?? data;
  const dirty = useMemo(
    () => (data && offer ? JSON.stringify(offer) !== JSON.stringify(data) : false),
    [offer, data],
  );
  const isBusy =
    save.isPending || validate.isPending || reject.isPending || remove.isPending;

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
            Back to list
          </Link>
        </Button>
        <Card>
          <CardContent className="p-6 text-sm text-destructive">
            {error instanceof Error
              ? error.message
              : "Could not load this offer."}
          </CardContent>
        </Card>
      </div>
    );
  }

  async function handleSave() {
    if (!offer) return;
    try {
      await save.mutateAsync(offer);
      toast.success("Offer saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    }
  }

  async function handleValidate() {
    if (!offer) return;
    try {
      if (dirty) await save.mutateAsync(offer);
      await validate.mutateAsync(offer.id);
      toast.success("Offer validated.");
      navigate("/admin/validation");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Validation failed.");
    }
  }

  async function handleReject() {
    if (!offer) return;
    try {
      await reject.mutateAsync({
        offerId: offer.id,
        reason: rejectReason,
      });
      toast.success("Offer rejected.");
      setConfirmReject(false);
      setRejectReason("");
      navigate("/admin/validation");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reject failed.");
    }
  }

  async function handleDelete() {
    if (!offer) return;
    try {
      await remove.mutateAsync(offer.id);
      toast.success("Offer deleted.");
      setConfirmDelete(false);
      navigate("/admin/validation");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed.");
    }
  }

  function handleReset() {
    if (!data) return;
    setDraft(data);
    toast.info("Changes discarded.");
  }

  function handleDownload() {
    if (!offer) return;
    downloadOfferJson(offer);
  }

  return (
    <div className="space-y-5">
      {/* Top breadcrumb */}
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/admin/validation">
            <ArrowLeft className="h-4 w-4" />
            Back to list
          </Link>
        </Button>
      </div>

      {/* Header card */}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b bg-muted/40 p-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="soft">#{offer.id}</Badge>
              <OfferStatusBadge status={offer.status} />
              {offer.needs_review ? (
                <Badge variant="warning">Needs review</Badge>
              ) : null}
              {dirty ? <Badge variant="info">Unsaved changes</Badge> : null}
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance">
              {offer.title ?? (
                <span className="italic text-muted-foreground">
                  Untitled offer
                </span>
              )}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {offer.agency?.name ? (
                <span className="font-medium text-foreground">
                  {offer.agency.name}
                </span>
              ) : null}
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
                  <span>{offer.duration_nights} nights</span>
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

          <div className="flex flex-col items-end gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Lead price
            </span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatPrice(offer.lead_price)}
            </span>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isBusy || !dirty}
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
              Download JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={isBusy || !dirty}
            >
              {save.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save corrections
            </Button>
          </div>

          <Separator orientation="vertical" className="hidden h-6 sm:block" />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-amber-300 text-amber-900 hover:bg-amber-50"
              onClick={() => setConfirmReject(true)}
              disabled={isBusy}
            >
              <Ban className="h-4 w-4" />
              Reject
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={isBusy}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
            <Button
              size="sm"
              onClick={handleValidate}
              disabled={isBusy}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {validate.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Validate offer
            </Button>
          </div>
        </div>
      </Card>

      {/* Split view */}
      <div className="grid gap-4 lg:grid-cols-2">
        <OriginalSourcePanel
          offerId={offer.id}
          agencyId={offer.agency_id}
          countries={offer.countries}
          photoUrls={offer.photo_urls}
        />

        <Card className="flex h-full flex-col overflow-hidden">
          <div className="border-b bg-muted/40 p-4">
            <h2 className="text-base font-semibold">Extracted data</h2>
            <p className="text-sm text-muted-foreground">
              Edit fields directly or tweak the JSON. Both views stay in sync.
            </p>
          </div>
          <CardContent className="flex-1 p-4">
            <Tabs defaultValue="form" className="flex h-full flex-col">
              <TabsList className="self-start">
                <TabsTrigger value="form">Form</TabsTrigger>
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

      {/* Reject confirmation */}
      <AlertDialog open={confirmReject} onOpenChange={setConfirmReject}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Ban className="h-5 w-5 text-amber-600" />
              Reject this offer?
            </AlertDialogTitle>
            <AlertDialogDescription>
              The offer will be marked as <code>rejected</code> and removed from
              the validation queue. Provide an optional reason for the audit
              trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason (optional)</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              placeholder="e.g. Duplicate offer, missing prices, unreadable source…"
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className={cn(
                buttonVariants({ variant: "default" }),
                "bg-amber-600 hover:bg-amber-700",
              )}
              disabled={reject.isPending}
            >
              {reject.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              Reject offer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirmation */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete this offer permanently?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will remove offer <strong>#{offer.id}</strong> and its steps,
              hotel options and departures from the database. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
              Delete offer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
