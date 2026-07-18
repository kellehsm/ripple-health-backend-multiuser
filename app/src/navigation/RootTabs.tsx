import React from "react";
import { Pressable, Text, View } from "react-native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { OverviewScreen } from "../screens/OverviewScreen";
import { HealthScreen } from "../screens/HealthScreen";
import { FinanceScreen } from "../screens/FinanceScreen";
import { LifeScreen } from "../screens/LifeScreen";
import { MealsScreen } from "../screens/MealsScreen";
import { useTheme } from "../theme/ThemeContext";
import { RootStackParamList } from "./types";

const Tab = createBottomTabNavigator();

const TAB_HEIGHT = 58;
const CIRCLE_SIZE = 52;
const LIFT = 18;

type TabConfig = {
  icon: keyof typeof Ionicons.glyphMap;
  tint: (theme: ReturnType<typeof useTheme>["theme"]) => string;
  label: string;
  isCenter?: boolean;
};

const TAB_CONFIGS: Record<string, TabConfig> = {
  Health:  { icon: "heart",      tint: (t) => t.red.sub,   label: "Health" },
  Meals:   { icon: "restaurant", tint: (t) => t.amber.sub, label: "Meals" },
  Home:    { icon: "home",       tint: () => "#ffffff",     label: "Home", isCenter: true },
  Life:    { icon: "book",       tint: (t) => t.teal.sub,  label: "Life" },
  Finance: { icon: "wallet",     tint: (t) => t.brown.sub, label: "Finance" },
};

function CustomTabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { theme, toggle, mode } = useTheme();

  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: theme.page,
        borderTopWidth: 0.5,
        borderTopColor: theme.cardBorder,
        height: TAB_HEIGHT + insets.bottom,
        paddingBottom: insets.bottom,
        overflow: "visible",
      }}
    >
      {state.routes.map((route, index) => {
        const cfg = TAB_CONFIGS[route.name] ?? { icon: "ellipse" as const, tint: () => "#888", label: route.name };
        const isFocused = state.index === index;
        const isCenter = !!cfg.isCenter;
        const isLast = index === state.routes.length - 1;
        const iconColor = isCenter ? "#ffffff" : isFocused ? cfg.tint(theme) : theme.textSoft;

        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <React.Fragment key={route.key}>
            <Pressable
              onPress={onPress}
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: isCenter ? "flex-start" : "center",
                overflow: "visible",
              }}
            >
              {isCenter ? (
                <View
                  style={{
                    width: CIRCLE_SIZE,
                    height: CIRCLE_SIZE,
                    borderRadius: CIRCLE_SIZE / 2,
                    backgroundColor: theme.teal.bar,
                    alignItems: "center",
                    justifyContent: "center",
                    marginTop: -LIFT,
                    elevation: 6,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: -2 },
                    shadowOpacity: 0.18,
                    shadowRadius: 5,
                  }}
                >
                  <Ionicons name="home" size={26} color="#ffffff" />
                </View>
              ) : (
                <>
                  <Ionicons name={cfg.icon} size={22} color={iconColor} />
                  <Text style={{ fontSize: 10, color: iconColor, marginTop: 3 }}>{cfg.label}</Text>
                </>
              )}
            </Pressable>

            {!isLast && (
              <View style={{ width: 0.5, backgroundColor: theme.cardBorder, alignSelf: "stretch" }} />
            )}
          </React.Fragment>
        );
      })}

      {/* Dark-mode toggle lives in the top-right corner of the tab bar area */}
      <Pressable
        onPress={toggle}
        style={{ position: "absolute", right: 12, top: 8 }}
      >
        <Ionicons name={mode === "light" ? "moon" : "sunny"} size={18} color={theme.textSoft} />
      </Pressable>
    </View>
  );
}

function SettingsHeaderButton() {
  const { theme } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  return (
    <Pressable onPress={() => navigation.navigate("Settings")} style={{ marginRight: 4 }}>
      <Ionicons name="settings-outline" size={20} color={theme.textSoft} />
    </Pressable>
  );
}

export function RootTabs() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerStyle: { backgroundColor: theme.page },
        headerTitleStyle: { color: theme.textStrong },
        headerShadowVisible: false,
      }}
    >
      <Tab.Screen name="Health" component={HealthScreen} />
      <Tab.Screen name="Meals" component={MealsScreen} />
      <Tab.Screen
        name="Home"
        component={OverviewScreen}
        options={{ headerRight: () => <SettingsHeaderButton /> }}
      />
      <Tab.Screen name="Life" component={LifeScreen} options={{ title: "Reading & Habits" }} />
      <Tab.Screen name="Finance" component={FinanceScreen} />
    </Tab.Navigator>
  );
}
