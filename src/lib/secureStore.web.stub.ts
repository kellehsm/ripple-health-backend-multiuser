// Web shim for expo-secure-store (aliased in metro.config.js): browsers have
// no secure enclave, so fall back to localStorage for the dev web preview.
export async function getItemAsync(key: string): Promise<string | null> {
  return window.localStorage.getItem(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  window.localStorage.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  window.localStorage.removeItem(key);
}

export function getItem(key: string): string | null {
  return window.localStorage.getItem(key);
}

export function setItem(key: string, value: string): void {
  window.localStorage.setItem(key, value);
}

export async function isAvailableAsync(): Promise<boolean> {
  return true;
}
