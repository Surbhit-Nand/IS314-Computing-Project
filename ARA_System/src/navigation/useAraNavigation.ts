import { useEffect, useState, useSyncExternalStore } from "react";
import { createAraHistory, resolveNavigation, type NavigationSession } from "./araNavigation";

export function useAraNavigation(ready: boolean, session: NavigationSession) {
  const [history] = useState(() => createAraHistory(window));
  const snapshot = useSyncExternalStore(history.subscribe, history.getSnapshot);
  const { userId, role, devBypass } = session;
  useEffect(() => {
    if (!ready) return;
    return history.connect({ userId, role, devBypass });
  }, [history, ready, userId, role, devBypass]);
  // Enforce current access during render too, before the session effect runs.
  return {
    navigation: resolveNavigation(snapshot, session),
    navigateTo: history.navigate,
    historyReady: snapshot !== null && snapshot.ownerUserId === userId,
  };
}
