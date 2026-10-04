"use client";

import { useState } from "react";
import { isSupabaseConfigured } from "@/lib/backend/supabase/client";
import { createSupabaseStaffBackend } from "@/lib/backend/supabase/staff";
import { StaffApp } from "@/components/admin/StaffApp";
import { SetupRequired } from "@/components/SetupRequired";

export function LiveStaff() {
  const [backend] = useState(createSupabaseStaffBackend);
  if (!isSupabaseConfigured) return <SetupRequired area="staff" />;
  return <StaffApp backend={backend} />;
}
