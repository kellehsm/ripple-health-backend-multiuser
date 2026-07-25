import React, { createContext, useContext, useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const MEDS_KEY = "ripple:feature_meds";
const CYCLE_KEY = "ripple:feature_cycle";

type FeaturesContextValue = {
  medsEnabled: boolean;
  cycleEnabled: boolean;
  setMeds: (v: boolean) => Promise<void>;
  setCycle: (v: boolean) => Promise<void>;
  featuresLoaded: boolean;
};

const FeaturesContext = createContext<FeaturesContextValue>({
  medsEnabled: false,
  cycleEnabled: false,
  setMeds: async () => {},
  setCycle: async () => {},
  featuresLoaded: false,
});

export function FeaturesProvider({ children }: { children: React.ReactNode }) {
  const [medsEnabled, setMedsState] = useState(false);
  const [cycleEnabled, setCycleState] = useState(false);
  const [featuresLoaded, setFeaturesLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.multiGet([MEDS_KEY, CYCLE_KEY]).then(([[, meds], [, cycle]]) => {
      setMedsState(meds === "true");
      setCycleState(cycle === "true");
      setFeaturesLoaded(true);
    });
  }, []);

  async function setMeds(v: boolean) {
    setMedsState(v);
    await AsyncStorage.setItem(MEDS_KEY, v ? "true" : "false");
  }

  async function setCycle(v: boolean) {
    setCycleState(v);
    await AsyncStorage.setItem(CYCLE_KEY, v ? "true" : "false");
  }

  return (
    <FeaturesContext.Provider value={{ medsEnabled, cycleEnabled, setMeds, setCycle, featuresLoaded }}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures() {
  return useContext(FeaturesContext);
}
