"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RefreshListener() {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener("workspace-updated", refresh);
    return () => window.removeEventListener("workspace-updated", refresh);
  }, [router]);
  return null;
}
