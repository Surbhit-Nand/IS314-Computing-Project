import { useEffect } from "react";
import { accountDataChanged } from "./appointments";

/** Keep mounted workspaces in sync with changes made in other tabs or roles. */
export function useAccountRefresh(enabled: boolean, refresh: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const onStorage = (event: StorageEvent) => { if (event.key === accountDataChanged) refresh(); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener(accountDataChanged, refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(accountDataChanged, refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, [enabled, refresh]);
}
