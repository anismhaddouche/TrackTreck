import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { getSupabase } from "@/lib/supabase";

export interface AgencyOption {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface NewAgencyInput {
  name: string;
  email: string;
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

export function useCreateAgency() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NewAgencyInput): Promise<AgencyOption> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("agencies")
        .insert({
          name: input.name,
          email: input.email,
          phone: input.phone,
        })
        .select("id, name, email, phone")
        .single();
      if (error) throw error;
      return data as AgencyOption;
    },
    onSuccess: (created) => {
      qc.setQueryData<AgencyOption[]>(["agencies", "all"], (prev) => {
        const next = (prev ?? []).filter((a) => a.id !== created.id);
        next.push(created);
        next.sort((a, b) => a.name.localeCompare(b.name));
        return next;
      });
      qc.invalidateQueries({ queryKey: ["agencies", "all"] });
    },
  });
}
