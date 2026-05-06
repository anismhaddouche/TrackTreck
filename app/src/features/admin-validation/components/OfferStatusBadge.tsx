import { Badge } from "@/components/ui/badge";
import type { OfferStatus } from "@/lib/types";

interface OfferStatusBadgeProps {
  status: OfferStatus | null | undefined;
}

const STATUS_CONFIG: Record<
  OfferStatus,
  { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }
> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_review: { label: "Pending review", variant: "warning" },
  published: { label: "Published", variant: "success" },
  rejected: { label: "Rejected", variant: "destructive" },
};

export function OfferStatusBadge({ status }: OfferStatusBadgeProps) {
  const cfg = status ? STATUS_CONFIG[status] : null;
  if (!cfg) {
    return <Badge variant="outline">Unknown</Badge>;
  }
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
