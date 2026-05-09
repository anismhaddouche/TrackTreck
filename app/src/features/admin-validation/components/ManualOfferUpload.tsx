import { useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

const ACCEPT = "image/*,application/pdf";

export function ManualOfferUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const hasWebhook = Boolean(env.pipelineWebhookUrl);
  const trimmedText = text.trim();
  const canSubmit = !submitting && (trimmedText.length > 0 || file !== null);

  function handleFile(picked: File | null | undefined) {
    if (!picked) return;
    setFile(picked);
  }

  function clearFile() {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!trimmedText && !file) {
      toast.error("Saisissez du texte ou choisissez un fichier (PDF / image).");
      return;
    }
    if (!hasWebhook) {
      toast.info("Endpoint d'extraction non configuré.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      if (trimmedText) formData.append("text", trimmedText);
      if (file) formData.append("file", file, file.name);

      const res = await fetch(env.pipelineWebhookUrl, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Webhook a renvoyé ${res.status}${body ? ` : ${body.slice(0, 200)}` : ""}`,
        );
      }

      toast.success(
        "Envoyé au pipeline. Le brouillon arrivera ici une fois extrait.",
      );
      setText("");
      clearFile();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      toast.error(`Échec de l'envoi : ${message}`);
    } finally {
      setSubmitting(false);
    }
  }

  const FileIcon = file?.type.startsWith("image/")
    ? ImageIcon
    : file
      ? FileText
      : Upload;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 border-b bg-muted/30">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Manual upload
          </CardTitle>
          {hasWebhook ? (
            <Badge variant="success">Endpoint configured</Badge>
          ) : (
            <Badge variant="warning" className="gap-1">
              <Settings2 className="h-3 w-3" />
              Not configured
            </Badge>
          )}
        </div>
        <CardDescription>
          Collez du texte, déposez un PDF / image, ou les deux. Le pipeline
          d&apos;extraction crée un brouillon prêt à valider.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-5">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="manual-text" className="text-xs font-medium">
              Texte de l&apos;offre (optionnel)
            </Label>
            <Textarea
              id="manual-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Collez ici le message WhatsApp / l'offre brute…"
              rows={5}
              disabled={submitting}
              className="resize-y"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs font-medium">
              Fichier (optionnel · PDF ou image)
            </Label>
            <label
              htmlFor="manual-upload"
              onDragOver={(e) => {
                e.preventDefault();
                if (!submitting) setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (submitting) return;
                handleFile(e.dataTransfer.files?.[0]);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/20 hover:bg-muted/40",
                submitting && "pointer-events-none opacity-60",
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-background shadow-sm">
                <FileIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              {file ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(file.size / 1024)} KB ·{" "}
                    {file.type || "unknown type"}
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    Glissez un PDF ou une image
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ou cliquez pour parcourir · 1 fichier max
                  </p>
                </div>
              )}
              <input
                ref={inputRef}
                id="manual-upload"
                type="file"
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => handleFile(e.target.files?.[0])}
                disabled={submitting}
              />
            </label>
          </div>

          {!hasWebhook ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>Pipeline endpoint not configured.</strong>{" "}
              Définissez <code>VITE_N8N_INGESTION_WEBHOOK_URL</code> dans{" "}
              <code>.env.local</code> et redémarrez le dev server.
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            {file ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFile}
                disabled={submitting}
              >
                <X className="h-4 w-4" />
                Retirer le fichier
              </Button>
            ) : null}
            <Button type="submit" disabled={!canSubmit}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Envoyer au pipeline
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
