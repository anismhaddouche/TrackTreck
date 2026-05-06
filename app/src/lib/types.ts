// Domain types mirror the existing Supabase schema. They MUST stay aligned with
// supabase/migrations — never extend the schema from the frontend side.

export type OfferStatus =
  | "draft"
  | "pending_review"
  | "published"
  | "rejected";

export interface Agency {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  town: string | null;
}

export interface HotelPricing {
  dbl: number | null;
  tpl: number | null;
  sgl: number | null;
  inf: number | null;
  chd_2_6: number | null;
  chd_5_11: number | null;
}

export interface HotelOption {
  id?: number;
  hotel_id: number | null;
  custom_hotel_name: string | null;
  is_default: boolean;
  pricing: HotelPricing;
}

export interface TourStep {
  id?: number;
  city: string | null;
  step_order: number;
  duration_nights: number | null;
  hotels: HotelOption[];
}

export interface Departure {
  id?: number;
  departure_city: string;
  stock: number | null;
  flight_departure_time: string | null;
  flight_arrival_time: string | null;
  return_flight_departure_time: string | null;
  return_flight_arrival_time: string | null;
}

export interface OfferServices {
  included: string[];
  excluded: string[];
}

export interface TourSummary {
  id: number;
  title: string | null;
  countries: string[] | null;
  agency_id: number | null;
  agency: Pick<Agency, "id" | "name"> | null;
  duration_nights: number | null;
  airline: string | null;
  lead_price: number | null;
  status: OfferStatus | null;
  needs_review: boolean;
  created_at: string | null;
}

export interface TourDetail {
  id: number;
  title: string | null;
  agency_id: number | null;
  agency: Agency | null;
  countries: string[] | null;
  duration_nights: number | null;
  airline: string | null;
  description: string | null;
  itinerary: Record<string, string> | null;
  status: OfferStatus | null;
  photo_urls: string[] | null;
  is_global_pricing: boolean | null;
  global_pricing: number | null;
  lead_price: number | null;
  services: OfferServices | null;
  needs_review: boolean;
  created_at: string | null;
  steps: TourStep[];
  departures: Departure[];
}

export interface OfferFilters {
  search: string;
  country: string;
  agencyId: string;
  status: string;
}
