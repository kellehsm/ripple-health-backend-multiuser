import { useState, useEffect, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "health_tile_config_v1";

export type TileKey = "mindfulness" | "glucose" | "steps" | "sleep" | "water" | "heart" | "sleep_card" | "glucose_chart" | "heart_chart";

export type TileConfig = Record<TileKey, boolean>;

const DEFAULTS: TileConfig = {
  mindfulness: true,
  glucose: true,
  steps: true,
  sleep: true,
  water: true,
  heart: true,
  sleep_card: true,
  glucose_chart: true,
  heart_chart: true,
};

export function useHealthTileConfig() {
  const [config, setConfig] = useState<TileConfig>(DEFAULTS);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          setConfig({ ...DEFAULTS, ...parsed });
        } catch {}
      }
    });
  }, []);

  const setTile = useCallback((key: TileKey, value: boolean) => {
    setConfig((prev) => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  return { config, setTile };
}
