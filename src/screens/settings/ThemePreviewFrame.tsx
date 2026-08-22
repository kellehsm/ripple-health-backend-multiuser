import React, { useState, Component } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  TouchableWithoutFeedback,
  Alert,
  Image,
  Switch,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { NavigationContainer } from "@react-navigation/native";
import { NavigationIndependentTree } from "@react-navigation/core";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "../../theme/ThemeContext";
import { useAppSettings, CARD_OPACITY_MIN, CARD_OPACITY_MAX } from "../../theme/AppSettingsContext";
import { ThemeEditContext } from "../../theme/ThemeEditContext";
import { FONT_SIZES, SPACING, RADIUS } from "../../theme/tokens";
import { pickAndStoreImage, deleteStoredImage } from "../../lib/pickBackgroundImage";

import { OverviewScreen } from "../OverviewScreen";
import { HealthScreen } from "../HealthScreen";
import { MealsScreen } from "../MealsScreen";
import { LifeScreen } from "../LifeScreen";
import { FinanceScreen } from "../FinanceScreen";
import { HealthTabScreen } from "../HealthTabScreen";
import { ExerciseScreen } from "../ExerciseScreen";
import { InsightsScreen } from "../InsightsScreen";
import { MindfulnessScreen } from "../MindfulnessScreen";

const PREVIEW_SCALE = 0.52;
const FRAME_W = 320;
const FRAME_H = 560;

type SelectedElement =
  | { kind: "page"; id: string; label: string }
  | { kind: "card"; id: string; label: string }
  | { kind: "tile"; id: string; label: string };

const PAGE_CHIPS: { key: string; label: string; screen: React.ComponentType<any> }[] = [
  { key: "overview",   label: "Home",        screen: OverviewScreen },
  { key: "wellness",   label: "Wellness",    screen: HealthScreen },
  { key: "meals",      label: "Meals",       screen: MealsScreen },
  { key: "life",       label: "Life",        screen: LifeScreen },
  { key: "finance",    label: "Finance",     screen: FinanceScreen },
  { key: "health_tab", label: "Health",      screen: HealthTabScreen },
  { key: "exercise",   label: "Exercise",    screen: ExerciseScreen },
  { key: "mindful",    label: "Mindfulness", screen: MindfulnessScreen },
  { key: "insights",   label: "Insights",    screen: InsightsScreen },
];

const PAGE_IDS: Record<string, string> = {
  overview:   "page_overview",
  wellness:   "page_wellness",
  meals:      "page_meals",
  life:       "page_life",
  finance:    "page_finance",
  health_tab: "page_health_tab",
  exercise:   "page_exercise",
  mindful:    "page_mindful",
  insights:   "page_insights",
};

interface ErrorBoundaryState { error: boolean }
class ScreenErrorBoundary extends Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontSize: FONT_SIZES.caption, opacity: 0.5 }}>Preview unavailable</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const MiniStack = createNativeStackNavigator();

function MiniNavigator({ ScreenComponent }: { ScreenComponent: React.ComponentType<any> }) {
  return (
    <MiniStack.Navigator screenOptions={{ headerShown: false }}>
      <MiniStack.Screen name="PreviewMain" component={ScreenComponent} />
    </MiniStack.Navigator>
  );
}

interface PreviewSliderProps {
  value: number;
  onChange: (v: number) => void;
  color: string;
}

function PreviewSlider({ value, onChange, color }: PreviewSliderProps) {
  const { theme } = useTheme();
  const fill = (value - CARD_OPACITY_MIN) / (CARD_OPACITY_MAX - CARD_OPACITY_MIN);
  return (
    <View style={{ height: 36, justifyContent: "center" }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: theme.cardBorder, overflow: "hidden" }}>
        <View style={{ width: `${fill * 100}%`, height: "100%", backgroundColor: color, borderRadius: 2 }} />
      </View>
      <View
        style={{
          position: "absolute",
          left: `${fill * 100}%` as any,
          width: 20,
          height: 20,
          borderRadius: 10,
          backgroundColor: theme.card,
          borderWidth: 2,
          borderColor: color,
          marginLeft: -10,
          top: 8,
        }}
      />
    </View>
  );
}

interface ElementEditorProps {
  selected: SelectedElement;
  globalOpacity: number;
  onClose: () => void;
}

function ElementEditor({ selected, globalOpacity, onClose }: ElementEditorProps) {
  const { theme } = useTheme();
  const {
    perObjectOpacity, setObjectOpacity, resetObjectOpacity,
    perObjectGlassBlur, setObjectGlassBlur,
    elementBgImages, setElementBgImage, removeElementBgImage,
  } = useAppSettings();

  const id = selected.id;
  const isPage = selected.kind === "page";
  const isCustomOpacity = perObjectOpacity[id] !== undefined;
  const opacityVal = isCustomOpacity ? perObjectOpacity[id] : globalOpacity;
  const glassEnabled = perObjectGlassBlur[id] ?? false;
  const bgImage = elementBgImages[id];

  const handlePickImage = async () => {
    try {
      const uri = await pickAndStoreImage(id);
      if (!uri) return;
      if (bgImage) deleteStoredImage(bgImage.uri);
      setElementBgImage(id, { uri, opacity: bgImage?.opacity ?? 0.85 });
      Haptics.selectionAsync();
    } catch {
      Alert.alert("Couldn't load image", "Try a different photo.");
    }
  };

  const handleRemoveImage = () => {
    if (bgImage) deleteStoredImage(bgImage.uri);
    removeElementBgImage(id);
    Haptics.selectionAsync();
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={edStyles.overlay}>
          <TouchableWithoutFeedback>
            <View style={[edStyles.sheet, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
              <View style={edStyles.handle} />

              <View style={edStyles.header}>
                <View style={{ flex: 1 }}>
                  <Text style={[edStyles.title, { color: theme.textStrong }]}>{selected.label}</Text>
                  <Text style={[edStyles.sub, { color: theme.textSoft }]}>
                    {selected.kind === "page" ? "Page background" : selected.kind === "card" ? "Card" : "Tile"}
                  </Text>
                </View>
                <Pressable onPress={onClose} style={[edStyles.doneBtn, { backgroundColor: theme.teal.solid }]}>
                  <Text style={edStyles.doneTxt}>Done</Text>
                </Pressable>
              </View>

              <View style={[edStyles.divider, { backgroundColor: theme.cardBorder }]} />

              {!isPage && (
                <>
                  <View style={edStyles.row}>
                    <Text style={[edStyles.label, { color: theme.textSoft }]}>Opacity</Text>
                    <Text style={[edStyles.val, { color: theme.textStrong }]}>{Math.round(opacityVal * 100)}%</Text>
                  </View>
                  <PreviewSlider
                    value={opacityVal}
                    onChange={(v) => setObjectOpacity(id, v)}
                    color={theme.teal.solid}
                  />
                  {isCustomOpacity && (
                    <Pressable
                      onPress={() => { resetObjectOpacity(id); Haptics.selectionAsync(); }}
                      style={[edStyles.linkBtn, { borderColor: theme.cardBorder, marginTop: 6 }]}
                    >
                      <Text style={[edStyles.linkTxt, { color: theme.textSoft }]}>Reset to global</Text>
                    </Pressable>
                  )}

                  <View style={[edStyles.row, { marginTop: 16 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[edStyles.label, { color: theme.textSoft }]}>Glass blur</Text>
                      <Text style={[{ fontSize: FONT_SIZES.micro, color: theme.textSoft }]}>Activates after next build</Text>
                    </View>
                    <Switch
                      value={glassEnabled}
                      onValueChange={(v) => { setObjectGlassBlur(id, v); Haptics.selectionAsync(); }}
                      trackColor={{ true: theme.teal.solid, false: theme.cardBorder }}
                      thumbColor="#ffffff"
                    />
                  </View>
                </>
              )}

              <View style={[edStyles.row, { marginTop: isPage ? 0 : 16 }]}>
                <Text style={[edStyles.label, { color: theme.textSoft }]}>Background image</Text>
              </View>
              {bgImage ? (
                <View>
                  <Image
                    source={{ uri: bgImage.uri }}
                    style={{ width: "100%", height: 90, borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: theme.cardBorder }}
                    resizeMode="cover"
                  />
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                    <Pressable onPress={handlePickImage} style={[edStyles.linkBtn, { borderColor: theme.cardBorder }]}>
                      <Text style={[edStyles.linkTxt, { color: theme.textStrong }]}>Replace</Text>
                    </Pressable>
                    <Pressable onPress={handleRemoveImage} style={[edStyles.linkBtn, { borderColor: theme.cardBorder }]}>
                      <Text style={[edStyles.linkTxt, { color: theme.danger }]}>Remove</Text>
                    </Pressable>
                  </View>
                  <View style={[edStyles.row, { marginTop: 12 }]}>
                    <Text style={[edStyles.label, { color: theme.textSoft }]}>Image strength</Text>
                    <Text style={[edStyles.val, { color: theme.textStrong }]}>{Math.round((bgImage.opacity ?? 0.85) * 100)}%</Text>
                  </View>
                  <PreviewSlider
                    value={bgImage.opacity ?? 0.85}
                    onChange={(v) => setElementBgImage(id, { ...bgImage, opacity: v })}
                    color={theme.violet.solid}
                  />
                </View>
              ) : (
                <Pressable
                  onPress={handlePickImage}
                  style={[edStyles.pickBtn, { borderColor: theme.cardBorder }]}
                >
                  <Ionicons name="image-outline" size={18} color={theme.teal.solid} />
                  <Text style={[edStyles.linkTxt, { color: theme.textStrong }]}>Choose a photo</Text>
                </Pressable>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

export function ThemePreviewFrame() {
  const { theme } = useTheme();
  const { cardOpacity } = useAppSettings();
  const [pageKey, setPageKey] = useState("overview");
  const [selected, setSelected] = useState<SelectedElement | null>(null);

  const chip = PAGE_CHIPS.find((c) => c.key === pageKey) ?? PAGE_CHIPS[0];
  const ScreenComponent = chip.screen;

  const handleSelectElement = (id: string, kind: "card" | "tile") => {
    const label = id.replace(/_/g, " ");
    setSelected({ kind, id, label });
    Haptics.selectionAsync();
  };

  const handleSelectPage = () => {
    const pageId = PAGE_IDS[pageKey] ?? `page_${pageKey}`;
    setSelected({ kind: "page", id: pageId, label: `${chip.label} background` });
    Haptics.selectionAsync();
  };

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={chipStyles.row}
        style={chipStyles.scroll}
      >
        {PAGE_CHIPS.map((c) => {
          const active = c.key === pageKey;
          return (
            <Pressable
              key={c.key}
              onPress={() => { setPageKey(c.key); setSelected(null); Haptics.selectionAsync(); }}
              style={[
                chipStyles.chip,
                {
                  backgroundColor: active ? theme.teal.solid : theme.card,
                  borderColor: active ? theme.teal.solid : theme.cardBorder,
                },
              ]}
            >
              <Text style={[chipStyles.chipTxt, { color: active ? "#fff" : theme.textSoft }]}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={frameStyles.editPageRow}>
        <Pressable
          onPress={handleSelectPage}
          style={[frameStyles.editPageBtn, { borderColor: theme.cardBorder, backgroundColor: theme.card }]}
        >
          <Ionicons name="color-fill-outline" size={13} color={theme.textSoft} />
          <Text style={[frameStyles.editPageTxt, { color: theme.textSoft }]}>Edit page background</Text>
        </Pressable>
      </View>

      {/*
        Scale math: transform:scale keeps the View's layout size at full (FRAME_W+22)×(FRAME_H+22)
        even though the visual output shrinks by PREVIEW_SCALE. We clip the outer container to
        the scaled dimensions. Negative right/bottom margins on the inner View remove the excess
        layout space so the container height collapses correctly.
        scaled_dim = full_dim * PREVIEW_SCALE
        excess = full_dim - scaled_dim = full_dim * (1 - PREVIEW_SCALE)
        → marginRight = marginBottom = -full_dim * (1 - PREVIEW_SCALE)
      */}
      <View style={[frameStyles.scaleContainer, { alignSelf: "center" }]}>
        <View
          style={[
            frameStyles.phoneOuter,
            { borderColor: theme.ink, backgroundColor: theme.ink },
            {
              transform: [{ scale: PREVIEW_SCALE }],
              marginRight: -(FRAME_W + 22) * (1 - PREVIEW_SCALE),
              marginBottom: -(FRAME_H + 22) * (1 - PREVIEW_SCALE),
            },
          ]}
        >
          <View style={[frameStyles.phoneInner, { width: FRAME_W, height: FRAME_H }]}>
            <ScreenErrorBoundary>
              <ThemeEditContext.Provider
                value={{ editMode: true, selectedId: selected?.kind !== "page" ? selected?.id ?? null : null, selectElement: handleSelectElement }}
              >
                <NavigationIndependentTree>
                  <NavigationContainer>
                    <MiniNavigator ScreenComponent={ScreenComponent} />
                  </NavigationContainer>
                </NavigationIndependentTree>
              </ThemeEditContext.Provider>
            </ScreenErrorBoundary>
          </View>
        </View>
      </View>

      {selected && (
        <View style={[hintStyles.bar, { backgroundColor: theme.card, borderColor: theme.cardBorder }]}>
          <Ionicons name="pencil-outline" size={14} color={theme.teal.solid} />
          <Text style={[hintStyles.txt, { color: theme.textSoft }]}>
            Editing: <Text style={{ color: theme.textStrong, fontWeight: "700" }}>{selected.label}</Text>
          </Text>
          <Pressable onPress={() => setSelected(null)}>
            <Ionicons name="close-circle" size={18} color={theme.textSoft} />
          </Pressable>
        </View>
      )}

      {selected && (
        <ElementEditor
          selected={selected}
          globalOpacity={cardOpacity}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}

const frameStyles = StyleSheet.create({
  scaleContainer: {
    overflow: "hidden",
    marginVertical: SPACING.md,
  },
  phoneOuter: {
    borderRadius: RADIUS.xl + 6,
    padding: 8,
    borderWidth: 3,
  },
  phoneInner: {
    borderRadius: RADIUS.xl - 2,
    overflow: "hidden",
  },
  editPageRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: SPACING.base,
    marginBottom: SPACING.xs,
  },
  editPageBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 1,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
  },
  editPageTxt: { fontSize: FONT_SIZES.caption, fontWeight: "600" },
});

const chipStyles = StyleSheet.create({
  scroll: { marginBottom: SPACING.sm },
  row: { paddingHorizontal: SPACING.base, gap: SPACING.sm, paddingVertical: SPACING.xs },
  chip: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.pill,
    borderWidth: 1.5,
  },
  chipTxt: { fontSize: FONT_SIZES.caption, fontWeight: "700" },
});

const hintStyles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.base,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    marginHorizontal: SPACING.base,
    marginBottom: SPACING.sm,
  },
  txt: { flex: 1, fontSize: FONT_SIZES.caption },
});

const edStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    borderWidth: 2,
    padding: SPACING.lg,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(150,150,150,0.4)",
    alignSelf: "center",
    marginBottom: SPACING.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: SPACING.md,
  },
  title: { fontSize: FONT_SIZES.subheading, fontWeight: "800" },
  sub: { fontSize: FONT_SIZES.caption, marginTop: 2 },
  divider: { height: 1, marginBottom: SPACING.md },
  row: { flexDirection: "row", alignItems: "center", marginBottom: SPACING.xs },
  label: { flex: 1, fontSize: FONT_SIZES.label, fontWeight: "600" },
  val: { fontSize: FONT_SIZES.body, fontWeight: "700" },
  doneBtn: { paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm, borderRadius: RADIUS.md },
  doneTxt: { color: "#fff", fontWeight: "700", fontSize: FONT_SIZES.body },
  linkBtn: { borderWidth: 1.5, borderRadius: RADIUS.sm, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  linkTxt: { fontSize: FONT_SIZES.label, fontWeight: "600" },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: RADIUS.md,
    paddingVertical: SPACING.md,
  },
});
