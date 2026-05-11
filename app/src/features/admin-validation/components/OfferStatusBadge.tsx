import { Badge } from "@/components/ui/badge";
import type { OfferStatus } from "@/lib/types";

interface OfferStatusBadgeProps {
  status: OfferStatus | null | undefined;
}

const STATUS_CONFIG: Record<
  OfferStatus,
  { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }
> = {
  draft: { label: "Brouillon", variant: "soft" },
  pending_review: { label: "En cours", variant: "info" },
  published: { label: "Validé", variant: "success" },
  rejected: { label: "Rejetée", variant: "destructive" },
};

export function OfferStatusBadge({ status }: OfferStatusBadgeProps) {
  const cfg = status ? STATUS_CONFIG[status] : null;
  if (!cfg) {
    return <Badge variant="outline">Inconnu</Badge>;
  }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
