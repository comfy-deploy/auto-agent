/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import { App } from "./App";
import { NuqsAdapter } from 'nuqs/adapters/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from "@/components/ui/sonner"
import { PostHogProvider } from 'posthog-js/react'

const queryClient = new QueryClient();

const elem = document.getElementById("root")!;
const app = (
  <StrictMode>
    <NuqsAdapter>
      <QueryClientProvider client={queryClient}>
        <PostHogProvider apiKey={process.env.BUN_PUBLIC_POSTHOG_KEY} options={{
          api_host: process.env.BUN_PUBLIC_POSTHOG_HOST,
          defaults: '2025-05-24',
        }}>
          <App />
          <Toaster />
        </PostHogProvider>
      </QueryClientProvider>
    </NuqsAdapter>
  </StrictMode>
);

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  const root = (import.meta.hot.data.root ??= createRoot(elem));
  root.render(app);
} else {
  // The hot module reloading API is not available in production.
  createRoot(elem).render(app);
}
