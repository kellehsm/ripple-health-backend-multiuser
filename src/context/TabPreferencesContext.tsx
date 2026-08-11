import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { TabPreferences, DEFAULT_TAB_PREFERENCES } from '../types/tabPreferences';
import { api, ApiError } from '../api/client';

interface TabPreferencesContextValue {
  preferences: TabPreferences;
  loading: boolean;
  error: string | null;
  save: (next: TabPreferences) => Promise<void>;
  reload: () => void;
}

const TabPreferencesContext = createContext<TabPreferencesContextValue>({
  preferences: DEFAULT_TAB_PREFERENCES,
  loading: true,
  error: null,
  save: async () => {},
  reload: () => {},
});

export function TabPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [preferences, setPreferences] = useState<TabPreferences>(DEFAULT_TAB_PREFERENCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api.getTabPreferences()
      .then((data) => { if (!cancelled) setPreferences(data as TabPreferences); })
      .catch((err: any) => {
        if (cancelled) return;
        const is404 = err instanceof ApiError && err.status === 404;
        if (!is404) setError(err?.message || 'Unknown error');
        setPreferences(DEFAULT_TAB_PREFERENCES);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [revision]);

  const save = useCallback(async (next: TabPreferences) => {
    setPreferences(next);
    try {
      await api.putTabPreferences(next);
    } catch (err: any) {
      setError(err?.message ?? 'Unknown error');
    }
  }, []);

  const reload = useCallback(() => setRevision((r) => r + 1), []);

  const value = useMemo(
    () => ({ preferences, loading, error, save, reload }),
    [preferences, loading, error, save, reload]
  );

  return (
    <TabPreferencesContext.Provider value={value}>
      {children}
    </TabPreferencesContext.Provider>
  );
}

export function useTabPreferencesContext() {
  return useContext(TabPreferencesContext);
}
