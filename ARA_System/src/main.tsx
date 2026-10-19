import { ClerkProvider } from "@clerk/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { BackToTop } from "./components/BackToTop";
import "./visual-system.css";
import "./workspace.css";
import "./workspace-minimal.css";
import "./rescue-workspace.css";
import "./features/veterinary/veterinary-minimal.css";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      <App />
      <BackToTop />
    </ClerkProvider>
  </StrictMode>,
);
