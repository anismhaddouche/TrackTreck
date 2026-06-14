import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { TooltipProvider } from "@/components/ui/tooltip";
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});

// Routing basename, e.g. "/admin" (BASE_URL is "/admin/").
const ROUTER_BASENAME = import.meta.env.BASE_URL.replace(/\/$/, "");

// Safety net: collapse a duplicated basename in the URL (e.g.
// "/admin/admin/validation" → "/admin/validation") BEFORE the router mounts, so
// React Router always boots on a clean path. Runs once, synchronously, and only
// rewrites history when an actual duplication is present.
if (ROUTER_BASENAME) {
  const escaped = ROUTER_BASENAME.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const duplicated = new RegExp(`^(${escaped})(?:${escaped})+(?=/|$)`);
  const { pathname, search, hash } = window.location;
  const deduped = pathname.replace(duplicated, "$1");
  if (deduped !== pathname) {
    window.history.replaceState(null, "", `${deduped}${search}${hash}`);
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <BrowserRouter basename={ROUTER_BASENAME}>
          <App />
          <Toaster richColors position="top-right" />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
