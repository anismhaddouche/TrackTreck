import { useQuery } from "@tanstack/react-query";

import { getSupabase } from "@/lib/supabase";

export interface AgencyOption {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
}

export function useAgencies() {
  return useQuery<AgencyOption[]>({
    queryKey: ["agencies", "all"],
    queryFn: async (): Promise<AgencyOption[]> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("agencies")
        .select("id, name, email, phone")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AgencyOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
