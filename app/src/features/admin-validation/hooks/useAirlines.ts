import { useQuery } from "@tanstack/react-query";

import { getSupabase } from "@/lib/supabase";

export interface AirlineOption {
  id: number;
  name: string;
}

export function useAirlines() {
  return useQuery<AirlineOption[]>({
    queryKey: ["airlines", "all"],
    queryFn: async (): Promise<AirlineOption[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("airlines")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AirlineOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
