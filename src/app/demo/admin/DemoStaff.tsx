"use client";

import { useState } from "react";
import { createDemoStaffBackend } from "@/lib/backend/demo/backend";
import { StaffApp } from "@/components/admin/StaffApp";
import { DemoControls } from "@/components/DemoControls";

export function DemoStaff() {
  const [backend] = useState(createDemoStaffBackend);
  return (
    <>
      <div className="flex justify-center border-b-2 border-ink bg-yellow px-3 py-2">
        <DemoControls other={{ href: "/demo", label: "손님 화면" }} />
      </div>
      <StaffApp backend={backend} />
    </>
  );
}
