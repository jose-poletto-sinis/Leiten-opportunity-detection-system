"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function HistorialRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace("/intel?tab=historial"); }, [router]);
  return null;
}
