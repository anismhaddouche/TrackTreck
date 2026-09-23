import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Clock,
  Filter,
  PackageOpen,
  Plane,
  Search,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { OfferStatusBadge } from "./OfferStatusBadge";

import { formatDate, formatPrice } from "@/lib/utils";
import { CircularScore } from "@/components/ui/circular-score";
import type { TourSummary } from "@/lib/types";

interface OffersReviewListProps {
  offers: TourSummary[];
  isLoading: boolean;
  isError: boolean;
  errorMessage?: string;
}

export function OffersReviewList({
  offers,
  isLoading,
  isError,
  errorMessage,
}: OffersReviewListProps) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState("all");
  const [agencyId, setAgencyId] = useState("all");
  const [scoreFilter, setScoreFilter] = useState("all");
  const [sortBy, setSortBy] = useState("created_desc");

  const countries = useMemo(() => {
    const set = new Set<string>();
    for (const o of offers) for (const c of o.countries ?? []) if (c) set.add(c);
    return Array.from(set).sort();
  }, [offers]);

  const agencies = useMemo(() => {
    const map = new Map<number, string>();
    for (const o of offers) if (o.agency) map.set(o.agency.id, o.agency.name);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [offers]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const result = offers.filter((o) => {
      if (s && !(o.title ?? "").toLowerCase().includes(s)) return false;
      if (country !== "all" && !(o.countries ?? []).includes(country))
        return false;
      if (agencyId !== "all" && String(o.agency_id ?? "") !== agencyId)
        return false;
      const score = o.quality_score ?? 0;
      if (scoreFilter === "excellent" && score < 80) return false;
      if (scoreFilter === "good" && (score < 60 || score >= 80)) return false;
      if (scoreFilter === "fair" && (score < 40 || score >= 60)) return false;
      if (scoreFilter === "poor" && score >= 40) return false;
      return true;
    });

    return result.sort((a, b) => {
      if (sortBy === "score_desc") return (b.quality_score ?? 0) - (a.quality_score ?? 0);
      if (sortBy === "score_asc") return (a.quality_score ?? 0) - (b.quality_score ?? 0);
      if (sortBy === "price_asc") return (a.lead_price ?? 0) - (b.lead_price ?? 0);
      if (sortBy === "price_desc") return (b.lead_price ?? 0) - (a.lead_price ?? 0);
      return new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime();
    });
  }, [offers, search, country, agencyId, scoreFilter, sortBy]);

  const totalShown = filtered.length;

  return (
    <Card className="overflow-hidden border-border/70">
      <CardHeader className="space-y-3 border-b bg-muted/30">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Offres en attente
            </CardTitle>
            <CardDescription>
              Brouillons extraits par le pipeline — vérifiez, corrigez, puis
              validez ou supprimez.
            </CardDescription>
          </div>
          <Badge variant="soft" className="gap-1.5 text-[11px]">
            <Filter className="h-3 w-3" />
            {totalShown} affichées
          </Badge>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par titre…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Pays" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les pays</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={agencyId} onValueChange={setAgencyId}>
            <SelectTrigger className="w-full sm:w-[170px]">
              <SelectValue placeholder="Agence" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les agences</SelectItem>
              {agencies.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={scoreFilter} onValueChange={setScoreFilter}>
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Qualité" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous scores</SelectItem>
              <SelectItem value="excellent">≥ 80% (Complet)</SelectItem>
              <SelectItem value="good">60 - 79% (Bon)</SelectItem>
              <SelectItem value="fair">40 - 59% (Moyen)</SelectItem>
              <SelectItem value="poor">&lt; 40% (Critique)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Trier par" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="created_desc">Plus récentes</SelectItem>
              <SelectItem value="score_desc">Score décroissant</SelectItem>
              <SelectItem value="score_asc">Score croissant</SelectItem>
              <SelectItem value="price_asc">Prix croissant</SelectItem>
              <SelectItem value="price_desc">Prix décroissant</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {isError ? (
          <div className="m-4 rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
            {errorMessage ?? "Impossible de charger les offres."}
          </div>
        ) : null}

        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[24%]">Offre</TableHead>
              <TableHead className="w-[70px] text-center">Score</TableHead>
              <TableHead>Pays</TableHead>
              <TableHead>Agence</TableHead>
              <TableHead className="text-right">Nuits</TableHead>
              <TableHead>Compagnie</TableHead>
              <TableHead className="text-right">À partir de</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Créée le</TableHead>
              <TableHead className="w-[1%] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`skeleton-${i}`}>
                  {Array.from({ length: 10 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={10} className="p-0">
                  <ListEmptyState hasAny={offers.length > 0} />
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((offer) => (
                <TableRow
                  key={offer.id}
                  className="group cursor-pointer"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("a,button")) return;
                    navigate(`/validation/${offer.id}`);
                  }}
                >
                  <TableCell className="max-w-[300px] py-3">
                    <div className="flex flex-col">
                      <span className="truncate font-medium">
                        {offer.title ?? (
                          <em className="text-muted-foreground">sans titre</em>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ID #{offer.id}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center py-2">
                    <div className="flex justify-center" title={`Complétude: ${offer.quality_score ?? 0}%`}>
                      <CircularScore score={offer.quality_score ?? 0} size="sm" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <CountryChips countries={offer.countries ?? []} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {offer.agency?.name ?? offer.sourceLabel ?? (
                      <span className="italic text-muted-foreground">
                        Agence inconnue
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {offer.duration_nights ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {offer.airline ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Plane className="h-3.5 w-3.5 text-muted-foreground" />
                        {offer.airline}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPrice(offer.lead_price)}
                  </TableCell>
                  <TableCell>
                    <OfferStatusBadge status={offer.status} />
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDate(offer.created_at)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      asChild
                      size="sm"
                      className="opacity-90 transition-opacity group-hover:opacity-100"
                    >
                      <Link to={`/validation/${offer.id}`}>
                        Vérifier
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function CountryChips({ countries }: { countries: string[] }) {
  if (countries.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const visible = countries.slice(0, 3);
  const hidden = countries.slice(3);
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((c) => (
        <Badge key={c} variant="outline" className="font-normal">
          {c}
        </Badge>
      ))}
      {hidden.length > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="soft" className="cursor-default font-normal">
              +{hidden.length}
            </Badge>
          </TooltipTrigger>
          <TooltipContent>{hidden.join(", ")}</TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
}

function ListEmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <PackageOpen className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium">
        {hasAny
          ? "Aucune offre ne correspond aux filtres actuels"
          : "Rien à valider"}
      </p>
      <p className="max-w-md text-xs text-muted-foreground">
        {hasAny
          ? "Essayez d'effacer les filtres ou d'élargir votre recherche."
          : "Dès que le pipeline WhatsApp extraira de nouvelles offres, elles apparaîtront ici en tant que brouillons à vérifier."}
      </p>
    </div>
  );
}
