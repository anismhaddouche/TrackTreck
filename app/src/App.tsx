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
        <Route
          index
          element={<Navigate to="/admin/validation" replace />}
        />
        <Route path="/admin/validation" element={<AdminValidationPage />} />
        <Route
          path="/admin/validation/:id"
          element={<OfferValidationDetail />}
        />
        <Route
          path="*"
          element={<Navigate to="/admin/validation" replace />}
        />
      </Route>
    </Routes>
  );
}
