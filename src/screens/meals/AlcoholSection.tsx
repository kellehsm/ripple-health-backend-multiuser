/**
 * AlcoholSection — the collapsible alcohol logging card for MealsScreen.
 */
import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ShadowCard } from "../../components/ShadowCard";
import { LoadingIndicator } from "../../components/LoadingIndicator";
import { SearchScanBar } from "../../components/SearchScanBar";
import { ResultRow } from "../../components/ResultRow";
import { AlcoholForm } from "../../components/AlcoholForm";
import { onSolid } from "../../theme/colorUtils";
import {
  type SubstanceResult,
  type SubstancePending,
  type SubstanceEntry,
  type SubstanceTotals,
} from "../../types/substances";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AlcoholSectionProps = {
  theme: any;
  ink: string;
  card: string;
  collapsed: boolean;
  subQuery: string;
  subResults: SubstanceResult[];
  subSearching: boolean;
  subSearchError: string | null;
  pendingSub: SubstancePending | null;
  subEntries: SubstanceEntry[];
  subTotals: SubstanceTotals;
  subLoading: boolean;
  totalBlockStyle: any;
  totalBlockLabelStyle: any;
  totalBlockValueStyle: any;
  sectionLabelStyle: any;
  onToggleCollapse: () => void;
  onSubQueryChange: (text: string) => void;
  onSubSearch: () => void;
  onOpenSubScanner: () => void;
  onAddManually: () => void;
  onSelectSubResult: (r: SubstanceResult) => void;
  onLogSubstance: (values: SubstancePending) => void;
  onCancelPendingSub: () => void;
  onDeleteSubstance: (entry: SubstanceEntry) => void;
};

// ─── AlcoholSection ───────────────────────────────────────────────────────────

export function AlcoholSection({
  theme, ink, card, collapsed,
  subQuery, subResults, subSearching, subSearchError,
  pendingSub, subEntries, subTotals, subLoading,
  totalBlockStyle, totalBlockLabelStyle, totalBlockValueStyle, sectionLabelStyle,
  onToggleCollapse, onSubQueryChange, onSubSearch, onOpenSubScanner, onAddManually,
  onSelectSubResult, onLogSubstance, onCancelPendingSub, onDeleteSubstance,
}: AlcoholSectionProps) {
  return (
    <ShadowCard size="card" bg={theme.purple.tint} accent={theme.purple.solid}>
      <Pressable
        onPress={function () { Haptics.selectionAsync(); onToggleCollapse(); }}
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`Alcohol section, ${subTotals.standard_drinks} standard drinks today. ${collapsed ? "Collapsed" : "Expanded"}. Double tap to toggle.`}
      >
        <Text style={{ fontSize: 19, fontWeight: "900", letterSpacing: -0.5, color: theme.textStrong, marginBottom: 0, flex: 1 }} allowFontScaling maxFontSizeMultiplier={1.4} accessibilityRole="header">Alcohol</Text>
        {subTotals.standard_drinks > 0 ? (
          <Text style={{ color: theme.purple.solid, fontSize: 11, fontWeight: "800" }}>
            {subTotals.standard_drinks} STD
          </Text>
        ) : null}
        <Ionicons name={collapsed ? "chevron-down" : "chevron-up"} size={16} color={theme.textSoft} />
      </Pressable>

      {collapsed ? null : (
        <View style={{ marginTop: 10 }}>
          {subTotals.standard_drinks > 0 && (
            <View style={[totalBlockStyle, { backgroundColor: theme.purple.solid, marginBottom: 10 }]}>
              <Text style={[totalBlockLabelStyle, { color: onSolid(theme.purple.solid) }]}>STD DRINKS TODAY</Text>
              <Text style={[totalBlockValueStyle, { color: onSolid(theme.purple.solid) }]}>{subTotals.standard_drinks}</Text>
            </View>
          )}

          <SearchScanBar
            placeholder="Search by name (beer, wine, spirits…)"
            query={subQuery}
            onQueryChange={onSubQueryChange}
            onSubmit={onSubSearch}
            searching={subSearching}
            accentColor={theme.purple.solid}
            error={subSearchError}
            errorColor={theme.purple.sub}
            actions={[
              { label: "SCAN BARCODE", icon: "barcode-outline", onPress: onOpenSubScanner, accessibilityLabel: "Scan an alcohol product barcode" },
              { label: "+ ADD MANUALLY", onPress: onAddManually, accessibilityLabel: "Add an alcohol entry manually" },
            ]}
          />

          {!pendingSub && subResults.length > 0 && (
            <View style={{ marginTop: 8, gap: 8 }}>
              {subResults.map(function (r, i) {
                return (
                  <ResultRow
                    key={r.source_food_id ?? String(i)}
                    title={r.name}
                    subtitle={r.abv_percent != null ? `${r.abv_percent}% ABV` : undefined}
                    onPress={function () { onSelectSubResult(r); }}
                    accessibilityLabel={`Log ${r.name}${r.abv_percent != null ? `, ${r.abv_percent} percent alcohol` : ""}`}
                    rightIcon={{ name: "create-outline", color: theme.purple.solid }}
                  />
                );
              })}
            </View>
          )}

          {pendingSub ? (
            <AlcoholForm
              initial={pendingSub}
              onSave={onLogSubstance}
              onCancel={onCancelPendingSub}
              theme={theme}
            />
          ) : null}

          {subLoading ? (
            <LoadingIndicator style={{ marginTop: 8 }} />
          ) : subEntries.filter(e => e.substance_type === "alcohol").length > 0 ? (
            <View style={{ marginTop: 10, gap: 6 }}>
              <Text style={[sectionLabelStyle, { color: theme.textSoft }]}>TODAY</Text>
              {subEntries.filter(e => e.substance_type === "alcohol").map(function (entry) {
                const detail = entry.abv_percent != null && entry.volume_ml != null
                  ? entry.abv_percent + "% · " + entry.volume_ml + "mL"
                  : "alcohol";
                return (
                  <ResultRow
                    key={entry.id}
                    title={entry.name || "Alcohol"}
                    subtitle={detail}
                    accessibilityLabel={`${entry.name || "Alcohol"} entry, ${detail}`}
                    badge={{ icon: "wine-outline", iconColor: onSolid(theme.purple.solid), bgColor: theme.purple.solid }}
                    rightIcon={{
                      name: "trash-outline",
                      color: theme.coral.solid,
                      size: 15,
                      onPress: function () { onDeleteSubstance(entry); },
                      accessibilityLabel: `Delete ${entry.name || "alcohol"} entry`,
                    }}
                  />
                );
              })}
            </View>
          ) : null}
        </View>
      )}
    </ShadowCard>
  );
}
