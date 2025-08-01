/**
 * This file is the entry point for the React app, it sets up the root
 * element and renders/hydrates the App component to the DOM.
 *
 * It is included in `src/index.html`.
 */

import { createRoot, hydrateRoot } from "react-dom/client";
import { StrictMode } from "react";
import { AppWrapper } from "./App";

const elem = document.getElementById("root")!;

// Extract chatId from current URL path for client-side hydration
function getChatIdFromCurrentPath() {
  const path = window.location.pathname;
  const match = path.match(/^\/chat\/([^\/]+)$/);
  return match ? match[1] : undefined;
}

// Get dehydrated state and chatId from server-side rendered HTML
function getServerData() {
  const dehydratedStateScript = document.getElementById('__REACT_QUERY_STATE__');
  const chatIdScript = document.getElementById('__CHAT_ID__');
  
  let dehydratedState = undefined;
  let defaultChatId = undefined;

  try {
    if (dehydratedStateScript) {
      dehydratedState = JSON.parse(dehydratedStateScript.textContent || '{}');
    }
    if (chatIdScript) {
      defaultChatId = chatIdScript.textContent || undefined;
    }
  } catch (error) {
    console.warn('Failed to parse server data:', error);
  }

  return { dehydratedState, defaultChatId };
}

// For client-side hydration, extract chatId from URL to maintain consistency with SSR
const clientChatId = getChatIdFromCurrentPath();

// Get server data for proper hydration
const { dehydratedState, defaultChatId } = getServerData();

const app = (
  <StrictMode>
    <AppWrapper 
      serverChatId={clientChatId || defaultChatId} 
      dehydratedState={dehydratedState}
    />
  </StrictMode>
);

// Check if the root element has children (indicating SSR content)
const isSSR = elem.hasChildNodes();

console.log("clientChatId", clientChatId);

console.log("isSSR", isSSR);

if (import.meta.hot) {
  // With hot module reloading, `import.meta.hot.data` is persisted.
  if (isSSR && !import.meta.hot.data.root) {
    // First load with SSR content - hydrate
    import.meta.hot.data.root = hydrateRoot(elem, app);
  } else {
    // Subsequent hot reloads or CSR - render
    const root = (import.meta.hot.data.root ??= createRoot(elem));
    root.render(app);
  }
} else {
  if (isSSR) {
    // Production with SSR content - hydrate
    hydrateRoot(elem, app);
  } else {
    // Production without SSR content (fallback) - render
    createRoot(elem).render(app);
  }
}
