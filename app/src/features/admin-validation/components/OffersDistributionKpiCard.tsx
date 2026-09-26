import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { CategoryBar } from "@/components/ui/category-bar";
import { cn } from "@/lib/utils";
import type { OfferStatus } from "@/lib/types";

export interface OffersDistributionKpiCardProps {
  totalOffers: number;
  draftsCount: number;
  inProgressCount: number;
  validatedCount: number;
  isLoading?: boolean;
  activeStatus?: OfferStatus | "all";
  onSelectStatus?: (status: OfferStatus | "all") => void;
  className?: string;
}

export function OffersDistributionKpiCard({
  totalOffers,
  draftsCount,
  inProgressCount,
  validatedCount,
  isLoading = false,
  activeStatus = "all",
  onSelectStatus,
  className,
}: OffersDistributionKpiCardProps) {
  const total = totalOffers;

  const draftsPct =
    total > 0 ? ((draftsCount / total) * 100).toFixed(1) : "0.0";
  const inProgressPct =
    total > 0 ? ((inProgressCount / total) * 100).toFixed(1) : "0.0";
  const validatedPct =
    total > 0 ? ((validatedCount / total) * 100).toFixed(1) : "0.0";

  const items = [
    {
      status: "draft" as const,
      label: "Offres brouillons",
      count: draftsCount,
      percentage: draftsPct,
      colorClass: "bg-sky-500",
    },
    {
      status: "pending_review" as const,
      label: "En cours de revue",
      count: inProgressCount,
      percentage: inProgressPct,
      colorClass: "bg-amber-500",
    },
    {
      status: "published" as const,
      label: "Validées & publiées",
      count: validatedCount,
      percentage: validatedPct,
      colorClass: "bg-emerald-500",
    },
  ];

  return (
    <Card
      className={cn(
        "overflow-hidden border-border/70 bg-card shadow-sm transition-all",
        className,
      )}
    >
      <CardHeader className="pb-3 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Volume des offres
          </p>
          {activeStatus !== "all" && onSelectStatus && (
            <button
              type="button"
              onClick={() => onSelectStatus("all")}
              className="text-xs text-primary hover:underline font-medium"
            >
              Réinitialiser le filtre
            </button>
          )}
        </div>
        <p className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground tabular-nums">
          {isLoading ? (
            "—"
          ) : (
            <>
              {total}{" "}
              <span className="text-base font-normal text-muted-foreground">
                offre{total > 1 ? "s" : ""}
              </span>
            </>
          )}
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <p className="text-xs text-muted-foreground mb-2 font-medium">
            Répartition par statut de validation
          </p>
          <CategoryBar
            items={[
              {
                value: draftsCount,
                colorClassName: "bg-sky-500",
                tooltip: `Brouillons : ${draftsCount} (${draftsPct}%)`,
              },
              {
                value: inProgressCount,
                colorClassName: "bg-amber-500",
                tooltip: `En cours : ${inProgressCount} (${inProgressPct}%)`,
              },
              {
                value: validatedCount,
                colorClassName: "bg-emerald-500",
                tooltip: `Validées : ${validatedCount} (${validatedPct}%)`,
              },
            ]}
          />
        </div>

        {/* 3 indicateurs restants cliquables */}
        <div className="space-y-2.5">
          {items.map((item) => {
            const isSelected = activeStatus === item.status;
            return (
              <button
                key={item.status}
                type="button"
                onClick={() => {
                  if (onSelectStatus) {
                    onSelectStatus(isSelected ? "all" : item.status);
                  }
                }}
                className={cn(
                  "group flex w-full items-center justify-between p-3.5 rounded-xl border text-left transition-all",
                  "bg-muted/30 hover:bg-muted/70 border-border/60 hover:border-border",
                  isSelected &&
                    "ring-2 ring-primary border-primary bg-muted/80 shadow-sm",
                )}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={cn(
                      "w-1.5 h-8 rounded-full shrink-0",
                      item.colorClass,
                    )}
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">
                        {isLoading ? "—" : `${item.percentage}%`}
                      </span>{" "}
                      —{" "}
                      {isLoading
                        ? "—"
                        : `${item.count} offre${item.count > 1 ? "s" : ""}`}
                      {isSelected && (
                        <span className="ml-2 inline-flex items-center text-[10px] font-semibold text-primary">
                          (Filtré)
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <ArrowUpRight
                  className={cn(
                    "w-4 h-4 text-muted-foreground transition-transform group-hover:text-foreground group-hover:translate-x-0.5 group-hover:-translate-y-0.5",
                    isSelected && "text-primary",
                  )}
                />
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
