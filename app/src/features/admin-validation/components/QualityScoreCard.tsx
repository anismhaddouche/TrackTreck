import { useState } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CircularScore } from "@/components/ui/circular-score";

import {
  type DimensionScore,
  type TourQualityScoreResult,
} from "@/lib/quality-score";
import { cn } from "@/lib/utils";

interface QualityScoreCardProps {
  scoreResult: TourQualityScoreResult;
  onFocusField?: (fieldId: string) => void;
  className?: string;
}

export function QualityScoreCard({
  scoreResult,
  onFocusField,
  className,
}: QualityScoreCardProps) {
  const [showAllDimensions, setShowAllDimensions] = useState(false);

  const { score, badgeLabel, badgeVariant, summary, dimensions, missingItems } =
    scoreResult;

  const dimensionList = Object.values(dimensions) as DimensionScore[];

  return (
    <Card className={cn("overflow-hidden border-border/70 shadow-sm", className)}>
      <CardHeader className="border-b bg-gradient-to-r from-muted/50 via-muted/20 to-transparent py-4 px-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-semibold tracking-wide uppercase text-foreground">
              Score de Complétude & Qualité
            </CardTitle>
          </div>
          <Badge variant={badgeVariant} className="text-xs font-medium">
            {badgeLabel}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {/* Top Summary Block: Circular Gauge + Metrics */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
          <div className="flex-shrink-0">
            <CircularScore
              score={score}
              size="lg"
              showLabel
              subLabel="Complétude"
            />
          </div>

          <div className="flex-1 space-y-2 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
              <span className="text-2xl font-bold tracking-tight">
                {score} / 100 pts
              </span>
              <span className="text-sm text-muted-foreground">
                ({summary.completedDimensions} sur {summary.totalDimensions} critères validés)
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              {score >= 80
                ? "Offre riche et complète, prête pour publication et valorisation sur le moteur de recherche."
                : score >= 60
                  ? "Données solides. Quelques ajouts (services ou déclinaisons) permettront d'atteindre l'excellence."
                  : score >= 40
                    ? "Informations partielles. Renseignez les éléments manquants pour optimiser la conversion des agences."
                    : "Données critiques incomplètes. Complétez les tarifs, étapes ou dates de vol indispensables."}
            </p>

            {/* Quick Micro Progress Bar */}
            <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-muted/60">
              <div
                className={cn(
                  "h-full transition-all duration-700 ease-out rounded-full",
                  score >= 80
                    ? "bg-emerald-500"
                    : score >= 60
                      ? "bg-sky-500"
                      : score >= 40
                        ? "bg-amber-500"
                        : "bg-rose-500",
                )}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        </div>

        {/* Actionable Checklist: "Ce qu'il manque pour atteindre 100%" */}
        {missingItems.length > 0 ? (
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between border-t border-border/50 pt-4">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
                Actions recommandées pour atteindre 100 % ({missingItems.length})
              </span>
              <span className="text-xs text-muted-foreground font-mono">
                +{100 - score} pts à gagner
              </span>
            </div>

            <div className="space-y-2">
              {missingItems.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="group flex items-start justify-between gap-3 rounded-lg border border-border/60 bg-muted/20 p-2.5 hover:bg-muted/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                      <span className="text-xs font-semibold text-foreground">
                        {item.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground pl-5.5 leading-normal">
                      {item.hint}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge
                      variant="outline"
                      className="bg-primary/5 text-primary border-primary/20 font-bold font-mono text-[10px]"
                    >
                      +{item.pointsToGain} %
                    </Badge>

                    {item.fieldFocusId && onFocusField ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs opacity-80 group-hover:opacity-100"
                        onClick={() => onFocusField(item.fieldFocusId!)}
                      >
                        Compléter
                        <ArrowUpRight className="ml-1 h-3 w-3" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {missingItems.length > 5 ? (
              <p className="text-center text-[11px] text-muted-foreground italic">
                Et {missingItems.length - 5} autre(s) optimisation(s) détaillée(s) ci-dessous.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 flex items-center gap-2.5 text-emerald-800 dark:text-emerald-300 text-xs">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            <span>Félicitations ! Toutes les dimensions sont complètes à 100 %.</span>
          </div>
        )}

        {/* Collapsible Details: All 11 Dimensions */}
        <div className="border-t border-border/50 pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAllDimensions(!showAllDimensions)}
            className="w-full justify-between text-xs text-muted-foreground hover:text-foreground h-8 px-2"
          >
            <span>Détail des 11 critères de pondération</span>
            {showAllDimensions ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {showAllDimensions ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
              {dimensionList.map((d) => (
                <div
                  key={d.key}
                  className="rounded-md border border-border/50 bg-background/50 p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">{d.label}</span>
                    <Badge
                      variant={
                        d.status === "complete"
                          ? "success"
                          : d.status === "partial"
                            ? "warning"
                            : "outline"
                      }
                      className="text-[10px] py-0 h-4"
                    >
                      {d.earned} / {d.weight} pts
                    </Badge>
                  </div>

                  <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        d.status === "complete"
                          ? "bg-emerald-500"
                          : d.status === "partial"
                            ? "bg-amber-500"
                            : "bg-muted",
                      )}
                      style={{ width: `${d.percentage}%` }}
                    />
                  </div>

                  {d.missingHints.length > 0 ? (
                    <p className="text-[10px] text-muted-foreground italic leading-tight">
                      {d.missingHints[0]}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
