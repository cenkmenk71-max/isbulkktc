"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  consentOpenEvent,
  type ConsentDecision,
  type ConsentState,
} from "./consent";
import {
  getConsentSnapshot,
  getServerConsentSnapshot,
  persistConsent,
  resetConsent,
  subscribeToConsent,
} from "./consent-browser";

type ConsentContextValue = {
  /** False until the client has hydrated, so nothing renders from a guess. */
  mounted: boolean;
  consent: ConsentState;
  panelOpen: boolean;
  save: (decision: ConsentDecision) => void;
  reset: () => void;
  openPanel: () => void;
  closePanel: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

// Server snapshot is `false`, client snapshot is `true`, and it never changes
// afterwards — so hydration state comes from `useSyncExternalStore` instead of a
// mount effect that would schedule a second render.
const subscribeToHydration = () => () => {};
const getClientHydrated = () => true;
const getServerHydrated = () => false;

export function ConsentProvider({ children }: { children: ReactNode }) {
  const consent = useSyncExternalStore(
    subscribeToConsent,
    getConsentSnapshot,
    getServerConsentSnapshot,
  );
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    getClientHydrated,
    getServerHydrated,
  );
  const [panelOpen, setPanelOpen] = useState(false);

  // Any component (e.g. the `/cookies` manage button) can ask the banner to
  // open without needing to be a descendant of it.
  useEffect(() => {
    const onOpen = () => setPanelOpen(true);
    window.addEventListener(consentOpenEvent, onOpen);
    return () => window.removeEventListener(consentOpenEvent, onOpen);
  }, []);

  const save = useCallback((decision: ConsentDecision) => {
    persistConsent(decision);
    setPanelOpen(false);
  }, []);

  const reset = useCallback(() => {
    // Withdrawal clears both channels and leaves the panel open in its
    // undecided state, so the visitor is asked again rather than left with a
    // silent "nothing happened".
    resetConsent();
  }, []);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  const value = useMemo<ConsentContextValue>(
    () => ({ mounted, consent, panelOpen, save, reset, openPanel, closePanel }),
    [mounted, consent, panelOpen, save, reset, openPanel, closePanel],
  );

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const value = useContext(ConsentContext);
  if (!value) {
    throw new Error("useConsent must be used inside a ConsentProvider.");
  }
  return value;
}
