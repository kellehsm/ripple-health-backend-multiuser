import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Let the user pick an image and copy it into the app's document directory so
 * the URI survives cache clears. Returns the stored URI, or null if cancelled.
 */
export async function pickAndStoreImage(prefix: string): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ["image/jpeg", "image/png", "image/webp", "image/*"],
    copyToCacheDirectory: true,
  });
  if (result.canceled || !result.assets[0]) return null;

  const dir = FileSystem.documentDirectory + "element_bgs/";
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const ext = result.assets[0].name?.split(".").pop() ?? "jpg";
  const destUri = `${dir}${prefix}_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: result.assets[0].uri, to: destUri });
  return destUri;
}

/** Delete a previously stored element background file (best-effort). */
export async function deleteStoredImage(uri: string): Promise<void> {
  if (!uri.includes("element_bgs/")) return;
  await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
