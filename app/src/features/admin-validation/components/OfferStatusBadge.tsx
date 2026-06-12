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
      "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:border-slate-500/50 dark:bg-slate-500/25 dark:text-slate-100 dark:hover:bg-slate-500/30",
  },
  pending_review: {
    label: "En cours",
    variant: "info",
    className:
      "border-sky-300 bg-sky-100 text-sky-900 hover:bg-sky-200 dark:border-sky-400/60 dark:bg-sky-500/25 dark:text-sky-100 dark:hover:bg-sky-500/30",
  },
  published: {
    label: "Validé",
    variant: "success",
    className:
      "border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200 dark:border-emerald-400/60 dark:bg-emerald-500/25 dark:text-emerald-100 dark:hover:bg-emerald-500/30",
  },
  rejected: {
    label: "Rejetée",
    variant: "destructive",
    className:
      "border-red-300 bg-red-100 text-red-900 hover:bg-red-200 dark:border-transparent dark:bg-destructive dark:text-destructive-foreground dark:hover:bg-destructive/90",
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
