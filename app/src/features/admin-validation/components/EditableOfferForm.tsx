import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import type {
  Departure,
  HotelOption,
  HotelPricing,
  TourDetail,
  TourStep,
} from "@/lib/types";

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
  function update<K extends keyof TourDetail>(key: K, value: TourDetail[K]) {
    onChange({ ...offer, [key]: value });
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Main fields</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldText
              label="Title"
              value={offer.title ?? ""}
              onChange={(v) => update("title", v || null)}
            />
            <FieldText
              label="Airline"
              value={offer.airline ?? ""}
              onChange={(v) => update("airline", v || null)}
            />
            <FieldText
              label="Countries (comma-separated)"
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
              label="Duration (nights)"
              value={offer.duration_nights}
              onChange={(v) => update("duration_nights", v)}
            />
            <FieldNumber
              label="Lead price"
              value={offer.lead_price}
              onChange={(v) => update("lead_price", v)}
            />
            <FieldNumber
              label="Global pricing"
              value={offer.global_pricing}
              onChange={(v) => update("global_pricing", v)}
            />
            <div className="flex items-end gap-2">
              <input
                id="is_global_pricing"
                type="checkbox"
                checked={offer.is_global_pricing === true}
                onChange={(e) =>
                  update("is_global_pricing", e.target.checked)
                }
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="is_global_pricing">Is global pricing</Label>
            </div>
          </div>

          <FieldTextarea
            label="Description"
            value={offer.description ?? ""}
            onChange={(v) => update("description", v || null)}
          />

          <FieldTextarea
            label="Itinerary (one line per day, format day_N: text)"
            value={Object.entries(offer.itinerary ?? {})
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n")}
            onChange={(raw) => {
              const out: Record<string, string> = {};
              for (const line of raw.split(/\r?\n/)) {
                const m = line.match(/^\s*(day_\d+)\s*:\s*(.*)$/i);
                if (m) out[m[1].toLowerCase()] = m[2].trim();
              }
              update("itinerary", out);
            }}
          />

          <Separator />
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldTextarea
              label="Services included (one per line)"
              value={(offer.services?.included ?? []).join("\n")}
              onChange={(raw) =>
                update("services", {
                  included: raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
                  excluded: offer.services?.excluded ?? [],
                })
              }
            />
            <FieldTextarea
              label="Services excluded (one per line)"
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Steps & hotels</CardTitle>
          <Button size="sm" variant="outline" onClick={addStep}>
            <Plus className="h-4 w-4" />
            Add step
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {offer.steps.length === 0 ? (
            <p className="text-sm text-muted-foreground">No steps yet.</p>
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

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Departures</CardTitle>
          <Button size="sm" variant="outline" onClick={addDeparture}>
            <Plus className="h-4 w-4" />
            Add departure
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {offer.departures.length === 0 ? (
            <p className="text-sm text-muted-foreground">No departures yet.</p>
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
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(parseNumberOrNull(e.target.value))}
      />
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
          label="Order"
          value={step.step_order}
          onChange={(v) => onChange({ ...step, step_order: v ?? 0 })}
        />
        <FieldText
          label="City"
          value={step.city ?? ""}
          onChange={(v) => onChange({ ...step, city: v || null })}
        />
        <FieldNumber
          label="Nights"
          value={step.duration_nights}
          onChange={(v) => onChange({ ...step, duration_nights: v })}
        />
      </div>

      <Separator className="my-3" />

      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Hotels</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={addHotel}>
            <Plus className="h-4 w-4" />
            Add hotel
          </Button>
          <Button size="sm" variant="ghost" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
            Remove step
          </Button>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {step.hotels.length === 0 ? (
          <p className="text-xs text-muted-foreground">No hotels yet.</p>
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
          label="Hotel name"
          value={hotel.custom_hotel_name ?? ""}
          onChange={(v) => onChange({ ...hotel, custom_hotel_name: v || null })}
        />
        <FieldNumber
          label="Hotel ID"
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
          <Label>Default option</Label>
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
          Remove hotel
        </Button>
      </div>
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
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FieldText
          label="Departure city"
          value={departure.departure_city}
          onChange={(v) => onChange({ ...departure, departure_city: v })}
        />
        <FieldNumber
          label="Stock"
          value={departure.stock}
          onChange={(v) => onChange({ ...departure, stock: v })}
        />
        <FieldText
          label="Flight departure (ISO)"
          value={departure.flight_departure_time ?? ""}
          onChange={(v) =>
            onChange({ ...departure, flight_departure_time: v || null })
          }
        />
        <FieldText
          label="Flight arrival (ISO)"
          value={departure.flight_arrival_time ?? ""}
          onChange={(v) =>
            onChange({ ...departure, flight_arrival_time: v || null })
          }
        />
        <FieldText
          label="Return departure (ISO)"
          value={departure.return_flight_departure_time ?? ""}
          onChange={(v) =>
            onChange({ ...departure, return_flight_departure_time: v || null })
          }
        />
        <FieldText
          label="Return arrival (ISO)"
          value={departure.return_flight_arrival_time ?? ""}
          onChange={(v) =>
            onChange({ ...departure, return_flight_arrival_time: v || null })
          }
        />
      </div>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-destructive" />
          Remove departure
        </Button>
      </div>
    </div>
  );
}
