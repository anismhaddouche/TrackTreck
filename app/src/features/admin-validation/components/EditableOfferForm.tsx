import { useEffect, useRef, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  useAgencies,
  useCreateAgency,
  type AgencyOption,
} from "../hooks/useAgencies";
import { useAirlines, type AirlineOption } from "../hooks/useAirlines";
import type {
  Commission,
  Departure,
  HotelOption,
  HotelPricing,
  ItineraryDay,
  TourDetail,
  TourStep,
} from "@/lib/types";
import { addOneHourToIsoLocal } from "@/lib/normalize-departures";

interface EditableOfferFormProps {
  offer: TourDetail;
  onChange: (next: TourDetail) => void;
}

function emptyPricing(): HotelPricing {
  return {
    dbl: null,
    tpl: null,
    sgl: null,
    inf: null,
    chd_2_6: null,
    chd_5_11: null,
  };
}

function emptyHotel(): HotelOption {
  return {
    hotel_id: null,
    custom_hotel_name: null,
    is_default: false,
    pricing: emptyPricing(),
  };
}

function emptyStep(order: number): TourStep {
  return {
    city: null,
    step_order: order,
    duration_nights: null,
    hotels: [],
  };
}

function emptyDeparture(): Departure {
  return {
    departure_city: "Alger",
    stock: null,
    flight_departure_time: null,
    flight_arrival_time: null,
    return_flight_departure_time: null,
    return_flight_arrival_time: null,
  };
}

function parseNumberOrNull(raw: string): number | null {
  if (!raw.trim()) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function EditableOfferForm({ offer, onChange }: EditableOfferFormProps) {
  const agenciesQuery = useAgencies();
  const airlinesQuery = useAirlines();

  function update<K extends keyof TourDetail>(key: K, value: TourDetail[K]) {
    onChange({ ...offer, [key]: value });
  }

  function selectExistingAgency(agency: AgencyOption) {
    onChange({
      ...offer,
      agency_id: agency.id,
      agency: {
        id: agency.id,
        name: agency.name,
        email: agency.email,
        phone: agency.phone,
        town: offer.agency?.town ?? null,
      },
    });
  }

  function setCustomAgencyName(name: string) {
    // No column in `tours` stores a custom agency name. Keep agency_id
    // unchanged so save stays non-destructive; reflect the typed value
    // locally for display only — the next refetch will reset it.
    onChange({
      ...offer,
      agency: offer.agency
        ? { ...offer.agency, name }
        : {
            id: offer.agency_id ?? -1,
            name,
            email: null,
            phone: null,
            town: null,
          },
    });
  }

  function clearAgency() {
    onChange({ ...offer, agency_id: null, agency: null });
  }

  function updateStep(idx: number, next: TourStep) {
    const steps = offer.steps.slice();
    steps[idx] = next;
    onChange({ ...offer, steps });
  }

  function removeStep(idx: number) {
    const steps = offer.steps.filter((_, i) => i !== idx).map((s, i) => ({
      ...s,
      step_order: i + 1,
    }));
    onChange({ ...offer, steps });
  }

  function addStep() {
    const next = [...offer.steps, emptyStep(offer.steps.length + 1)];
    onChange({ ...offer, steps: next });
  }

  function updateDeparture(idx: number, next: Departure) {
    const departures = offer.departures.slice();
    departures[idx] = next;
    onChange({ ...offer, departures });
  }

  function removeDeparture(idx: number) {
    const departures = offer.departures.filter((_, i) => i !== idx);
    onChange({ ...offer, departures });
  }

  function addDeparture() {
    onChange({
      ...offer,
      departures: [...offer.departures, emptyDeparture()],
    });
  }

  return (
    <div className="space-y-5">
      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Informations principales
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldText
              label="Titre"
              value={offer.title ?? ""}
              onChange={(v) => update("title", v || null)}
            />
            <FieldText
              label="Pays (séparés par des virgules)"
              value={(offer.countries ?? []).join(", ")}
              onChange={(v) =>
                update(
                  "countries",
                  v
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
            />
            <FieldNumber
              label="Durée (nuits)"
              value={offer.duration_nights}
              onChange={(v) => update("duration_nights", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Agence & compagnie
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            <AgencyCombobox
              currentId={offer.agency_id}
              currentName={offer.agency?.name ?? null}
              agencies={agenciesQuery.data ?? []}
              isLoading={agenciesQuery.isLoading}
              isError={agenciesQuery.isError}
              onSelectExisting={selectExistingAgency}
              onCustomName={setCustomAgencyName}
              onClear={clearAgency}
            />
            <AirlineField
              currentName={offer.airline}
              airlines={airlinesQuery.data ?? []}
              isLoading={airlinesQuery.isLoading}
              isError={airlinesQuery.isError}
              onSelect={(name) => update("airline", name)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Prix & commission
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldNumber
              label="Prix d'appel"
              value={offer.lead_price}
              onChange={(v) => update("lead_price", v)}
              unit="DA"
            />
            <FieldNumber
              label="Tarif global"
              value={offer.global_pricing}
              onChange={(v) => update("global_pricing", v)}
              unit="DA"
            />
            <div className="flex items-end gap-2 pb-1.5">
              <input
                id="is_global_pricing"
                type="checkbox"
                checked={offer.is_global_pricing === true}
                onChange={(e) =>
                  update("is_global_pricing", e.target.checked)
                }
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="is_global_pricing">Tarif global activé</Label>
            </div>
          </div>

          <CommissionsEditor
            commissions={offer.commissions ?? []}
            onChange={(next) => update("commissions", next)}
          />
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Description, itinéraire & services
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldTextarea
            label="Description"
            value={offer.description ?? ""}
            onChange={(v) => update("description", v || null)}
          />

          <ItinerarySection
            days={offer.itinerary ?? []}
            onChange={(next) => update("itinerary", next)}
          />

          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldTextarea
              label="Services inclus (un par ligne)"
              value={(offer.services?.included ?? []).join("\n")}
              onChange={(raw) =>
                update("services", {
                  included: raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                  excluded: offer.services?.excluded ?? [],
                })
              }
            />
            <FieldTextarea
              label="Services exclus (un par ligne)"
              value={(offer.services?.excluded ?? []).join("\n")}
              onChange={(raw) =>
                update("services", {
                  included: offer.services?.included ?? [],
                  excluded: raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                })
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Étapes & hôtels
          </CardTitle>
          <Button size="sm" variant="outline" onClick={addStep}>
            <Plus className="h-4 w-4" />
            Ajouter une étape
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {offer.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune étape pour le moment.
            </p>
          ) : null}
          {offer.steps.map((step, idx) => (
            <StepEditor
              key={step.id ?? `step-${idx}`}
              step={step}
              onChange={(next) => updateStep(idx, next)}
              onRemove={() => removeStep(idx)}
            />
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Départs
          </CardTitle>
          <Button size="sm" variant="outline" onClick={addDeparture}>
            <Plus className="h-4 w-4" />
            Ajouter un départ
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {offer.departures.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucun départ pour le moment.
            </p>
          ) : null}
          {offer.departures.map((dep, idx) => (
            <DepartureEditor
              key={dep.id ?? `dep-${idx}`}
              departure={dep}
              onChange={(next) => updateDeparture(idx, next)}
              onRemove={() => removeDeparture(idx)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AirlineField({
  currentName,
  airlines,
  isLoading,
  isError,
  onSelect,
}: {
  currentName: string | null;
  airlines: AirlineOption[];
  isLoading: boolean;
  isError: boolean;
  onSelect: (name: string | null) => void;
}) {
  const trimmed = (currentName ?? "").trim();
  const known = trimmed
    ? airlines.some((a) => a.name === trimmed)
    : false;
  const value = trimmed && known ? trimmed : undefined;

  return (
    <div className="space-y-1.5">
      <Label>Compagnie aérienne</Label>
      {isError ? (
        <p className="text-xs text-destructive">
          Impossible de charger les compagnies aériennes.
        </p>
      ) : isLoading ? (
        <p className="text-xs text-muted-foreground">
          Chargement des compagnies...
        </p>
      ) : airlines.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucune compagnie disponible
        </p>
      ) : (
        <Select
          value={value}
          onValueChange={(v) => onSelect(v ? v : null)}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                trimmed && !known
                  ? `Compagnie non reconnue : ${trimmed}`
                  : "Sélectionner une compagnie"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {airlines.map((a) => (
              <SelectItem key={a.id} value={a.name}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function AgencyCombobox({
  currentId,
  currentName,
  agencies,
  isLoading,
  isError,
  onSelectExisting,
  onCustomName,
  onClear,
}: {
  currentId: number | null;
  currentName: string | null;
  agencies: AgencyOption[];
  isLoading: boolean;
  isError: boolean;
  onSelectExisting: (agency: AgencyOption) => void;
  onCustomName: (name: string) => void;
  onClear: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(currentName ?? "");

  // Keep the input in sync when the offer (or external pickers) change it.
  useEffect(() => {
    setQuery(currentName ?? "");
  }, [currentName]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const trimmed = query.trim();
  const filtered = trimmed
    ? agencies.filter((a) =>
        a.name.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : agencies;

  const linkedAgency =
    currentId !== null
      ? agencies.find((a) => a.id === currentId) ?? null
      : null;
  const matchesLinked =
    linkedAgency !== null && trimmed === linkedAgency.name;
  const isCustom = trimmed.length > 0 && !matchesLinked;

  function handleSelect(agency: AgencyOption) {
    onSelectExisting(agency);
    setQuery(agency.name);
    setOpen(false);
  }

  function handleBlurCommit() {
    if (trimmed.length === 0) {
      onClear();
      return;
    }
    if (matchesLinked) return;
    const exact = agencies.find(
      (a) => a.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (exact) {
      onSelectExisting(exact);
      setQuery(exact.name);
      return;
    }
    onCustomName(trimmed);
  }

  return (
    <div className="space-y-1.5" ref={wrapRef}>
      <Label>Agence</Label>
      {isError ? (
        <p className="text-xs text-destructive">
          Impossible de charger les agences.
        </p>
      ) : (
        <div className="relative">
          <Input
            value={query}
            placeholder="Sélectionner ou saisir une agence"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => {
              window.setTimeout(handleBlurCommit, 0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleBlurCommit();
                setOpen(false);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            autoComplete="off"
          />
          {open ? (
            <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover p-1 shadow-md">
              {isLoading ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Chargement des agences...
                </div>
              ) : agencies.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Aucune agence disponible
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  Aucun résultat — la valeur saisie sera conservée localement.
                </div>
              ) : (
                filtered.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelect(a);
                    }}
                    className={
                      "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent " +
                      (a.id === currentId ? "bg-accent/60" : "")
                    }
                  >
                    <span>{a.name}</span>
                    {a.id === currentId ? (
                      <span className="text-xs text-muted-foreground">
                        sélectionnée
                      </span>
                    ) : null}
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      )}
      {isCustom ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Cette agence n'existe pas encore en base.
          </p>
          <CreateAgencyButton
            prefillName={trimmed}
            onCreated={(agency) => {
              onSelectExisting(agency);
              setQuery(agency.name);
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function CreateAgencyButton({
  prefillName,
  onCreated,
}: {
  prefillName: string;
  onCreated: (agency: AgencyOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(prefillName);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const createAgency = useCreateAgency();

  useEffect(() => {
    if (open) {
      setName(prefillName);
      setEmail("");
      setPhone("");
    }
  }, [open, prefillName]);

  async function submit() {
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    if (!trimmedName) return;
    if (!trimmedEmail) {
      toast.error("L'email de l'agence est obligatoire.");
      return;
    }
    try {
      const created = await createAgency.mutateAsync({
        name: trimmedName,
        email: trimmedEmail,
        phone: phone.trim() || null,
      });
      toast.success("Agence créée et sélectionnée.");
      onCreated(created);
      setOpen(false);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Impossible de créer l'agence.";
      toast.error(`Impossible de créer l'agence. ${msg}`);
    }
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Créer cette agence
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une nouvelle agence</DialogTitle>
            <DialogDescription>
              Renseignez les informations de l'agence. Elle sera ajoutée à la
              liste et sélectionnée automatiquement.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="create-agency-name">Nom de l'agence</Label>
              <Input
                id="create-agency-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex : TravelCo"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-agency-email">Email</Label>
              <Input
                id="create-agency-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="contact@agence.dz"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="create-agency-phone">Téléphone</Label>
              <Input
                id="create-agency-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+213 ..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={createAgency.isPending}
            >
              Annuler
            </Button>
            <Button
              onClick={submit}
              disabled={
                createAgency.isPending ||
                !name.trim() ||
                !email.trim()
              }
            >
              {createAgency.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Créer l'agence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FieldText({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
  placeholder,
  unit,
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  placeholder?: string;
  unit?: string;
}) {
  const input = (
    <Input
      type="number"
      inputMode="numeric"
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(e) => onChange(parseNumberOrNull(e.target.value))}
    />
  );
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {unit ? (
        <div className="flex items-center gap-2">
          <div className="flex-1">{input}</div>
          <span className="text-sm text-muted-foreground">{unit}</span>
        </div>
      ) : (
        input
      )}
    </div>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ItinerarySection({
  days,
  onChange,
}: {
  days: ItineraryDay[];
  onChange: (next: ItineraryDay[]) => void;
}) {
  // Days are renumbered sequentially after every mutation so the stored
  // `day` values always match their position (1, 2, 3, …).
  function renumber(list: ItineraryDay[]): ItineraryDay[] {
    return list.map((d, i) => ({ ...d, day: i + 1 }));
  }
  function updateDay(idx: number, patch: Partial<ItineraryDay>) {
    onChange(renumber(days.map((d, i) => (i === idx ? { ...d, ...patch } : d))));
  }
  function removeDay(idx: number) {
    onChange(renumber(days.filter((_, i) => i !== idx)));
  }
  function addDay() {
    onChange(renumber([...days, { day: days.length + 1, title: "", items: [] }]));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Itinéraire (jour par jour)</Label>
        <Button type="button" variant="outline" size="sm" onClick={addDay}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Ajouter un jour
        </Button>
      </div>
      {days.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun jour défini. Cliquez sur « Ajouter un jour » pour commencer.
        </p>
      ) : (
        <div className="space-y-3">
          {days.map((d, idx) => (
            <div
              key={idx}
              className="space-y-2 rounded-md border bg-muted/20 p-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Jour {d.day}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeDay(idx)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <FieldText
                label="Titre"
                value={d.title}
                onChange={(v) => updateDay(idx, { title: v })}
              />
              <FieldTextarea
                label="Activités (une par ligne)"
                value={d.items.join("\n")}
                onChange={(raw) =>
                  updateDay(idx, {
                    items: raw
                      .split(/\r?\n/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepEditor({
  step,
  onChange,
  onRemove,
}: {
  step: TourStep;
  onChange: (next: TourStep) => void;
  onRemove: () => void;
}) {
  function updateHotel(idx: number, next: HotelOption) {
    const hotels = step.hotels.slice();
    hotels[idx] = next;
    onChange({ ...step, hotels });
  }
  function removeHotel(idx: number) {
    onChange({ ...step, hotels: step.hotels.filter((_, i) => i !== idx) });
  }
  function addHotel() {
    onChange({ ...step, hotels: [...step.hotels, emptyHotel()] });
  }

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <FieldNumber
          label="Ordre"
          value={step.step_order}
          onChange={(v) => onChange({ ...step, step_order: v ?? 0 })}
        />
        <FieldText
          label="Ville"
          value={step.city ?? ""}
          onChange={(v) => onChange({ ...step, city: v || null })}
        />
        <FieldNumber
          label="Nuits"
          value={step.duration_nights}
          onChange={(v) => onChange({ ...step, duration_nights: v })}
        />
      </div>

      <Separator className="my-3" />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Hôtels</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addHotel}>
            <Plus className="h-4 w-4" />
            Ajouter un hôtel
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
            Supprimer l'étape
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {step.hotels.length === 0 ? (
          <p className="text-xs text-muted-foreground">Aucun hôtel.</p>
        ) : null}
        {step.hotels.map((hotel, idx) => (
          <HotelEditor
            key={hotel.id ?? `hotel-${idx}`}
            hotel={hotel}
            onChange={(next) => updateHotel(idx, next)}
            onRemove={() => removeHotel(idx)}
          />
        ))}
      </div>
    </div>
  );
}

function HotelEditor({
  hotel,
  onChange,
  onRemove,
}: {
  hotel: HotelOption;
  onChange: (next: HotelOption) => void;
  onRemove: () => void;
}) {
  function setPricing<K extends keyof HotelPricing>(
    key: K,
    value: HotelPricing[K],
  ) {
    onChange({ ...hotel, pricing: { ...hotel.pricing, [key]: value } });
  }

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <FieldText
          label="Nom de l'hôtel"
          value={hotel.custom_hotel_name ?? ""}
          onChange={(v) => onChange({ ...hotel, custom_hotel_name: v || null })}
        />
        <FieldNumber
          label="ID hôtel"
          value={hotel.hotel_id}
          onChange={(v) => onChange({ ...hotel, hotel_id: v })}
        />
        <div className="flex items-end gap-2">
          <input
            type="checkbox"
            checked={hotel.is_default}
            onChange={(e) => onChange({ ...hotel, is_default: e.target.checked })}
            className="h-4 w-4 rounded border-input"
          />
          <Label>Option par défaut</Label>
        </div>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <FieldNumber
          label="DBL"
          value={hotel.pricing.dbl}
          onChange={(v) => setPricing("dbl", v)}
        />
        <FieldNumber
          label="TPL"
          value={hotel.pricing.tpl}
          onChange={(v) => setPricing("tpl", v)}
        />
        <FieldNumber
          label="SGL"
          value={hotel.pricing.sgl}
          onChange={(v) => setPricing("sgl", v)}
        />
        <FieldNumber
          label="INF"
          value={hotel.pricing.inf}
          onChange={(v) => setPricing("inf", v)}
        />
        <FieldNumber
          label="CHD 2-6"
          value={hotel.pricing.chd_2_6}
          onChange={(v) => setPricing("chd_2_6", v)}
        />
        <FieldNumber
          label="CHD 5-11"
          value={hotel.pricing.chd_5_11}
          onChange={(v) => setPricing("chd_5_11", v)}
        />
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
          Supprimer l'hôtel
        </Button>
      </div>
    </div>
  );
}

function CommissionsEditor({
  commissions,
  onChange,
}: {
  commissions: Commission[];
  onChange: (next: Commission[]) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Commissions
      </Label>
      {commissions.length === 0 ? (
        <p className="text-xs italic text-muted-foreground">
          Aucune commission. Cliquez sur « Ajouter une commission » pour en
          créer une.
        </p>
      ) : (
        <div className="space-y-2">
          {commissions.map((c, idx) => (
            <div
              key={idx}
              className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/20 p-2 sm:flex-nowrap"
            >
              <div className="flex-1 min-w-[140px]">
                <Label className="text-[11px] text-muted-foreground">
                  Libellé
                </Label>
                <Input
                  value={c.label}
                  placeholder="Ex : Adultes"
                  onChange={(e) => {
                    const next = [...commissions];
                    next[idx] = { ...next[idx], label: e.target.value };
                    onChange(next);
                  }}
                />
              </div>
              <div className="w-36 min-w-[120px]">
                <Label className="text-[11px] text-muted-foreground">
                  Montant
                </Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={c.amount ?? ""}
                    onChange={(e) => {
                      const next = [...commissions];
                      next[idx] = {
                        ...next[idx],
                        amount: parseNumberOrNull(e.target.value),
                      };
                      onChange(next);
                    }}
                  />
                  <span className="text-sm text-muted-foreground">DA</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => {
                  const next = commissions.filter((_, i) => i !== idx);
                  onChange(next);
                }}
                aria-label="Supprimer cette commission"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() =>
          onChange([...commissions, { label: "", amount: null }])
        }
      >
        <Plus className="h-4 w-4" />
        Ajouter une commission
      </Button>
    </div>
  );
}

function DepartureEditor({
  departure,
  onChange,
  onRemove,
}: {
  departure: Departure;
  onChange: (next: Departure) => void;
  onRemove: () => void;
}) {
  // Normalize once on mount: if the arrival is empty or duplicates the
  // departure (the two known inconsistencies coming out of the pipeline),
  // recompute it to departure + 1h. Manual non-empty distinct values are
  // preserved — the user can still override temporarily.
  const normalizedRef = useRef(false);
  useEffect(() => {
    if (normalizedRef.current) return;
    normalizedRef.current = true;
    const patch: Partial<Departure> = {};
    const fwdDep = departure.flight_departure_time;
    const fwdArr = departure.flight_arrival_time;
    if (fwdDep && (!fwdArr || fwdArr === fwdDep)) {
      const fixed = addOneHourToIsoLocal(fwdDep);
      if (fixed) patch.flight_arrival_time = fixed;
    }
    const retDep = departure.return_flight_departure_time;
    const retArr = departure.return_flight_arrival_time;
    if (retDep && (!retArr || retArr === retDep)) {
      const fixed = addOneHourToIsoLocal(retDep);
      if (fixed) patch.return_flight_arrival_time = fixed;
    }
    if (Object.keys(patch).length > 0) {
      onChange({ ...departure, ...patch });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FieldText
          label="Ville de départ"
          value={departure.departure_city}
          onChange={(v) => onChange({ ...departure, departure_city: v })}
        />
        <FieldNumber
          label="Stock"
          value={departure.stock}
          onChange={(v) => onChange({ ...departure, stock: v })}
        />
        <FieldText
          label="Aller — départ (ISO)"
          value={departure.flight_departure_time ?? ""}
          onChange={(v) => {
            const trimmed = v || null;
            const next: Departure = {
              ...departure,
              flight_departure_time: trimmed,
            };
            // Only auto-fill the arrival when it is still empty — a real
            // flight-plan arrival entered by the user must be preserved.
            if (trimmed && !departure.flight_arrival_time) {
              const arrival = addOneHourToIsoLocal(trimmed);
              if (arrival) next.flight_arrival_time = arrival;
            }
            onChange(next);
          }}
        />
        <FieldText
          label="Aller — arrivée (ISO)"
          value={departure.flight_arrival_time ?? ""}
          onChange={(v) =>
            onChange({ ...departure, flight_arrival_time: v || null })
          }
        />
        <FieldText
          label="Retour — départ (ISO)"
          value={departure.return_flight_departure_time ?? ""}
          onChange={(v) => {
            const trimmed = v || null;
            const next: Departure = {
              ...departure,
              return_flight_departure_time: trimmed,
            };
            // Only auto-fill the arrival when it is still empty — preserve a
            // real flight-plan return arrival.
            if (trimmed && !departure.return_flight_arrival_time) {
              const arrival = addOneHourToIsoLocal(trimmed);
              if (arrival) next.return_flight_arrival_time = arrival;
            }
            onChange(next);
          }}
        />
        <FieldText
          label="Retour — arrivée (ISO)"
          value={departure.return_flight_arrival_time ?? ""}
          onChange={(v) =>
            onChange({ ...departure, return_flight_arrival_time: v || null })
          }
        />
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
          Supprimer le départ
        </Button>
      </div>
    </div>
  );
}
