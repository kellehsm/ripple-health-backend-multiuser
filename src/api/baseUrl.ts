import Constants from "expo-constants";

export const BASE_URL: string =
  (Constants.expoConfig?.extra as any)?.apiBaseUrl ?? "https://app.kels.gg/api";
