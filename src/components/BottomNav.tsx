import React, { useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ModuleId, ModuleDefinition, MODULE_DEFINITIONS, TabPreferences, HealthSubPreferences } from '../types/tabPreferences';
import { useTheme } from '../theme/ThemeContext';
import { ThemedIcon } from '../theme/iconRegistry';
import { FONT_SIZES } from '../theme/tokens';
import type { Theme } from '../theme/theme';
import Svg, { Circle } from 'react-native-svg';
import { api } from '../api/client';
import { scoreColor } from './DailySummaryCard';

function healthTabLabel(h: HealthSubPreferences): string {
  if (h.medication && h.cycle) return 'Med/Cycle';
  if (h.medication) return 'Meds';
  if (h.cycle) return 'Cycle';
  return 'Med/Cycle';
}

function healthTabIconSlot(h: HealthSubPreferences): string {
  if (h.medication && !h.cycle) return 'tab.health_meds';
  if (h.cycle && !h.medication) return 'tab.health_cycle';
  return 'tab.health_both';
}

interface BottomNavProps {
  preferences: TabPreferences;
  activeRoute: ModuleId | 'home';
  onNavigate: (route: ModuleId | 'home') => void;
  medicationDue?: boolean;
}

function splitAroundHome(selected: ModuleDefinition[]) {
  const half = Math.floor(selected.length / 2);
  return { left: selected.slice(0, half), right: selected.slice(half) };
}

export function BottomNav({ preferences, activeRoute, onNavigate, medicationDue = false }: BottomNavProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const selectedDefs = useMemo(
    () => MODULE_DEFINITIONS.filter((m) => preferences.selectedModules.includes(m.id)),
    [preferences.selectedModules]
  );
  const { left, right } = useMemo(() => splitAroundHome(selectedDefs), [selectedDefs]);

  const [barWidth, setBarWidth] = useState(0);
  const pillX = useRef(new Animated.Value(-100)).current;
  const isInitialPill = useRef(true);

  const totalFlexTabs = left.length + right.length;
  const tabW = barWidth > 0 && totalFlexTabs > 0 ? (barWidth - 64) / totalFlexTabs : 0;

  useEffect(() => {
    if (tabW === 0) return;
    let targetX = -200; // off-screen = home is active

    const leftIdx = left.findIndex(m => m.id === activeRoute);
    const rightIdx = right.findIndex(m => m.id === activeRoute);

    if (leftIdx >= 0) {
      targetX = leftIdx * tabW + tabW / 2 - 22;
    } else if (rightIdx >= 0) {
      targetX = left.length * tabW + 64 + rightIdx * tabW + tabW / 2 - 22;
    }
    // else home is active: targetX stays -200

    if (isInitialPill.current) {
      pillX.setValue(targetX);
      isInitialPill.current = false;
    } else {
      Animated.spring(pillX, {
        toValue: targetX,
        useNativeDriver: true,
        damping: 22,
        stiffness: 280,
      }).start();
    }
  }, [activeRoute, tabW]);

  // Daily wellness score rendered as a thin progress ring around the Home button
  const [homeScore, setHomeScore] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api.wellnessHistory(1)
      .then((res: any) => {
        if (!live) return;
        const last = res?.history?.[res.history.length - 1];
        setHomeScore(typeof last?.overall_score === 'number' ? last.overall_score : null);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [activeRoute === 'home']);

  useEffect(() => {
    AsyncStorage.getItem('ripple_home_pulsed').then((value) => {
      if (value === null) {
        Animated.sequence([
          Animated.spring(pulseAnim, { toValue: 1.08, useNativeDriver: true }),
          Animated.spring(pulseAnim, { toValue: 1.0, useNativeDriver: true }),
        ]).start(() => {
          AsyncStorage.setItem('ripple_home_pulsed', '1');
        });
      }
    });
  }, []);

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: theme.page,
          borderTopColor: theme.ink,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
      onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
    >
      {activeRoute !== 'home' && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 8,
            left: 0,
            width: 44,
            height: 38,
            borderRadius: 19,
            backgroundColor: theme.teal.tint,
            borderWidth: 1.5,
            borderColor: theme.teal.solid + '40',
            transform: [{ translateX: pillX }],
          }}
        />
      )}
      {left.map((mod) => (
        <NavIcon
          key={mod.id}
          def={mod.id === 'health'
            ? { ...mod, label: healthTabLabel(preferences.health), iconSlot: healthTabIconSlot(preferences.health) }
            : mod}
          active={activeRoute === mod.id}
          onPress={() => { Haptics.selectionAsync(); onNavigate(mod.id); }}
          theme={theme}
          showBadge={mod.id === 'health' && medicationDue}
        />
      ))}

      {/* Fixed-width center slot for the raised Home button */}
      <View style={styles.homeSlot}>
        {homeScore !== null && (
          <View pointerEvents="none" style={{ position: 'absolute', bottom: 1, left: -1, width: 66, height: 66 }}>
            <Svg width={66} height={66} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle
                cx={33} cy={33} r={31}
                stroke={scoreColor(homeScore, theme)}
                strokeWidth={2.5}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${(homeScore / 100) * 2 * Math.PI * 31} ${2 * Math.PI * 31}`}
              />
            </Svg>
          </View>
        )}
        <Pressable
          onPress={() => { Haptics.selectionAsync(); onNavigate('home'); }}
          onPressIn={() => Animated.spring(pulseAnim, { toValue: 0.88, useNativeDriver: true, damping: 12, stiffness: 500 }).start()}
          onPressOut={() => Animated.spring(pulseAnim, { toValue: 1.0, useNativeDriver: true, damping: 14, stiffness: 300 }).start()}
          style={[styles.homeButton, { borderColor: theme.ink, shadowColor: theme.ink }]}
          accessibilityRole="button"
          accessibilityLabel="Home"
        >
          <Animated.View style={{ flex: 1, transform: [{ scale: pulseAnim }] }}>
            {/* 4-quadrant Ripple icon */}
            <View style={{ flexDirection: 'row', height: 26 }}>
              <View style={{ flex: 1, backgroundColor: theme.teal.solid }} />
              <View style={{ flex: 1, backgroundColor: theme.coral.solid }} />
            </View>
            <View style={{ flexDirection: 'row', height: 26 }}>
              <View style={{ flex: 1, backgroundColor: theme.purple.solid }} />
              <View style={{ flex: 1, backgroundColor: theme.berry.solid }} />
            </View>
            <View style={styles.homeEmojiOverlay}>
              <ThemedIcon slot="tab.home" size={24} />
            </View>
          </Animated.View>
        </Pressable>
      </View>

      {right.map((mod) => (
        <NavIcon
          key={mod.id}
          def={mod.id === 'health'
            ? { ...mod, label: healthTabLabel(preferences.health), iconSlot: healthTabIconSlot(preferences.health) }
            : mod}
          active={activeRoute === mod.id}
          onPress={() => { Haptics.selectionAsync(); onNavigate(mod.id); }}
          theme={theme}
          showBadge={mod.id === 'health' && medicationDue}
        />
      ))}
    </View>
  );
}

function NavIcon({
  def,
  active,
  onPress,
  theme,
  showBadge = false,
}: {
  def: ModuleDefinition;
  active: boolean;
  onPress: () => void;
  theme: Theme;
  showBadge?: boolean;
}) {
  const dotAnim   = useRef(new Animated.Value(active ? 1 : 0)).current;
  const pressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(dotAnim, {
      toValue: active ? 1 : 0,
      useNativeDriver: true,
    }).start();
  }, [active]);

  const handlePressIn = () => {
    Animated.spring(pressAnim, {
      toValue: 0.78,
      useNativeDriver: true,
      damping: 12,
      stiffness: 500,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressAnim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 14,
      stiffness: 300,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.iconSlot}
      accessibilityRole="button"
      accessibilityLabel={def.label}
    >
      <Animated.View style={[styles.emojiWrap, { transform: [{ scale: pressAnim }] }]}>
        <ThemedIcon slot={def.iconSlot} size={24} inactive={!active} />
        {showBadge && (
          <View
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: theme.danger,
            }}
          />
        )}
      </Animated.View>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={[
          styles.label,
          { color: active ? theme.ink : theme.textSoft, fontWeight: active ? '700' : '400' },
        ]}
      >
        {def.label}
      </Text>
      {/* Active indicator dot — springs in/out */}
      <Animated.View
        style={[
          styles.activeDot,
          {
            backgroundColor: theme.teal.solid,
            transform: [{ scale: dotAnim }],
            opacity: dotAnim,
          },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingHorizontal: 4,
    borderTopWidth: 2,
  },
  iconSlot: {
    flex: 1,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 2,
  },
  emojiWrap: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: FONT_SIZES.caption,
    marginTop: 2,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginTop: 3,
  },
  homeSlot: {
    flexBasis: 64,
    flexGrow: 0,
    flexShrink: 0,
    height: 44,
    alignItems: 'center',
  },
  homeButton: {
    position: 'absolute',
    bottom: 6,
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 2.5,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 7,
  },
  homeEmojiOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
