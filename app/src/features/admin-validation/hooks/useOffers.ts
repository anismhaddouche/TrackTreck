import { useQuery } from "@tanstack/react-query";

import { getSupabase } from "@/lib/supabase";
import {
  inferSourceLabelFromPhotoUrls,
  isDefaultAgencyName,
} from "@/lib/source-resolver";
import type { TourSummary } from "@/lib/types";

interface RawTourRow {
  id: number;
  title: string | null;
  countries: string[] | null;
  agency_id: number | null;
  duration_nights: number | null;
  airline: string | null;
  lead_price: number | null;
  photo_urls: string[] | null;
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
           lead_price, photo_urls, status, needs_review, created_at,
           agencies:agency_id ( id, name )`,
        )
        .eq("needs_review", true)
        .eq("status", "draft")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const rows = (data ?? []) as RawTourRow[];

      // Fallback: when the embedded join returns null for some rows (RLS,
      // missing FK rows, etc.), batch-fetch the agency names by id so the
      // table can show real names instead of "Agence inconnue" everywhere.
      const missingAgencyIds = Array.from(
        new Set(
          rows
            .filter(
              (r) => r.agency_id !== null && pickAgency(r.agencies) === null,
            )
            .map((r) => r.agency_id as number),
        ),
      );

      const agencyFallback = new Map<number, string>();
      if (missingAgencyIds.length > 0) {
        const { data: agencyRows, error: agencyErr } = await supabase
          .from("agencies")
          .select("id, name")
          .in("id", missingAgencyIds);
        if (!agencyErr && agencyRows) {
          for (const a of agencyRows as Array<{ id: number; name: string }>) {
            agencyFallback.set(a.id, a.name);
          }
        }
      }

      return rows.map((row) => {
        let agency = pickAgency(row.agencies);
        if (!agency && row.agency_id !== null) {
          const name = agencyFallback.get(row.agency_id);
          if (name) agency = { id: row.agency_id, name };
        }
        const sourceLabel = inferSourceLabelFromPhotoUrls(row.photo_urls);
        if (agency && isDefaultAgencyName(agency.name) && sourceLabel) {
          agency = { ...agency, name: sourceLabel };
        }
        return {
          id: row.id,
          title: row.title,
          countries: row.countries,
          agency_id: row.agency_id,
          agency,
          sourceLabel,
          duration_nights: row.duration_nights,
          airline: row.airline,
          lead_price: row.lead_price,
          photo_urls: row.photo_urls,
          status: row.status,
          needs_review: row.needs_review,
          created_at: row.created_at,
        };
      });
    },
  });
}
