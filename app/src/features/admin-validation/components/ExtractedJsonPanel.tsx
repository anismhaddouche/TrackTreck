import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";

import { buildOfferJson } from "@/lib/download";
import type { TourDetail } from "@/lib/types";

interface ExtractedJsonPanelProps {
  offer: TourDetail;
  onChange: (next: TourDetail) => void;
}

// Allows raw JSON edits while keeping the form view in sync. Parse errors are
// surfaced inline; only valid JSON is propagated upward.
export function ExtractedJsonPanel({ offer, onChange }: ExtractedJsonPanelProps) {
  const initialJson = useMemo(
    () => JSON.stringify(buildOfferJson(offer), null, 2),
    // We deliberately re-seed the textarea only when the *identity* of the
    // offer changes, not on every keystroke from the form panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [offer.id],
  );

  const [text, setText] = useState(initialJson);
  const [error, setError] = useState<string | null>(null);

  // When the form panel changes the offer, refresh the textarea — but only if
  // the user is not in the middle of a manual edit that hasn't been parsed.
  useEffect(() => {
    const projected = JSON.stringify(buildOfferJson(offer), null, 2);
    setText(projected);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer]);

  function handleChange(value: string) {
    setText(value);
    try {
      const parsed = JSON.parse(value) as Partial<TourDetail>;
      setError(null);
      onChange({ ...offer, ...parsed, id: offer.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/50 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
          <span>{error}</span>
        </div>
      ) : null}
      <ScrollArea className="h-[60vh] rounded-md border">
        <Textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          spellCheck={false}
          className="min-h-[60vh] resize-none border-0 font-mono text-xs leading-relaxed focus-visible:ring-0"
        />
      </ScrollArea>
    </div>
  );
}
