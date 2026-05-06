import { useQuery } from "@tanstack/react-query";

import { getSupabase } from "@/lib/supabase";
import type { TourSummary } from "@/lib/types";

interface RawTourRow {
  id: number;
  title: string | null;
  countries: string[] | null;
  agency_id: number | null;
  duration_nights: number | null;
  airline: string | null;
  lead_price: number | null;
  status: TourSummary["status"];
  needs_review: boolean;
  created_at: string | null;
  agencies: { id: number; name: string } | { id: number; name: string }[] | null;
}

function pickAgency(
  raw: RawTourRow["agencies"],
): { id: number; name: string } | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export function useOffersToValidate() {
  return useQuery({
    queryKey: ["offers", "to-validate"],
    queryFn: async (): Promise<TourSummary[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("tours")
        .select(
          `id, title, countries, agency_id, duration_nights, airline,
           lead_price, status, needs_review, created_at,
           agencies:agency_id ( id, name )`,
        )
        .eq("needs_review", true)
        .eq("status", "draft")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data as RawTourRow[]).map((row) => ({
        id: row.id,
        title: row.title,
        countries: row.countries,
        agency_id: row.agency_id,
        agency: pickAgency(row.agencies),
        duration_nights: row.duration_nights,
        airline: row.airline,
        lead_price: row.lead_price,
        status: row.status,
        needs_review: row.needs_review,
        created_at: row.created_at,
      }));
    },
  });
}
