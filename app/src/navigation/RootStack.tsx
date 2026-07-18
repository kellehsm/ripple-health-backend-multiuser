import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTheme } from "../theme/ThemeContext";
import { RootStackParamList } from "./types";

import { RootTabs } from "./RootTabs";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { AccountScreen } from "../screens/settings/AccountScreen";
import { AppearanceScreen } from "../screens/settings/AppearanceScreen";
import { NotificationsScreen } from "../screens/settings/NotificationsScreen";
import { IntegrationsScreen } from "../screens/settings/IntegrationsScreen";
import { DataBackupScreen } from "../screens/settings/DataBackupScreen";
import { PrivacySecurityScreen } from "../screens/settings/PrivacySecurityScreen";
import { HelpAboutScreen } from "../screens/settings/HelpAboutScreen";

export type { RootStackParamList };

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootStack() {
  const { theme } = useTheme();

  const headerStyle = {
    headerStyle: { backgroundColor: theme.page },
    headerTitleStyle: { color: theme.textStrong },
    headerTintColor: theme.teal.bar,
    headerShadowVisible: false,
  } as const;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={headerStyle}>
        <Stack.Screen name="Main" component={RootTabs} options={{ headerShown: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
        <Stack.Screen name="SettingsAccount" component={AccountScreen} options={{ title: "Account" }} />
        <Stack.Screen name="SettingsAppearance" component={AppearanceScreen} options={{ title: "Appearance" }} />
        <Stack.Screen name="SettingsNotifications" component={NotificationsScreen} options={{ title: "Notifications" }} />
        <Stack.Screen name="SettingsIntegrations" component={IntegrationsScreen} options={{ title: "Integrations" }} />
        <Stack.Screen name="SettingsDataBackup" component={DataBackupScreen} options={{ title: "Data & Backup" }} />
        <Stack.Screen name="SettingsPrivacySecurity" component={PrivacySecurityScreen} options={{ title: "Privacy & Security" }} />
        <Stack.Screen name="SettingsHelpAbout" component={HelpAboutScreen} options={{ title: "Help & About" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
