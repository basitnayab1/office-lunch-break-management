import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/admin";

/**
 * Cached office display name for public login shells.
 * Avoids a blocking service-role round-trip on every anonymous page view.
 */
export const getCachedOfficeName = unstable_cache(
  async (): Promise<string> => {
    try {
      if (
        !process.env.NEXT_PUBLIC_SUPABASE_URL ||
        !process.env.SUPABASE_SERVICE_ROLE_KEY
      ) {
        return "Bite Station";
      }
      const supabase = createServiceClient();
      const { data } = await supabase
        .from("office_settings")
        .select("office_name")
        .eq("id", 1)
        .maybeSingle();
      return data?.office_name?.trim() || "Bite Station";
    } catch {
      return "Bite Station";
    }
  },
  ["public-office-name"],
  { revalidate: 120, tags: ["office-settings"] }
);
