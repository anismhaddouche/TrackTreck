import { useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Settings2,
  ShieldCheck,
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
import { env, describeWebhookConfigIssue } from "@/lib/env";

// Field names the n8n "manual-ingestion" Webhook node consumes.
// `file`  -> Binary parameter (PDF / image), filename + MIME preserved by the browser.
// `text`  -> Body parameter (raw offer text from the textarea).
// Keep these in sync with the Webhook node configuration in the n8n workflow.
const N8N_FIELD_FILE = "file";
const N8N_FIELD_TEXT = "text";

function describeResponseBody(contentType: string | null, body: string): string {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("text/html")) return "réponse HTML (page d'erreur)";
  if (ct.includes("application/json")) {
    try {
      const parsed = JSON.parse(body) as { message?: unknown; error?: unknown };
      const candidate =
        typeof parsed?.message === "string"
          ? parsed.message
          : typeof parsed?.error === "string"
            ? parsed.error
            : null;
      if (candidate) return candidate.slice(0, 200);
    } catch {
      // fall through to the plain-text snippet
    }
  }
  const snippet = body.replace(/\s+/g, " ").trim().slice(0, 200);
  return snippet || "réponse vide";
}

const ACCEPT = "image/*,application/pdf";

export function ManualOfferUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const webhookIssue = describeWebhookConfigIssue();
  const hasWebhook = Boolean(env.pipelineWebhookUrl) && webhookIssue === null;
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
      toast.error("Veuillez saisir un texte ou ajouter un fichier.");
      return;
    }
    if (!hasWebhook) {
      toast.error(
        webhookIssue
          ? `Endpoint d'extraction non configuré : ${webhookIssue}`
          : "Endpoint d'extraction non configuré.",
      );
      return;
    }

    setSubmitting(true);
    const webhookUrl = env.pipelineWebhookUrl;
    const hasText = trimmedText.length > 0;
    const hasFile = file !== null;

    // Diagnostic line — do NOT log secrets or full payload content.
    console.info("[manual-upload] POST", {
      url: webhookUrl,
      hasText,
      textLength: trimmedText.length,
      hasFile,
      fileName: file?.name ?? null,
      fileType: file?.type ?? null,
      fileSize: file?.size ?? null,
      fields: [
        ...(hasText ? [N8N_FIELD_TEXT] : []),
        ...(hasFile ? [N8N_FIELD_FILE] : []),
      ],
    });

    try {
      // multipart/form-data — DO NOT set Content-Type manually, the browser
      // appends the multipart boundary automatically.
      const formData = new FormData();
      if (hasText) formData.append(N8N_FIELD_TEXT, trimmedText);
      if (hasFile && file) formData.append(N8N_FIELD_FILE, file, file.name);

      const res = await fetch(webhookUrl, {
        method: "POST",
        body: formData,
      });

      const contentType = res.headers.get("content-type");
      const rawBody = await res.text().catch(() => "");

      console.info("[manual-upload] response", {
        status: res.status,
        contentType,
        bodyPreview: rawBody.slice(0, 500),
      });

      if (!res.ok) {
        const reason = describeResponseBody(contentType, rawBody);
        toast.error(
          `Échec de l'envoi au pipeline : le webhook n8n a répondu ${res.status} (${reason}). Vérifiez l'exécution n8n correspondante.`,
        );
        return;
      }

      toast.success(
        "Envoyé au pipeline. Le brouillon arrivera ici une fois extrait.",
      );
      setText("");
      clearFile();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erreur inconnue";
      console.error("[manual-upload] network error", err);
      toast.error(`Échec de l'envoi au pipeline : ${message}`);
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
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="space-y-1.5 border-b bg-muted/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Téléversement manuel
          </CardTitle>
          {hasWebhook ? (
            <Badge variant="success" className="gap-1">
              <ShieldCheck className="h-3 w-3" />
              Endpoint configuré
            </Badge>
          ) : (
            <Badge variant="warning" className="gap-1">
              <Settings2 className="h-3 w-3" />
              Non configuré
            </Badge>
          )}
        </div>
        <CardDescription className="text-sm">
          Collez du texte, déposez un PDF ou une image, ou les deux. Le pipeline
          d&apos;extraction créera un brouillon prêt à valider.
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
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
              <strong>Endpoint du pipeline non configuré.</strong>{" "}
              {webhookIssue ?? null} Définissez{" "}
              <code>VITE_N8N_INGESTION_WEBHOOK_URL</code> dans{" "}
              <code>.env</code> (ex.{" "}
              <code>http://157.90.166.243/n8n/webhook/manual-ingestion</code>)
              puis reconstruisez l&apos;image admin.
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
