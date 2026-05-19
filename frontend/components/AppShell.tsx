"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SideBar } from "./SideBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const isLogin = pathname === "/login";

  useEffect(() => {
    if (isLogin) {
      setReady(true);
      return;
    }
    const token = localStorage.getItem("leiten_intel_token");
    if (!token) {
      router.replace("/login");
    } else {
      setReady(true);
    }
  }, [pathname, isLogin, router]);

  if (!ready) return null;

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <div className="app-layout">
      <SideBar />
      <div className="main-content">{children}</div>
    </div>
  );
}
