"use client";

import { useState } from "react";
import { isSupabaseConfigured } from "@/lib/backend/supabase/client";
import { createSupabasePublicBackend } from "@/lib/backend/supabase/public";
import { CustomerApp } from "@/components/customer/CustomerApp";
import { SetupRequired } from "@/components/SetupRequired";

export function LiveCustomer() {
  const [backend] = useState(createSupabasePublicBackend);
  if (!isSupabaseConfigured) return <SetupRequired area="customer" />;
  return <CustomerApp backend={backend} />;
}
