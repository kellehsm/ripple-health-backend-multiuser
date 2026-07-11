import React from "react";
import { Pressable, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import { OverviewScreen } from "../screens/OverviewScreen";
import { HealthScreen } from "../screens/HealthScreen";
import { FinanceScreen } from "../screens/FinanceScreen";
import { LifeScreen } from "../screens/LifeScreen";
import { useTheme } from "../theme/ThemeContext";

const Tab = createBottomTabNavigator();

// Mirrors the four tabs from the approved mockup exactly - Overview,
// Health, Finance, Reading & Habits. Keep this list in sync if tabs change.
export function RootTabs() {
  const { theme, toggle, mode } = useTheme();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerRight: () => (
            <Pressable onPress={toggle} style={{ marginRight: 16 }}>
              <Ionicons name={mode === "light" ? "moon" : "sunny"} size={20} color={theme.textStrong} />
            </Pressable>
          ),
          headerStyle: { backgroundColor: theme.page },
          headerTitleStyle: { color: theme.textStrong },
          tabBarStyle: { backgroundColor: theme.page, borderTopColor: theme.cardBorder },
          tabBarActiveTintColor: theme.textStrong,
          tabBarInactiveTintColor: theme.textSoft,
          tabBarIcon: ({ color, size }) => {
            const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
              Overview: "grid",
              Health: "heart",
              Finance: "wallet",
              Life: "book",
            };
            return <Ionicons name={icons[route.name]} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="Overview" component={OverviewScreen} />
        <Tab.Screen name="Health" component={HealthScreen} />
        <Tab.Screen name="Finance" component={FinanceScreen} />
        <Tab.Screen name="Life" component={LifeScreen} options={{ title: "Reading & Habits" }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
