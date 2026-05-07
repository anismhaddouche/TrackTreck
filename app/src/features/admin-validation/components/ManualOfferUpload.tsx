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

import { cn } from "@/lib/utils";

const ACCEPT = "image/*,application/pdf";

export function ManualOfferUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [submitting] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const hasWebhook = false;

  function handleFile(picked: File | null | undefined) {
    if (!picked) return;
    setFile(picked);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      toast.error("Choose a PDF or an image first.");
      return;
    }
    if (!hasWebhook) {
      // TODO: wire this once the n8n manual-ingestion webhook is provisioned.
      toast.info("Endpoint d'extraction non configure.");
      return;
    }

    toast.info("Endpoint d'extraction non configure.");
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
          Upload a PDF or an image to manually trigger the extraction workflow.
          The result will land here as a draft awaiting review.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-5">
        <form className="space-y-4" onSubmit={handleSubmit}>
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
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-8 text-center transition-colors",
              dragActive
                ? "border-primary bg-primary/5"
                : "border-slate-300 bg-muted/20 hover:bg-muted/40",
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
                  {Math.round(file.size / 1024)} KB · {file.type || "unknown type"}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Drop a PDF or an image here
                </p>
                <p className="text-xs text-muted-foreground">
                  or click to browse · max 1 file
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

          {!hasWebhook ? (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>Pipeline endpoint not configured.</strong>{" "}
              Configurez un endpoint cote serveur pour activer les declenchements
              manuels.
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            {file ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                disabled={submitting}
              >
                <X className="h-4 w-4" />
                Clear
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting || !file}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Send to extraction
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
