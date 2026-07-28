import React, { useState } from "react";
import { View, Text, Pressable, Modal, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

const DEFINITIONS: Record<string, { title: string; body: string }> = {
  time_in_range: {
    title: "Time in Range",
    body: "The percentage of your glucose readings that fell between 70 and 180 mg/dL in the selected time window. A higher percentage means your glucose spent more of that period in a typical healthy range.",
  },
  pearson_r: {
    title: "Correlation (r value)",
    body: "A number between −1 and +1 that shows how closely two things move together over the logged days. Near +1 means they tend to rise and fall together. Near −1 means when one rises the other tends to fall. Near 0 means no consistent pattern. Values below ±0.35 generally indicate no meaningful link.",
  },
  mg_dl: {
    title: "mg/dL",
    body: "Milligrams per deciliter — the unit used to measure glucose concentration in your blood. The commonly referenced target range is 70–180 mg/dL.",
  },
  standard_drink: {
    title: "Standard Drink",
    body: "A standardised unit of alcohol — roughly 14 g of pure ethanol, equivalent to a 355 ml (12 oz) regular beer, 148 ml (5 oz) wine, or 44 ml (1.5 oz) spirit. Used to make comparisons consistent across different drink types.",
  },
};

interface Props {
  term: keyof typeof DEFINITIONS;
  children: React.ReactNode;
  /** Passed to the outer Pressable (e.g. for layout positioning) */
  style?: object;
  /** Applied to the child text node (inherit the caller's text style) */
  textStyle?: object;
}

export function DefinedTerm({ term, children, style, textStyle }: Props) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const def = DEFINITIONS[term];

  if (!def) {
    return (
      <View style={style}>
        {typeof children === "string" ? (
          <Text style={textStyle}>{children}</Text>
        ) : (
          children as React.ReactElement
        )}
      </View>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        style={[styles.trigger, style]}
        accessibilityRole="button"
        accessibilityLabel={`${def.title} — tap for definition`}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 8 }}
      >
        {typeof children === "string" ? (
          <Text style={textStyle}>{children}</Text>
        ) : (
          children as React.ReactElement
        )}
        <Ionicons
          name="information-circle-outline"
          size={13}
          color={theme.textSoft}
          style={{ marginLeft: 3, marginTop: 1 }}
        />
      </Pressable>

      {visible ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setVisible(false)}
        >
          <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
            <Pressable
              style={[styles.popover, { backgroundColor: theme.card, borderColor: theme.ink }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={[styles.title, { color: theme.textStrong }]}>{def.title}</Text>
              <Text style={[styles.body, { color: theme.textSoft }]}>{def.body}</Text>
              <Pressable onPress={() => setVisible(false)} style={styles.closeBtn} hitSlop={8}>
                <Text style={[styles.closeTxt, { color: theme.textSoft }]}>CLOSE</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  popover: {
    borderRadius: 14,
    borderWidth: 2,
    padding: 18,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 0,
    elevation: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    lineHeight: 20,
  },
  closeBtn: {
    alignSelf: "flex-end",
    marginTop: 14,
  },
  closeTxt: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
});
