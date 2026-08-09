/**
 * PhotoScannerModal — Passio Nutrition-AI plate/food photo recognition.
 *
 * Uses @passiolife/nutritionai-react-native-sdk-v3 (v3.3.0) installed from
 * GitHub Packages. Requires an EAS build (native rebuild) — not JS-only.
 * SDK will not work on a simulator; a real device is required.
 *
 * Flow:
 *   1. Configure PassioSDK (key fetched from backend, cached in module scope)
 *   2. Show live CameraView — user frames their plate
 *   3. User taps "Capture" → photo taken → sent to recognizeImageRemote()
 *   4. Recognized items listed — user taps one → onResult() → MacroEditForm
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";

// ── Passio SDK import ─────────────────────────────────────────────────────────
// Loaded at runtime so a missing native module doesn't crash JS-only builds.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PassioLib = (() => {
  try {
    return require("@passiolife/nutritionai-react-native-sdk-v3");
  } catch {
    return null;
  }
})();

const PassioSDK: typeof import("@passiolife/nutritionai-react-native-sdk-v3").PassioSDK | null =
  PassioLib?.PassioSDK ?? null;

// ── Types from @passiolife/nutritionai-react-native-sdk-v3 ───────────────────

type PassioAdvisorFoodInfo =
  import("@passiolife/nutritionai-react-native-sdk-v3").PassioAdvisorFoodInfo;
type PassioFoodItem =
  import("@passiolife/nutritionai-react-native-sdk-v3").PassioFoodItem;
type PassioNutrients =
  import("@passiolife/nutritionai-react-native-sdk-v3").PassioNutrients;
type UnitMass =
  import("@passiolife/nutritionai-react-native-sdk-v3").UnitMass;

// ── Our app's food result shape (matches MealsScreen's local FoodResult) ──────

export type PhotoFoodResult = {
  source_food_id: string;
  name: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  caffeine_mg: number | null;
  sodium_mg: number | null;
  source_db: string;
};

// ── Resolved candidate ready to display ───────────────────────────────────────

type ResolvedItem = {
  id: string;
  food: PhotoFoodResult;
  portionSize: string;
};

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  onResult: (food: PhotoFoodResult) => void;
};

// ── Module-level SDK key cache (avoid re-fetching across modal open/close) ────

let cachedPassioKey: string | null = null;

// ── Nutrition helpers ─────────────────────────────────────────────────────────

function unitVal(u?: UnitMass | null): number | null {
  return u != null ? Math.round(u.value * 10) / 10 : null;
}

function nutrientsToFood(
  name: string,
  id: string,
  portionSize: string,
  nutrients: PassioNutrients
): PhotoFoodResult {
  return {
    source_food_id: id,
    name,
    calories: nutrients.calories ? Math.round(nutrients.calories.value) : null,
    carbs_g: unitVal(nutrients.carbs),
    sugar_g: unitVal(nutrients.sugars),
    sodium_mg: nutrients.sodium
      ? Math.round(nutrients.sodium.value)
      : null,
    caffeine_mg: null,
    source_db: "passio",
  };
}

function advisorInfoToFood(info: PassioAdvisorFoodInfo, index: number): PhotoFoodResult {
  // Quick path: use nutritionPreview from foodDataInfo if full fetch fails/skipped
  const preview = info.foodDataInfo?.nutritionPreview;
  return {
    source_food_id: info.foodDataInfo?.resultId ?? info.foodDataInfo?.refCode ?? String(index),
    name: info.recognisedName,
    calories: preview?.calories ?? null,
    carbs_g: preview?.carbs ?? null,
    sugar_g: null,
    sodium_mg: null,
    caffeine_mg: null,
    source_db: "passio",
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

type SdkStatus = "idle" | "loading" | "ready" | "error";
type ScanStatus = "camera" | "capturing" | "recognizing" | "results" | "error";

export function PhotoScannerModal({ visible, onClose, onResult }: Props) {
  const { theme } = useTheme();
  const accent = theme.coral.solid;
  const [permission, requestPermission] = useCameraPermissions();

  const [sdkStatus, setSdkStatus] = useState<SdkStatus>("idle");
  const [sdkError, setSdkError] = useState<string | null>(null);

  const [scanStatus, setScanStatus] = useState<ScanStatus>("camera");
  const [scanError, setScanError] = useState<string | null>(null);
  const [items, setItems] = useState<ResolvedItem[]>([]);

  const cameraRef = useRef<any>(null);

  // ── SDK init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible) return;
    if (sdkStatus === "ready" || sdkStatus === "loading") return;

    if (!PassioSDK) {
      setSdkStatus("error");
      setSdkError(
        "Passio SDK native module not found.\n" +
          "An EAS build (native rebuild) is required before this feature works."
      );
      return;
    }

    setSdkStatus("loading");

    const initSDK = async (key: string) => {
      try {
        const status = await PassioSDK.configure({
          key,
          debugMode: false,
          autoUpdate: true,
          remoteOnly: true, // skip on-device model download; use remote API only
        });
        if (
          status.mode === "isReadyForDetection" ||
          status.mode === "isDownloadingModels"
        ) {
          setSdkStatus("ready");
        } else if (status.mode === "error") {
          setSdkStatus("error");
          setSdkError(status.errorMessage);
        } else {
          // notReady or isBeingConfigured — shouldn't happen with remoteOnly, but handle gracefully
          setSdkStatus("error");
          setSdkError("Passio SDK not ready (mode: " + status.mode + ")");
        }
      } catch (e: any) {
        setSdkStatus("error");
        setSdkError(e?.message ?? "Passio SDK configure error");
      }
    };

    if (cachedPassioKey) {
      initSDK(cachedPassioKey);
      return;
    }

    api
      .getPassioKey()
      .then(({ key, error }) => {
        if (error || !key) {
          setSdkStatus("error");
          setSdkError(error ?? "Failed to load API key from server");
          return;
        }
        cachedPassioKey = key;
        initSDK(key);
      })
      .catch((e: any) => {
        setSdkStatus("error");
        setSdkError(e?.message ?? "Network error fetching Passio key");
      });
  }, [visible, sdkStatus]);

  // ── Reset on close ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible) {
      setScanStatus("camera");
      setScanError(null);
      setItems([]);
    }
  }, [visible]);

  // ── Capture and recognize ────────────────────────────────────────────────────

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || !PassioSDK) return;
    setScanStatus("capturing");

    let uri: string;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });
      uri = photo.uri;
    } catch (e: any) {
      setScanStatus("error");
      setScanError("Could not take photo: " + (e?.message ?? "unknown error"));
      return;
    }

    setScanStatus("recognizing");

    // Passio's Android bridge calls `File(path)` directly and expects a plain
    // filesystem path — expo-camera returns `file:///…`, so `File("file:///…")`
    // fails `file.exists()` and the SDK throws "no image found". Strip the
    // scheme (and equivalent iOS `file://localhost/` prefix) before handing off.
    const passioPath = uri
      .replace(/^file:\/\/localhost/, "")
      .replace(/^file:\/\//, "");

    try {
      const results: PassioAdvisorFoodInfo[] | null =
        await PassioSDK.recognizeImageRemote(passioPath, undefined, "RES_512");

      if (!results || results.length === 0) {
        setScanStatus("error");
        setScanError(
          "No food detected in this photo. Try a closer shot of your plate."
        );
        return;
      }

      // Resolve each recognized item to full nutrients where possible
      const resolved = await Promise.all(
        results.map(async (info, index): Promise<ResolvedItem> => {
          const fallback = advisorInfoToFood(info, index);

          // Try to fetch the full food item for sugar + sodium
          if (info.foodDataInfo && PassioSDK.fetchFoodItemForDataInfo) {
            try {
              const foodItem: PassioFoodItem | null =
                await PassioSDK.fetchFoodItemForDataInfo(info.foodDataInfo);
              if (foodItem) {
                const nutrients: PassioNutrients =
                  PassioSDK.getNutrientsSelectedSizeOfPassioFoodItem(foodItem);
                return {
                  id: info.foodDataInfo.resultId ?? String(index),
                  food: nutrientsToFood(
                    info.recognisedName,
                    info.foodDataInfo.resultId ?? String(index),
                    info.portionSize,
                    nutrients
                  ),
                  portionSize: info.portionSize,
                };
              }
            } catch {
              // fall through to preview data
            }
          }

          // packagedFoodItem path (barcode-based results)
          if (info.packagedFoodItem && PassioSDK.getNutrientsSelectedSizeOfPassioFoodItem) {
            try {
              const nutrients: PassioNutrients =
                PassioSDK.getNutrientsSelectedSizeOfPassioFoodItem(info.packagedFoodItem);
              return {
                id: info.packagedFoodItem.id ?? String(index),
                food: nutrientsToFood(
                  info.recognisedName,
                  info.packagedFoodItem.id ?? String(index),
                  info.portionSize,
                  nutrients
                ),
                portionSize: info.portionSize,
              };
            } catch {
              // fall through
            }
          }

          return {
            id: String(index),
            food: fallback,
            portionSize: info.portionSize,
          };
        })
      );

      setItems(resolved);
      setScanStatus("results");
    } catch (e: any) {
      setScanStatus("error");
      setScanError(
        e?.message?.includes("network") || e?.message?.includes("fetch")
          ? "Network error — check your connection and try again."
          : "Recognition failed: " + (e?.message ?? "unknown error")
      );
    }
  }, []);

  // ── Result selection ────────────────────────────────────────────────────────

  function handleSelect(item: ResolvedItem) {
    handleClose();
    onResult(item.food);
  }

  function handleClose() {
    setScanStatus("camera");
    setScanError(null);
    setItems([]);
    onClose();
  }

  function handleRetry() {
    setScanStatus("camera");
    setScanError(null);
    setItems([]);
  }

  // ── Nutrition preview line ───────────────────────────────────────────────────

  function nutritionLine(food: PhotoFoodResult): string {
    const parts: string[] = [];
    if (food.calories != null) parts.push(food.calories + " cal");
    if (food.carbs_g != null) parts.push(food.carbs_g + "g carbs");
    if (food.sugar_g != null) parts.push(food.sugar_g + "g sugar");
    return parts.join(" · ");
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerText}>Scan your plate</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        {/* ── SDK not installed ── */}
        {sdkStatus === "error" ? (
          <View style={styles.center}>
            <Ionicons name="warning-outline" size={44} color="#E8654E" />
            <Text style={[styles.statusText, { color: "#E8654E", marginTop: 14 }]}>
              {sdkError}
            </Text>
            <Pressable
              style={[styles.btn, { backgroundColor: accent, marginTop: 24 }]}
              onPress={() => setSdkStatus("idle")}
            >
              <Text style={styles.btnText}>Retry</Text>
            </Pressable>
          </View>
        ) : sdkStatus !== "ready" ? (
          /* ── SDK loading ── */
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.statusText}>Starting food recognition…</Text>
          </View>
        ) : !permission ? (
          /* ── Camera permission loading ── */
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : !permission.granted ? (
          /* ── Camera permission denied ── */
          <View style={styles.center}>
            <Text style={styles.statusText}>
              Camera access is required to scan your plate.
            </Text>
            <Pressable
              style={[styles.btn, { backgroundColor: accent, marginTop: 20 }]}
              onPress={requestPermission}
            >
              <Text style={styles.btnText}>Grant camera access</Text>
            </Pressable>
          </View>
        ) : scanStatus === "results" ? (
          /* ── Results panel ── */
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>
              {items.length === 1
                ? "Detected 1 food item"
                : `Detected ${items.length} food items`}
            </Text>
            <Text style={styles.resultsSubtitle}>
              Tap an item to review and log it
            </Text>
            <ScrollView
              style={styles.resultsList}
              showsVerticalScrollIndicator={false}
            >
              {items.map((item) => {
                const preview = nutritionLine(item.food);
                return (
                  <Pressable
                    key={item.id}
                    style={styles.resultRow}
                    onPress={() => handleSelect(item)}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.resultName} numberOfLines={2}>
                        {item.food.name}
                      </Text>
                      {item.portionSize ? (
                        <Text style={styles.resultPortion}>
                          {item.portionSize}
                        </Text>
                      ) : null}
                      {preview ? (
                        <Text style={styles.resultMeta}>{preview}</Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name="create-outline"
                      size={22}
                      color={accent}
                      style={{ marginLeft: 12 }}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.aiNote}>
              AI recognition — verify nutrition before logging
            </Text>
            <Pressable
              style={[styles.btn, { backgroundColor: "rgba(255,255,255,0.15)", marginTop: 12 }]}
              onPress={handleRetry}
            >
              <Text style={[styles.btnText, { color: "#fff" }]}>
                Scan another photo
              </Text>
            </Pressable>
          </View>
        ) : (
          /* ── Camera view ── */
          <>
            <CameraView ref={cameraRef} style={styles.camera} facing="back" />

            {/* Status overlay */}
            <View style={styles.statusOverlay} pointerEvents="none">
              {scanStatus === "camera" && (
                <View style={styles.hintBox}>
                  <Ionicons name="restaurant-outline" size={26} color="#fff" />
                  <Text style={styles.hintText}>
                    Frame your plate then tap Capture
                  </Text>
                </View>
              )}
              {(scanStatus === "capturing" || scanStatus === "recognizing") && (
                <View style={styles.hintBox}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.hintText}>
                    {scanStatus === "capturing"
                      ? "Taking photo…"
                      : "Identifying food…"}
                  </Text>
                </View>
              )}
              {scanStatus === "error" && (
                <View style={[styles.hintBox, { backgroundColor: "rgba(180,40,20,0.7)" }]}>
                  <Ionicons name="alert-circle-outline" size={22} color="#fff" />
                  <Text style={styles.hintText}>{scanError}</Text>
                </View>
              )}
            </View>

            {/* Capture button */}
            <View style={styles.captureArea} pointerEvents="box-none">
              {scanStatus === "error" ? (
                <Pressable
                  style={[styles.captureBtn, { backgroundColor: accent }]}
                  onPress={handleRetry}
                >
                  <Text style={styles.captureBtnText}>Try again</Text>
                </Pressable>
              ) : (
                <Pressable
                  style={[
                    styles.captureBtn,
                    scanStatus !== "camera" && styles.captureBtnDisabled,
                  ]}
                  onPress={handleCapture}
                  disabled={scanStatus !== "camera"}
                >
                  <Ionicons name="camera" size={26} color="#fff" />
                  <Text style={styles.captureBtnText}>Capture</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
  },
  headerText: { color: "#fff", fontSize: 17, fontWeight: "600" },
  camera: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  statusText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },
  statusOverlay: {
    ...StyleSheet.absoluteFill,
    top: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  hintBox: {
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    maxWidth: 280,
  },
  hintText: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    fontWeight: "500",
  },
  captureArea: {
    paddingVertical: 28,
    alignItems: "center",
  },
  captureBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E8654E",
    borderRadius: 30,
    paddingHorizontal: 32,
    paddingVertical: 14,
  },
  captureBtnDisabled: {
    opacity: 0.45,
  },
  captureBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  resultsContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 32,
  },
  resultsTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
  },
  resultsSubtitle: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    marginBottom: 20,
  },
  resultsList: { flex: 1 },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.09)",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  resultName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  resultPortion: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 11,
    marginTop: 2,
  },
  resultMeta: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 12,
    marginTop: 3,
  },
  aiNote: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    textAlign: "center",
    marginTop: 12,
  },
  btn: {
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
