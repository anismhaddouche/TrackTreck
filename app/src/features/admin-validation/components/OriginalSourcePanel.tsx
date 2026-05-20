import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileText,
  ImageOff,
  Image as ImageIcon,
  Inbox,
  Loader2,
  Lock,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { resolveOfferSource } from "@/lib/source-resolver";
import type { ResolvedSource } from "@/lib/source-resolver";

interface OriginalSourcePanelProps {
  offerId: number;
  agencyId: number | null;
  agencyName: string | null;
  title: string | null;
  countries: string[] | null;
  photoUrls: string[] | null;
}

export function OriginalSourcePanel({
  offerId,
  agencyId,
  agencyName,
  title,
  countries,
  photoUrls,
}: OriginalSourcePanelProps) {
  // Stable, primitive-only cache key. photo_urls is the source of truth for
  // anchors; agency/title/countries only affect agency labelling, not the
  // source resolution, so they are deliberately NOT part of the key.
  const photoKey = (photoUrls ?? []).join("|");
  const { data, isLoading, isError } = useQuery({
    queryKey: ["offer-source", offerId, photoKey],
    queryFn: ({ signal }) =>
      resolveOfferSource(
        {
          offerId,
          agencyId,
          agencyName,
          title,
          countries,
          photoUrls,
        },
        { signal },
      ),
    // Public Storage URLs are stable; cache aggressively to avoid re-probing
    // when the user navigates back to the same offer.
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: false,
  });

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardContent className="flex flex-1 flex-col overflow-hidden p-3">
        {isLoading ? (
          <LoadingState />
        ) : isError || !data ? (
          <EmptyState
            icon={AlertTriangle}
            tone="error"
            title="Impossible de charger les fichiers sources"
            description="Le stockage est peut-être inaccessible ou aucune ressource n'est associée à cette offre."
          />
        ) : data.status === "listing-blocked" ? (
          <EmptyState
            icon={Lock}
            tone="warning"
            title="Impossible de charger les fichiers sources"
            description="Vérifiez les politiques Storage ou les chemins des assets. Le rôle anon n'a peut-être pas accès en lecture à ce préfixe."
          />
        ) : data.status === "no-anchor" || !data.hasAny ? (
          <EmptyState
            icon={Inbox}
            tone="muted"
            title="Aucune source originale trouvée pour cette offre."
            description="Aucune image, PDF ou légende n'a été trouvée dans le bucket Storage pour cette offre."
          />
        ) : (
          <SourceTabs data={data} />
        )}
      </CardContent>
    </Card>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Résolution des fichiers sources…
      </div>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-[55vh] w-full" />
    </div>
  );
}

function SourceTabs({ data }: { data: ResolvedSource }) {
  const initial = firstAvailableTab(data);
  const hasText = Boolean(data.captionText || data.captionError || data.textFiles.length);
  const hasImages = data.imageUrls.length > 0;
  const hasPdf = Boolean(data.pdfUrl);

  return (
    <Tabs defaultValue={initial} className="flex flex-1 flex-col">
      <TabsList className="self-start">
        {hasText ? (
          <TabsTrigger value="text" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Texte
          </TabsTrigger>
        ) : null}
        {hasImages ? (
          <TabsTrigger value="image" className="gap-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            Image
            <Badge variant="soft" className="ml-1 h-5 px-1.5 text-[10px]">
              {data.imageUrls.length}
            </Badge>
          </TabsTrigger>
        ) : null}
        {hasPdf ? (
          <TabsTrigger value="pdf" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            PDF
          </TabsTrigger>
        ) : null}
      </TabsList>

      <Separator className="my-3" />

      <TabsContent value="text" className="flex-1 overflow-hidden">
        {data.captionText ? (
          <ScrollArea className="h-[calc(100vh-16rem)] min-h-[60vh] rounded-md border bg-muted/30">
            <pre className="whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed text-foreground/90">
              {data.captionText}
            </pre>
          </ScrollArea>
        ) : data.captionError ? (
          <EmptyState
            icon={AlertTriangle}
            tone="error"
            title="Impossible de charger le texte source."
          />
        ) : (
          <EmptyState
            icon={FileText}
            tone="muted"
            title="Aucune légende texte trouvée"
          />
        )}
      </TabsContent>

      <TabsContent value="image" className="flex-1 overflow-hidden">
        {data.imageUrls.length > 0 ? (
          <ScrollArea className="h-[calc(100vh-16rem)] min-h-[60vh] rounded-md border bg-muted/30">
            <div className="flex flex-col gap-3 p-3">
              {data.imageUrls.map((url, idx) => (
                <ImagePreview key={url} url={url} index={idx + 1} />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <EmptyState
            icon={ImageOff}
            tone="muted"
            title="Aucune image trouvée"
          />
        )}
      </TabsContent>

      <TabsContent value="pdf" className="flex-1 overflow-hidden">
        {data.pdfUrl ? (
          <div className="flex flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="sm">
                <a href={data.pdfUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ouvrir le PDF
                </a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a
                  href={data.pdfUrl}
                  download={data.pdfName ?? "source.pdf"}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download className="h-3.5 w-3.5" />
                  Télécharger le PDF
                </a>
              </Button>
              {data.pdfName ? (
                <span className="text-xs text-muted-foreground">
                  {data.pdfName}
                </span>
              ) : null}
            </div>
            <iframe
              src={data.pdfUrl}
              title="PDF source original"
              className="h-[calc(100vh-18rem)] min-h-[55vh] w-full rounded-md border bg-background"
            />
          </div>
        ) : (
          <EmptyState
            icon={FileText}
            tone="muted"
            title="Aucun PDF trouvé"
          />
        )}
      </TabsContent>
    </Tabs>
  );
}

function ImagePreview({ url, index }: { url: string; index: number }) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setState("ok");
    img.onerror = () => !cancelled && setState("error");
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state === "error") {
    return (
      <div className="flex items-center gap-3 rounded-md border bg-background p-3 text-xs text-muted-foreground">
        <ImageOff className="h-4 w-4 text-amber-500" />
        L'image n°{index} n'a pas pu être chargée (URL expirée ou ressource
        supprimée).
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="block overflow-hidden rounded-md border bg-background ring-offset-background transition-shadow hover:shadow-md"
    >
      {state === "loading" ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <img
          src={url}
          alt={`Source originale n°${index}`}
          className="h-auto w-full object-contain"
          loading="lazy"
        />
      )}
    </a>
  );
}

function firstAvailableTab(data: ResolvedSource): string {
  if (data.captionText) return "text";
  if (data.imageUrls.length > 0) return "image";
  if (data.pdfUrl) return "pdf";
  return "text";
}

function EmptyState({
  icon: Icon,
  title,
  description,
  tone = "muted",
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  tone?: "muted" | "warning" | "error";
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
      : tone === "error"
        ? "border-destructive/50 bg-destructive/10 text-destructive"
        : "border-dashed border-border bg-muted/30 text-foreground";

  return (
    <div
      className={`flex flex-1 flex-col items-center justify-center gap-2 rounded-md border p-8 text-center ${toneClass}`}
    >
      <Icon className="h-8 w-8 opacity-70" />
      <p className="text-sm font-medium">{title}</p>
      {description ? (
        <p className="max-w-md text-xs opacity-80">{description}</p>
      ) : null}
    </div>
  );
}
