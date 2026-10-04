"use client";

import { useState } from "react";
import { createDemoPublicBackend } from "@/lib/backend/demo/backend";
import { CustomerApp } from "@/components/customer/CustomerApp";
import { DemoControls } from "@/components/DemoControls";

export function DemoCustomer() {
  const [backend] = useState(createDemoPublicBackend);
  return <CustomerApp backend={backend} demoControls={<DemoControls other={{ href: "/demo/admin", label: "직원 화면" }} />} />;
}
