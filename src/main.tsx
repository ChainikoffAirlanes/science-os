import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, toast } from "sonner";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./styles.css";
import { AuthProvider } from "./hooks/useAuth";
import { authCallback } from "./lib/supabase";
import App from "./app/App";
document.documentElement.dataset.theme =
  localStorage.getItem("science-theme") ??
  (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15000, retry: 1, refetchOnWindowFocus: true },
  },
});
void authCallback().then((error) => {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
          <Toaster richColors position="bottom-right" closeButton />
        </AuthProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
  if (error) toast.error(error);
});
