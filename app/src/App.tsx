import { Navigate, Route, Routes } from "react-router-dom";

import { AdminLayout } from "@/components/layout/AdminLayout";
import { MissingEnvScreen } from "@/components/MissingEnvScreen";
import { getMissingEnvVars } from "@/lib/env";
import { AdminValidationPage } from "@/features/admin-validation/pages/AdminValidationPage";
import { OfferValidationDetail } from "@/features/admin-validation/pages/OfferValidationDetail";

export default function App() {
  const missing = getMissingEnvVars();
  if (missing.length > 0) {
    return <MissingEnvScreen missing={missing} />;
  }

  return (
    <Routes>
      <Route element={<AdminLayout />}>
        {/* Relative to the basename ("/admin") — never prefix "/admin" here,
            otherwise the redirect would resolve to "/admin/admin/validation". */}
        <Route index element={<Navigate to="validation" replace />} />
        <Route path="/validation" element={<AdminValidationPage />} />
        <Route path="/validation/:id" element={<OfferValidationDetail />} />
        <Route path="*" element={<Navigate to="/validation" replace />} />
      </Route>
    </Routes>
  );
}
