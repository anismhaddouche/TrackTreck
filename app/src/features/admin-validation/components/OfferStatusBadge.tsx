import { Badge } from "@/components/ui/badge";
import type { OfferStatus } from "@/lib/types";

interface OfferStatusBadgeProps {
  status: OfferStatus | null | undefined;
}

const STATUS_CONFIG: Record<
  OfferStatus,
  {
    label: string;
    variant: React.ComponentProps<typeof Badge>["variant"];
    className: string;
  }
> = {
  draft: {
    label: "Brouillon",
    variant: "soft",
    className:
      "border-slate-500/50 bg-slate-500/25 text-slate-100 hover:bg-slate-500/30",
  },
  pending_review: {
    label: "En cours",
    variant: "info",
    className:
      "border-sky-400/60 bg-sky-500/25 text-sky-100 hover:bg-sky-500/30",
  },
  published: {
    label: "Validé",
    variant: "success",
    className:
      "border-emerald-400/60 bg-emerald-500/25 text-emerald-100 hover:bg-emerald-500/30",
  },
  rejected: {
    label: "Rejetée",
    variant: "destructive",
    className: "",
  },
};

export function OfferStatusBadge({ status }: OfferStatusBadgeProps) {
  const cfg = status ? STATUS_CONFIG[status] : null;
  if (!cfg) {
    return <Badge variant="outline">Inconnu</Badge>;
  }
  return (
    <Badge variant={cfg.variant} className={cfg.className}>
      {cfg.label}
    </Badge>
  );
}
