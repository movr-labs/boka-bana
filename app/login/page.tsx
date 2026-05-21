import { Suspense } from "react";
import LoginPage from "@/components/login-page";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <Suspense fallback={<main className="page-shell warm" />}>
      <LoginPage />
    </Suspense>
  );
}
