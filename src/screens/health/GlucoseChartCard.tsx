/**
 * health/GlucoseChartCard.tsx
 * Glucose chart card with scrubbing, annotations, TIR badge, and Dexcom sync.
 * Extracted from HealthScreen.tsx — no logic changes.
 */
import React from "react";
import { View, Text, Pressable, TextInput, Animated } from "react-native";
import Svg, {
  Polyline, Line, Text as SvgText, Rect, Circle,
  Defs, LinearGradient as SvgLinearGradient, Stop, Polygon,
} from "react-native-svg";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { ShadowCard } from "../../components/ShadowCard";
import { RangeSelector } from "../../components/RangeSelector";
import { CardLoadingOverlay } from "../../components/CardLoadingOverlay";
import { DefinedTerm } from "../../components/DefinedTerm";
import { ThemedIcon } from "../../theme/iconRegistry";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../../theme/ThemeContext";
import { getMetricPalette } from "../../lib/metricColors";
import { api } from "../../api/client";
import {
  RANGE_OPTIONS, CHART_WIDTH, CHART_HEIGHT, PAD_LEFT, PAD_BOTTOM, PAD_TOP,
  getTimeTicks,
  type GlucoseReading, type GlucoseStatus,
} from "./healthScreenShared";

type Annotation = { id: string; annotated_at: string; label: string };

interface ScrubInfo {
  px: number;
  time: string;
  todayVal: number | null;
  yestVal: number | null;
  delta: number | null;
}

interface Props {
  glucoseEntranceAnim: Animated.Value;
  chartFadeAnim: Animated.Value;
  loading: boolean;
  refreshing: boolean;
  todayReadings: GlucoseReading[];
  yesterdayReadings: GlucoseReading[];
  todayPoints: string;
  yesterdayPoints: string;
  dataGaps: Array<{ x1: number; x2: number }>;
  minVal: number;
  maxVal: number;
  gridValues: number[];
  highY: number;
  lowY: number;
  chartInnerHeight: number;
  windowStart: number;
  now: number;
  weekAvgGlucose: number | null;
  tirPct: number | null;
  peak: number | null;
  status: GlucoseStatus | null;
  rangeHours: number;
  setRangeHours: (h: number) => void;
  annotations: Annotation[];
  setAnnotations: React.Dispatch<React.SetStateAction<Annotation[]>>;
  annotationModalVisible: boolean;
  setAnnotationModalVisible: (v: boolean) => void;
  annotationLabel: string;
  setAnnotationLabel: (v: string) => void;
  annotationSaving: boolean;
  setAnnotationSaving: (v: boolean) => void;
  activeAnnotation: Annotation | null;
  setActiveAnnotation: React.Dispatch<React.SetStateAction<Annotation | null>>;
  scrubInfo: ScrubInfo | null;
  panGesture: ReturnType<typeof Gesture.Pan>;
  dexcomSyncing: boolean;
  dexcomSyncMsg: { text: string; kind: "ok" | "warn" | "err" } | null;
  onDexcomForceSync: () => void;
  navigation: any;
  styles: any;
}

export function GlucoseChartCard({
  glucoseEntranceAnim,
  chartFadeAnim,
  loading,
  refreshing,
  todayReadings,
  yesterdayReadings,
  todayPoints,
  yesterdayPoints,
  dataGaps,
  minVal,
  maxVal,
  gridValues,
  highY,
  lowY,
  chartInnerHeight,
  windowStart,
  now,
  weekAvgGlucose,
  tirPct,
  peak,
  status,
  rangeHours,
  setRangeHours,
  annotations,
  setAnnotations,
  annotationModalVisible,
  setAnnotationModalVisible,
  annotationLabel,
  setAnnotationLabel,
  annotationSaving,
  setAnnotationSaving,
  activeAnnotation,
  setActiveAnnotation,
  scrubInfo,
  panGesture,
  dexcomSyncing,
  dexcomSyncMsg,
  onDexcomForceSync,
  navigation,
  styles,
}: Props) {
  const { theme } = useTheme();
  const ink = theme.ink;
  const card = theme.card;

  return (
    <Animated.View style={{ opacity: glucoseEntranceAnim }}>
    <ShadowCard size="hero" accent={theme.berry.solid} rotate={-0.5} padding={14} cardId="glucose_card">
      <View style={styles.cardHeaderRow}>
        <Text style={[styles.cardTitle, { color: theme.textStrong }]} allowFontScaling maxFontSizeMultiplier={1.4} accessibilityRole="header">Glucose</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {tirPct !== null ? (
            <DefinedTerm term="time_in_range">
              <View style={[styles.tirBadge, { backgroundColor: tirPct >= 70 ? theme.teal.bg : theme.amber.bg, borderColor: tirPct >= 70 ? theme.teal.sub : theme.amber.sub }]}>
                <Text style={[styles.tirBadgeText, { color: tirPct >= 70 ? theme.teal.sub : theme.amber.sub }]}>
                  {tirPct}% IN RANGE
                </Text>
              </View>
            </DefinedTerm>
          ) : null}
          {peak !== null ? (
            <View style={styles.peakBadge}>
              <Text style={styles.peakBadgeText}>{peak} PEAK</Text>
            </View>
          ) : null}
          <Pressable
            onPress={() => setAnnotationModalVisible(true)}
            style={[styles.addAnnotationBtn, { borderColor: ink }]}
            accessibilityLabel="Add chart annotation"
            hitSlop={6}
          >
            <Ionicons name="flag-outline" size={14} color={ink} />
          </Pressable>
        </View>
      </View>

      {/* Range selector + live glucose value inline */}
      {(function () {
        const mgDl = status?.hasData ? (status.mg_dl ?? null) : null;
        const glucosePal2 = getMetricPalette("glucose", mgDl, theme as any);
        return (
          <View style={[styles.rangeRow, { justifyContent: "space-between", alignItems: "center" }]}>
            <RangeSelector
              value={rangeHours}
              options={RANGE_OPTIONS}
              onChange={setRangeHours}
              label="Glucose range"
            />
            {status?.hasData && mgDl !== null ? (
              <View
                style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}
                accessibilityLabel={`Current glucose ${mgDl} milligrams per deciliter${status.delta != null ? `, delta ${status.delta > 0 ? "up" : "down"} ${Math.abs(status.delta)}` : ""}`}
              >
                <Text style={{ fontSize: 26, fontWeight: "900", color: glucosePal2.fg, letterSpacing: -0.5 }} allowFontScaling maxFontSizeMultiplier={1.3}>
                  {mgDl}
                </Text>
                {status.arrow ? (
                  <Text style={{ fontSize: 18, fontWeight: "700", color: glucosePal2.fg }} allowFontScaling maxFontSizeMultiplier={1.3}>{status.arrow}</Text>
                ) : null}
                {status.delta != null ? (
                  <Text style={{ fontSize: 12, fontWeight: "800", color: status.delta > 0 ? theme.danger : theme.success, marginLeft: 2 }} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {status.delta > 0 ? "+" : ""}{status.delta}
                  </Text>
                ) : null}
                {status.minutesSinceReading != null ? (
                  <Text style={{ fontSize: 9, color: theme.textSoft, marginLeft: 2 }}>{status.minutesSinceReading}m</Text>
                ) : null}
              </View>
            ) : null}
          </View>
        );
      })()}

      {loading ? (
        <ShadowCard skeleton skeletonHeight={140} style={{ marginTop: 12 }} />
      ) : todayReadings.length === 0 && !status?.hasData ? (
        <ShadowCard size="card" bg={(theme as any).berry?.bg ?? "#FAE0E4"} accent={(theme as any).berry?.solid} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.textStrong, fontWeight: "900", marginBottom: 4, fontSize: 15 }}>No glucose data</Text>
          <Text style={{ color: theme.textSoft, fontSize: 13 }}>Connect Dexcom to see your glucose readings here.</Text>
          <Pressable onPress={() => navigation.navigate("SettingsDexcom")} style={{ marginTop: 10 }}>
            <Text style={{ color: (theme as any).berry?.sub ?? theme.teal.solid, fontWeight: "800" }}>Connect Dexcom →</Text>
          </Pressable>
        </ShadowCard>
      ) : todayReadings.length === 0 ? (
        <Text style={{ color: theme.textSoft, fontSize: 12, marginTop: 10 }}>
          No glucose readings in this window yet.
        </Text>
      ) : (
        <GestureDetector gesture={panGesture}>
          <Animated.View
            accessible={true}
            accessibilityRole="image"
            accessibilityLabel={
              status?.hasData
                ? `Glucose chart. Last reading ${status.mg_dl} mg/dL${status.arrow ? ", " + status.arrow : ""}${status.minutesSinceReading != null ? ", " + status.minutesSinceReading + " minutes ago" : ""}. ${todayReadings.filter(r => Number(r.mg_dl) < 70 || Number(r.mg_dl) > 180).length} readings out of the 70–180 mg/dL range in this window.`
                : "Glucose chart. No readings in the current time window."
            }
            style={{ opacity: chartFadeAnim }}
          >
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT} style={{ marginTop: 12 }}>
              {gridValues.map((v) => {
                const gy = PAD_TOP + chartInnerHeight - ((v - minVal) / (maxVal - minVal)) * chartInnerHeight;
                return (
                  <React.Fragment key={v}>
                    <Line x1={PAD_LEFT} x2={CHART_WIDTH} y1={gy} y2={gy} stroke={theme.textSoft} strokeDasharray="2,3" strokeWidth={0.5} opacity={0.35} />
                    <SvgText x={PAD_LEFT - 4} y={gy + 4} fontSize={9} fill={theme.textSoft} textAnchor="end">{v}</SvgText>
                  </React.Fragment>
                );
              })}

              {/* Target range band 70–180 mg/dL — green tint */}
              <Rect
                x={PAD_LEFT}
                y={highY}
                width={CHART_WIDTH - PAD_LEFT}
                height={lowY - highY}
                fill={theme.success}
                opacity={0.12}
                stroke={theme.success}
                strokeWidth={1}
                strokeDasharray="5,5"
                strokeOpacity={0.4}
              />

              {/* No-data gaps — hatched gray so flatlines aren't misread as stable */}
              {dataGaps.map(function (g, i) {
                return (
                  <Rect
                    key={"gap" + i}
                    x={g.x1}
                    y={PAD_TOP}
                    width={Math.max(g.x2 - g.x1, 2)}
                    height={chartInnerHeight}
                    fill={theme.textSoft}
                    opacity={0.1}
                  />
                );
              })}

              {/* Yesterday — dotted reference line */}
              {yesterdayPoints.length > 0 ? (
                <Polyline points={yesterdayPoints} fill="none" stroke={theme.textSoft} strokeWidth={2} strokeDasharray="4,4" opacity={0.65} />
              ) : null}

              {/* Weekly average horizontal line */}
              {weekAvgGlucose !== null && weekAvgGlucose >= minVal && weekAvgGlucose <= maxVal ? (
                (() => {
                  const wy = PAD_TOP + chartInnerHeight - ((weekAvgGlucose - minVal) / (maxVal - minVal)) * chartInnerHeight;
                  return (
                    <>
                      <Line x1={PAD_LEFT} x2={CHART_WIDTH} y1={wy} y2={wy}
                        stroke={theme.berry.sub ?? theme.berry.solid} strokeWidth={1.5} strokeDasharray="6,4" opacity={0.55} />
                      <SvgText x={CHART_WIDTH - 2} y={wy - 3} fontSize={8} fill={theme.berry.sub ?? theme.berry.solid} textAnchor="end" opacity={0.75}>
                        7d avg {weekAvgGlucose}
                      </SvgText>
                    </>
                  );
                })()
              ) : null}

              {/* Today — double stroke: ink outline below, color on top */}
              {todayPoints.length > 0 ? (
                <>
                  {todayReadings.length >= 2 && (() => {
                    const ptArr = todayPoints.split(" ");
                    const firstX = ptArr[0].split(",")[0];
                    const lastX = ptArr[ptArr.length - 1].split(",")[0];
                    const baseY = PAD_TOP + chartInnerHeight;
                    return (
                      <>
                        <Defs>
                          <SvgLinearGradient id="glucoseFill" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={theme.berry.bar} stopOpacity="0.30" />
                            <Stop offset="1" stopColor={theme.berry.bar} stopOpacity="0.02" />
                          </SvgLinearGradient>
                        </Defs>
                        <Polygon points={`${todayPoints} ${lastX},${baseY} ${firstX},${baseY}`} fill="url(#glucoseFill)" />
                      </>
                    );
                  })()}
                  <Polyline points={todayPoints} fill="none" stroke={ink} strokeWidth={3.5} />
                  <Polyline points={todayPoints} fill="none" stroke={theme.berry.bar} strokeWidth={2} />
                </>
              ) : null}

              {/* X-axis time labels */}
              {getTimeTicks(windowStart, now, rangeHours).map(function ({ t, label }) {
                const x = PAD_LEFT + ((t - windowStart) / (now - windowStart)) * (CHART_WIDTH - PAD_LEFT);
                return (
                  <SvgText key={t} x={x} y={CHART_HEIGHT - 4} fontSize={8} fill={theme.textSoft} textAnchor="middle" opacity={0.8}>
                    {label}
                  </SvgText>
                );
              })}

              {/* Annotation vertical lines */}
              {annotations.map(function (ann) {
                const t = new Date(ann.annotated_at).getTime();
                if (t < windowStart || t > now) return null;
                const ax = PAD_LEFT + ((t - windowStart) / (now - windowStart)) * (CHART_WIDTH - PAD_LEFT);
                return (
                  <React.Fragment key={ann.id}>
                    <Line x1={ax} x2={ax} y1={PAD_TOP} y2={CHART_HEIGHT - PAD_BOTTOM}
                      stroke={theme.amber?.solid ?? "#F59E0B"} strokeWidth={1.5} strokeDasharray="3,3" opacity={0.8} />
                    <Circle cx={ax} cy={PAD_TOP + 4} r={4}
                      fill={theme.amber?.solid ?? "#F59E0B"} stroke={ink} strokeWidth={1} />
                  </React.Fragment>
                );
              })}

              {/* Scrub indicator: vertical line + hit dots */}
              {scrubInfo ? (
                <>
                  <Line
                    x1={scrubInfo.px} x2={scrubInfo.px}
                    y1={PAD_TOP} y2={CHART_HEIGHT - PAD_BOTTOM}
                    stroke={ink} strokeWidth={1} strokeDasharray="3,3" opacity={0.7}
                  />
                  {scrubInfo.todayVal !== null ? (
                    <Circle
                      cx={scrubInfo.px}
                      cy={PAD_TOP + chartInnerHeight - ((scrubInfo.todayVal - minVal) / (maxVal - minVal)) * chartInnerHeight}
                      r={5} fill={theme.berry.bar} stroke={ink} strokeWidth={1.5}
                    />
                  ) : null}
                  {scrubInfo.yestVal !== null ? (
                    <Circle
                      cx={scrubInfo.px}
                      cy={PAD_TOP + chartInnerHeight - ((scrubInfo.yestVal - minVal) / (maxVal - minVal)) * chartInnerHeight}
                      r={4} fill={theme.textSoft} stroke={ink} strokeWidth={1} opacity={0.5}
                    />
                  ) : null}
                </>
              ) : null}
            </Svg>

            {/* Scrub readout card */}
            {scrubInfo ? (
              <View style={[styles.scrubCard, { backgroundColor: card, borderColor: ink }]}>
                <Text style={[styles.scrubTime, { color: theme.textSoft }]}>{scrubInfo.time}</Text>
                <View style={styles.scrubStats}>
                  {scrubInfo.todayVal !== null ? (
                    <View style={styles.scrubStat}>
                      <Text style={[styles.scrubLabel, { color: theme.textSoft }]}>TODAY</Text>
                      <Text style={[styles.scrubVal, { color: theme.berry.sub }]}>{scrubInfo.todayVal}</Text>
                    </View>
                  ) : null}
                  {scrubInfo.yestVal !== null ? (
                    <View style={styles.scrubStat}>
                      <Text style={[styles.scrubLabel, { color: theme.textSoft }]}>YESTERDAY</Text>
                      <Text style={[styles.scrubVal, { color: theme.textSoft }]}>{scrubInfo.yestVal}</Text>
                    </View>
                  ) : null}
                  {scrubInfo.delta !== null ? (
                    <View style={styles.scrubStat}>
                      <Text style={[styles.scrubLabel, { color: theme.textSoft }]}>VS YESTERDAY</Text>
                      <Text style={[styles.scrubVal, { color: scrubInfo.delta > 0 ? theme.red.sub : theme.teal.bar }]}>
                        {scrubInfo.delta > 0 ? "+" : ""}{scrubInfo.delta}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}
          </Animated.View>
        </GestureDetector>
      )}

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.berry.bar, borderWidth: 1.5, borderColor: ink }]} />
          <Text style={{ color: theme.textSoft, fontSize: 11 }}>Today</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: theme.textSoft, opacity: 0.4 }]} />
          <Text style={{ color: theme.textSoft, fontSize: 11 }}>Yesterday</Text>
        </View>
        {weekAvgGlucose !== null ? (
          <View style={styles.legendItem}>
            <View style={{ width: 14, height: 2, backgroundColor: theme.berry.sub ?? theme.berry.solid, opacity: 0.6, borderRadius: 1 }} />
            <Text style={{ color: theme.textSoft, fontSize: 11 }}>7d avg</Text>
          </View>
        ) : null}
        {annotations.filter(function (a) {
          const t = new Date(a.annotated_at).getTime();
          return t >= windowStart && t <= now;
        }).length > 0 ? (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: theme.amber?.solid ?? "#F59E0B" }]} />
            <Text style={{ color: theme.textSoft, fontSize: 11 }}>Annotations</Text>
          </View>
        ) : null}
      </View>

      {/* Annotation chips for this window */}
      {annotations.filter(function (a) {
        const t = new Date(a.annotated_at).getTime();
        return t >= windowStart && t <= now;
      }).map(function (ann) {
        const d = new Date(ann.annotated_at);
        const timeLabel = (d.getHours() % 12 || 12)
          + ":" + String(d.getMinutes()).padStart(2, "0")
          + (d.getHours() >= 12 ? "pm" : "am");
        return (
          <Pressable
            key={ann.id}
            onPress={function () { setActiveAnnotation(activeAnnotation?.id === ann.id ? null : ann); }}
            style={[styles.annotationChip, { backgroundColor: theme.amber?.bg ?? "#FFF7ED", borderColor: theme.amber?.sub ?? "#D97706" }]}
            accessibilityLabel={"Annotation: " + ann.label}
          >
            <ThemedIcon slot="ui.flag" size={12} />
            <Text style={[styles.annotationChipLabel, { color: theme.textStrong }]} numberOfLines={1}>{ann.label}</Text>
            <Text style={[styles.annotationChipTime, { color: theme.textSoft }]}>{timeLabel}</Text>
            <Pressable
              onPress={function () {
                api.deleteAnnotation(ann.id).then(function () {
                  setAnnotations(function (prev) { return prev.filter(function (a) { return a.id !== ann.id; }); });
                  if (activeAnnotation?.id === ann.id) setActiveAnnotation(null);
                }).catch(function () {});
              }}
              hitSlop={8}
              accessibilityLabel="Delete annotation"
            >
              <Ionicons name="close-circle" size={14} color={theme.textSoft} />
            </Pressable>
          </Pressable>
        );
      })}

      {/* Add annotation modal */}
      {annotationModalVisible ? (
        <View style={[styles.annotationModalCard, { backgroundColor: theme.card, borderColor: ink }]}>
          <Text style={[styles.annotationModalTitle, { color: theme.textStrong }]}>Add marker</Text>
          <TextInput
            style={[styles.annotationInput, { backgroundColor: theme.page, borderColor: ink, color: theme.textStrong }]}
            placeholder="e.g. Started new medication"
            placeholderTextColor={theme.textSoft}
            value={annotationLabel}
            onChangeText={setAnnotationLabel}
            maxLength={80}
            autoFocus
          />
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <Pressable
              style={[styles.annotationBtn, { backgroundColor: ink, flex: 1 }]}
              onPress={async function () {
                if (!annotationLabel.trim()) return;
                setAnnotationSaving(true);
                try {
                  const ann = await api.createAnnotation(new Date().toISOString(), annotationLabel.trim());
                  setAnnotations(function (prev) { return [...prev, ann]; });
                  setAnnotationLabel("");
                  setAnnotationModalVisible(false);
                } catch { }
                finally { setAnnotationSaving(false); }
              }}
              disabled={annotationSaving || !annotationLabel.trim()}
            >
              {annotationSaving
                ? <LoadingIndicator color="#fff" />
                : <Text style={styles.annotationBtnText}>Save</Text>}
            </Pressable>
            <Pressable
              style={[styles.annotationBtn, { backgroundColor: theme.card, borderWidth: 2, borderColor: ink, flex: 1 }]}
              onPress={function () { setAnnotationModalVisible(false); setAnnotationLabel(""); }}
            >
              <Text style={[styles.annotationBtnText, { color: ink }]}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Dexcom sync status pill */}
      {status?.hasData ? (() => {
        const mins = status.minutesSinceReading;
        const stale = status.isStale;
        const showMsg = dexcomSyncMsg !== null;
        const msgKind = dexcomSyncMsg?.kind ?? (stale ? "warn" : "ok");
        const palette =
          msgKind === "err" ? { border: theme.red.sub, bg: theme.red.tint, fg: theme.red.fg } :
          msgKind === "warn" ? { border: theme.amber.sub, bg: theme.amber.bg, fg: theme.amber.fg } :
          { border: theme.teal.sub, bg: theme.teal.bg, fg: theme.teal.fg };
        const label = showMsg
          ? dexcomSyncMsg!.text
          : dexcomSyncing
            ? "Syncing…"
            : stale
              ? `Stalled — last reading ${mins} min ago`
              : mins != null
                ? (mins < 1 ? "Synced just now" : `Synced ${mins} min ago`)
                : "Tap to sync";
        return (
          <Pressable
            onPress={onDexcomForceSync}
            disabled={dexcomSyncing}
            accessibilityRole="button"
            accessibilityLabel={`Dexcom sync status: ${label}. Tap to force a sync now.`}
            hitSlop={6}
            style={{
              alignSelf: "flex-start",
              marginTop: 8,
              paddingVertical: 5,
              paddingHorizontal: 10,
              borderRadius: 20,
              borderWidth: 1.5,
              borderColor: palette.border,
              backgroundColor: palette.bg,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              opacity: dexcomSyncing ? 0.7 : 1,
            }}
          >
            <Ionicons
              name={dexcomSyncing ? "sync" : msgKind === "err" ? "alert-circle" : msgKind === "warn" ? "cloud-offline-outline" : "checkmark-circle"}
              size={12}
              color={palette.fg}
            />
            <Text style={{ fontSize: 11, fontWeight: "800", color: palette.fg }}>{label}</Text>
          </Pressable>
        );
      })() : null}
      <CardLoadingOverlay loading={loading || refreshing} size="large" />
    </ShadowCard>
    </Animated.View>
  );
}
