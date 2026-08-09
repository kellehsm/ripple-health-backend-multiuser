import React, { useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { FONT_SIZES, SPACING, RADIUS } from "../theme/tokens";
import { accentColors, type FeatureIntro } from "../onboarding/featureIntros";

interface Props {
  intro: FeatureIntro;
  visible: boolean;
  onClose: () => void;
}

export function FeatureIntroSheet({ intro, visible, onClose }: Props) {
  const { theme } = useTheme();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const accent = accentColors(theme, intro.accent);
  const isLast = page === intro.cards.length - 1;

  function next() {
    if (isLast) { onClose(); return; }
    const nextPage = page + 1;
    scrollRef.current?.scrollTo({ x: nextPage * width, animated: true });
    setPage(nextPage);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.screen, { backgroundColor: theme.page }]}>
        <View style={styles.topBar}>
          <Text style={[styles.eyebrow, { color: accent.sub }]}>
            {intro.name.toUpperCase()}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.skipTouch}>
            <Text style={[styles.skipText, { color: theme.textSoft }]}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.dots}>
          {intro.cards.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i === page ? theme.ink : theme.cardBorder,
                  width: i === page ? 22 : 8,
                },
              ]}
            />
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          style={{ flex: 1 }}
        >
          {intro.cards.map((card, i) => (
            <View key={i} style={[styles.cardPage, { width }]}>
              <View
                style={[
                  styles.emojiBlock,
                  { backgroundColor: accent.bg, borderColor: theme.ink },
                ]}
              >
                <Text style={styles.emoji}>{card.emoji}</Text>
              </View>
              <Text style={[styles.cardTitle, { color: theme.textStrong }]}>
                {card.title}
              </Text>
              <Text style={[styles.cardBody, { color: theme.textSoft }]}>
                {card.body}
              </Text>
            </View>
          ))}
        </ScrollView>

        <View style={[styles.bottom, { borderTopColor: theme.cardBorder }]}>
          <Pressable
            onPress={next}
            style={[styles.primaryBtn, { backgroundColor: theme.ink, borderColor: theme.ink }]}
          >
            <Text style={[styles.primaryBtnText, { color: theme.page }]}>
              {isLast ? (intro.ctaLabel ?? "Got it") : "Next  →"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.md,
  },
  eyebrow: {
    fontSize: FONT_SIZES.label,
    fontFamily: "Nunito_800ExtraBold",
    letterSpacing: 1.4,
  },
  skipTouch: { paddingVertical: 4, paddingHorizontal: 8 },
  skipText: { fontSize: FONT_SIZES.body, fontFamily: "Nunito_600SemiBold" },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingBottom: SPACING.lg,
  },
  dot: { height: 8, borderRadius: RADIUS.pill },
  cardPage: {
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: SPACING.lg,
  },
  emojiBlock: {
    width: 140,
    height: 140,
    borderRadius: RADIUS.xl,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: SPACING.xl,
  },
  emoji: { fontSize: 72 },
  cardTitle: {
    fontSize: FONT_SIZES.title,
    fontFamily: "Nunito_800ExtraBold",
    textAlign: "center",
    marginBottom: SPACING.md,
  },
  cardBody: {
    fontSize: FONT_SIZES.subheading,
    fontFamily: "Nunito_500Medium",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 340,
  },
  bottom: {
    borderTopWidth: 1,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  primaryBtn: {
    borderWidth: 2,
    borderRadius: RADIUS.pill,
    paddingVertical: SPACING.md + 2,
    alignItems: "center",
  },
  primaryBtnText: {
    fontSize: FONT_SIZES.subheading,
    fontFamily: "Nunito_800ExtraBold",
  },
});
