import { slugify } from "./utils";
import type { TourDetail } from "./types";

export function buildOfferJson(offer: TourDetail): Record<string, unknown> {
  return {
    id: offer.id,
    title: offer.title,
    agency_id: offer.agency_id,
    agency_name: offer.agency?.name ?? null,
    countries: offer.countries ?? [],
    duration_nights: offer.duration_nights,
    airline: offer.airline,
    description: offer.description,
    itinerary: offer.itinerary ?? {},
    status: offer.status,
    photo_urls: offer.photo_urls ?? [],
    is_global_pricing: offer.is_global_pricing ?? false,
    global_pricing: offer.global_pricing,
    lead_price: offer.lead_price,
    services: offer.services ?? { included: [], excluded: [] },
    needs_review: offer.needs_review,
    steps: offer.steps,
    departures: offer.departures,
  };
}

export function downloadOfferJson(offer: TourDetail): void {
  const payload = buildOfferJson(offer);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const titleSlug = offer.title ? slugify(offer.title) : "";
  const filename = titleSlug
    ? `offer-${titleSlug}-${offer.id}.json`
    : `offer-${offer.id}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
