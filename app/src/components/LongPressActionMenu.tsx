import React from 'react';
import { Alert, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

interface Action {
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

interface LongPressActionMenuProps {
  title: string;
  actions: Action[];
  onPress?: () => void;
  delayLongPress?: number;
  children: React.ReactNode;
}

export function LongPressActionMenu({
  title,
  actions,
  onPress,
  delayLongPress = 400,
  children,
}: LongPressActionMenuProps) {
  async function handleLongPress() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(title, undefined, [
      ...actions.map((a) => ({
        text: a.label,
        style: (a.destructive ? 'destructive' : 'default') as 'destructive' | 'default',
        onPress: a.onPress,
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  return (
    <Pressable onPress={onPress} onLongPress={handleLongPress} delayLongPress={delayLongPress}>
      {children}
    </Pressable>
  );
}
