import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet
} from "react-native";
import { LoadingIndicator } from "./LoadingIndicator";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { api } from "../api/client";
import { getCachedBarcode, setCachedBarcode } from "../utils/barcodeCache";

export type FoodResult = {
  source_food_id: string;
  name: string;
  carbs_g: number | null;
  sugar_g: number | null;
  calories: number | null;
  source_db?: string;
  barcode?: string;
};

export type SubstanceResult = {
  source_food_id: string;
  name: string;
  caffeine_mg?: number | null;
  abv_percent?: number | null;
  source_db: string;
  barcode?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  mode?: "food" | "caffeine" | "alcohol";
  onResult?: (food: FoodResult) => void;
  onSubstanceResult?: (substance: SubstanceResult) => void;
  onManual?: () => void;
};

const HEADER_LABEL: Record<string, string> = {
  food: "Scan food barcode",
  caffeine: "Scan caffeine barcode",
  alcohol: "Scan alcohol barcode",
};

export function BarcodeScannerModal({
  visible,
  onClose,
  mode = "food",
  onResult,
  onSubstanceResult,
  onManual,
}: Props) {
  const { theme } = useTheme();
  const accent = mode === "caffeine" ? theme.coral.sub
               : mode === "alcohol" ? theme.purple.solid
               : theme.coral.solid;
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  function handleClose() {
    setScanned(false);
    setError(null);
    setNotFound(false);
    setTorchOn(false);
    onClose();
  }

  function dispatchResult(barcode: string, result: any) {
    if (mode === "food") {
      const food: FoodResult = {
        source_food_id: result.source_food_id,
        name: result.name,
        carbs_g: result.carbs_g ?? null,
        sugar_g: result.sugar_g ?? null,
        calories: result.calories ?? null,
        source_db: result.source_db,
        barcode,
      };
      handleClose();
      onResult?.(food);
    } else {
      const substance: SubstanceResult = {
        source_food_id: result.source_food_id,
        name: result.name,
        caffeine_mg: result.caffeine_mg ?? null,
        abv_percent: result.abv_percent ?? null,
        source_db: result.source_db,
        barcode,
      };
      handleClose();
      onSubstanceResult?.(substance);
    }
  }

  function handleScan({ data }: { data: string }) {
    setScanned(true);
    setError(null);
    setNotFound(false);
    setLoading(true);

    // Check local cache first — instant result, no network round-trip needed
    const cached = getCachedBarcode(data);
    if (cached) {
      setLoading(false);
      dispatchResult(data, cached);
      return;
    }

    const lookupType = mode === "food" ? undefined : (mode as "caffeine" | "alcohol");

    api
      .lookupBarcode(data, lookupType)
      .then(function (result: any) {
        setLoading(false);

        if (result?.error) {
          const isNotFound = result.error === "product not found";
          if (isNotFound && mode !== "food") {
            setNotFound(true);
          } else {
            setError(isNotFound
              ? "Product not found. Try searching by name instead."
              : result.error);
          }
          return;
        }

        // Cache the successful lookup for future offline/fast access
        setCachedBarcode(data, result);
        dispatchResult(data, result);
      })
      .catch(function (e: Error) {
        setError(e.message || "Barcode lookup failed");
        setLoading(false);
      });
  }

  function handleRetry() {
    setScanned(false);
    setError(null);
    setNotFound(false);
  }

  function handleManualEntry() {
    handleClose();
    onManual?.();
  }


  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.container, { backgroundColor: "#000" }]}>
        <View style={styles.header}>
          <Text style={styles.headerText}>{HEADER_LABEL[mode]}</Text>
          <Pressable onPress={handleClose} hitSlop={12}>
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>

        {!permission ? (
          <View style={styles.center}>
            <LoadingIndicator color="#fff" />
          </View>
        ) : !permission.granted ? (
          <View style={styles.center}>
            <Text style={styles.permText}>Camera access is required to scan barcodes.</Text>
            <Pressable style={[styles.btn, { backgroundColor: accent }]} onPress={requestPermission}>
              <Text style={styles.btnText}>Grant permission</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <CameraView
              style={styles.camera}
              facing="back"
              enableTorch={torchOn}
              barcodeScannerSettings={{
                barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"],
              }}
              onBarcodeScanned={scanned ? undefined : handleScan}
            />

            <View style={styles.overlay} pointerEvents="none">
              <View style={[styles.finder, { borderColor: accent }]} />
            </View>

            <Pressable
              onPress={() => setTorchOn(v => !v)}
              style={[styles.torchBtn, { backgroundColor: torchOn ? "#fff" : "rgba(0,0,0,0.5)" }]}
              accessibilityLabel={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
              hitSlop={12}
            >
              <Ionicons name={torchOn ? "flash" : "flash-outline"} size={22} color={torchOn ? "#111" : "#fff"} />
            </Pressable>

            <View style={styles.statusArea}>
              {loading ? (
                <>
                  <LoadingIndicator color="#fff" />
                  <Text style={styles.statusText}>Looking up product…</Text>
                </>
              ) : notFound ? (
                <>
                  <Text style={[styles.statusText, { color: theme.danger }]}>
                    {mode === "caffeine"
                      ? "No caffeine data found for this product."
                      : "No alcohol data found for this product."}
                  </Text>
                  <Pressable
                    style={[styles.btn, { backgroundColor: accent, marginTop: 12 }]}
                    onPress={handleManualEntry}
                  >
                    <Text style={styles.btnText}>Enter manually</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.btn, { backgroundColor: theme.card, borderWidth: 1, borderColor: theme.cardBorder, marginTop: 8 }]}
                    onPress={handleRetry}
                  >
                    <Text style={styles.btnText}>Scan again</Text>
                  </Pressable>
                </>
              ) : error ? (
                <>
                  <Text style={[styles.statusText, { color: theme.danger }]}>{error}</Text>
                  <Pressable style={[styles.btn, { backgroundColor: accent, marginTop: 12 }]} onPress={handleRetry}>
                    <Text style={styles.btnText}>Scan again</Text>
                  </Pressable>
                </>
              ) : !scanned ? (
                <Text style={styles.statusText}>Point camera at a barcode</Text>
              ) : null}
            </View>
          </>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  overlay: {
    ...StyleSheet.absoluteFill,
    top: 100,
    justifyContent: "center",
    alignItems: "center",
  },
  finder: {
    width: 260,
    height: 160,
    borderWidth: 2,
    borderRadius: 12,
    opacity: 0.6,
  },
  statusArea: {
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: "center",
    minHeight: 120,
  },
  statusText: { color: "#fff", fontSize: 14, textAlign: "center", marginTop: 10 },
  permText: { color: "#fff", fontSize: 14, textAlign: "center", marginBottom: 20 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  btn: { borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  btnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  torchBtn: {
    position: "absolute",
    top: 108,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
