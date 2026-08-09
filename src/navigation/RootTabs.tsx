import React from "react";
import { Pressable, View, Text, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator, BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { OverviewScreen } from "../screens/OverviewScreen";
import { HealthScreen } from "../screens/HealthScreen";
import { MealsScreen } from "../screens/MealsScreen";
import { FinanceScreen } from "../screens/FinanceScreen";
import { LifeScreen } from "../screens/LifeScreen";
import { HealthTabScreen } from "../screens/HealthTabScreen";
import { ExerciseScreen } from "../screens/ExerciseScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { StepsDetailScreen } from "../screens/StepsDetailScreen";
import { HeartRateDetailScreen } from "../screens/HeartRateDetailScreen";
import { TrendsScreen } from "../screens/TrendsScreen";
import { CompletedScreen } from "../screens/CompletedScreen";
import { InsightsScreen } from "../screens/InsightsScreen";
import { InsightsTrendsScreen } from "../screens/InsightsTrendsScreen";
import { MindfulnessScreen } from "../screens/MindfulnessScreen";
import { CustomizeDashboardScreen } from "../screens/CustomizeDashboardScreen";
import { GlobalSearchScreen } from "../screens/GlobalSearchScreen";
import { HelpScreen } from "../screens/HelpScreen";
import { TabPreferencesScreen } from "../screens/TabPreferencesScreen";
import { AppearanceSettingsScreen } from "../screens/settings/AppearanceSettingsScreen";
import { HealthConnectSettingsScreen } from "../screens/settings/HealthConnectSettingsScreen";
import { DexcomSettingsScreen } from "../screens/settings/DexcomSettingsScreen";
import { NotificationsSettingsScreen } from "../screens/settings/NotificationsSettingsScreen";
import { TrackingSettingsScreen } from "../screens/settings/TrackingSettingsScreen";
import { SecuritySettingsScreen } from "../screens/settings/SecuritySettingsScreen";
import { PreferencesSettingsScreen } from "../screens/settings/PreferencesSettingsScreen";
import { ExportBackupSettingsScreen } from "../screens/settings/ExportBackupSettingsScreen";
import { BanksSettingsScreen } from "../screens/settings/BanksSettingsScreen";
import { HardcoverSettingsScreen } from "../screens/settings/HardcoverSettingsScreen";
import { ExerciseSessionScreen } from "../screens/ExerciseSessionScreen";
import { ExerciseDetailScreen } from "../screens/ExerciseDetailScreen";
import { MedicationImportScreen } from "../screens/MedicationImportScreen";
import { MedicationHistoryScreen } from "../screens/MedicationHistoryScreen";
import { ExperimentScreen } from "../screens/ExperimentScreen";
import { OnboardingFlow } from "../screens/OnboardingFlow";
import { FriendsScreen } from "../screens/FriendsScreen";
import { FriendsOnboardingScreen } from "../screens/FriendsOnboardingScreen";
import { LeaderboardScreen } from "../screens/LeaderboardScreen";
import { ChallengesScreen } from "../screens/ChallengesScreen";
import { ChallengeDetailScreen } from "../screens/ChallengeDetailScreen";
import { NewChallengeScreen } from "../screens/NewChallengeScreen";
import { SocialSettingsScreen } from "../screens/settings/SocialSettingsScreen";
import { CardImageSplitterScreen } from "../screens/CardImageSplitterScreen";
import { MedicationRemindersScreen } from "../screens/settings/MedicationRemindersScreen";
import { BottomNav } from "../components/BottomNav";
import { useTabPreferences } from "../hooks/useTabPreferences";
import { useTheme } from "../theme/ThemeContext";
import { navigationRef } from "./navigationRef";
import { ModuleId } from "../types/tabPreferences";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function SettingsTitle({ title }: { title: string }) {
  const { theme } = useTheme();
  return (
    <View style={settingsHeaderStyles.container}>
      <Text style={[settingsHeaderStyles.breadcrumb, { color: theme.textSoft }]}>Settings ›</Text>
      <Text style={[settingsHeaderStyles.title, { color: theme.textStrong }]}>{title}</Text>
    </View>
  );
}

const settingsHeaderStyles = StyleSheet.create({
  container: { alignItems: "flex-start" },
  breadcrumb: { fontSize: 10, fontWeight: "700", letterSpacing: 0.4, lineHeight: 13 },
  title: { fontSize: 18, fontWeight: "800", lineHeight: 22 },
});

// Map module IDs ↔ tab route names
const MODULE_TO_ROUTE: Record<ModuleId | 'home', string> = {
  wellness: 'Wellness',
  meals: 'Meals',
  health: 'Health',
  exercise: 'Exercise',
  hobbies: 'Life',
  finance: 'Finance',
  home: 'Home',
};

const ROUTE_TO_MODULE: Record<string, ModuleId | 'home'> = {
  Wellness: 'wellness',
  Meals: 'meals',
  Health: 'health',
  Exercise: 'exercise',
  Life: 'hobbies',
  Finance: 'finance',
  Home: 'home',
};

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const { preferences } = useTabPreferences();
  const activeRouteName = state.routes[state.index]?.name ?? 'Home';
  const activeModule = ROUTE_TO_MODULE[activeRouteName] ?? 'home';

  return (
    <BottomNav
      preferences={preferences}
      activeRoute={activeModule}
      onNavigate={(module) => {
        Haptics.selectionAsync();
        const routeName = MODULE_TO_ROUTE[module];
        navigation.navigate(routeName);
      }}
      medicationDue={false}
    />
  );
}

function TabNavigator() {
  const { theme } = useTheme();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <CustomTabBar {...props} />}
      // NOTE: createBottomTabNavigator does not support swipe-between-tabs or
      // fade crossfade transitions natively. To enable swipe + animated crossfade,
      // this would need to be migrated to createMaterialTopTabNavigator (rendered
      // at the bottom via tabBarPosition="bottom") or a gesture-based custom navigator.
      // lazy: false pre-loads all tab screens so switching feels instant.
      screenOptions={({ route, navigation }) => {
        const accentMap: Record<string, string> = {
          Wellness: theme.teal.tint,
          Meals:    theme.coral.tint,
          Health:   theme.amber.tint,
          Exercise: theme.berry.tint,
          Life:     theme.violet.tint,
          Finance:  theme.violet.tint,
          Home:     theme.page,
        };
        const headerBg = accentMap[route.name] ?? theme.page;
        return ({
        lazy: false,
        animation: 'fade' as const,
        animationDuration: 100,
        tabBarHideOnKeyboard: true,
        headerStyle: { backgroundColor: headerBg },
        headerTitleStyle: { color: theme.textStrong, fontWeight: "800" as const, fontSize: 19 },
        headerRight: () => (
          <View
            style={{
              flexDirection: "row",
              marginRight: 12,
              borderWidth: 2,
              borderColor: theme.ink,
              borderRadius: 12,
              backgroundColor: theme.card,
              shadowColor: "rgba(60,40,20,0.12)",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.12,
              shadowRadius: 14,
              elevation: 4,
            }}
          >
            {([
              { emoji: "💡", label: "INSIGHT", screen: "InsightsTrends", params: { tab: "insights" } },
              { emoji: "👥", label: "FRIENDS", screen: "Friends", params: undefined },
              { emoji: "🔍", label: "SEARCH", screen: "GlobalSearch", params: undefined },
              { emoji: "⚙️", label: "SETTINGS", screen: "Settings", params: undefined },
            ] as const).map((btn, i) => (
              <React.Fragment key={btn.label}>
                {i > 0 && <View style={{ width: 2, backgroundColor: theme.ink }} />}
                <Pressable
                  onPress={() => (navigation as any).getParent()?.navigate(btn.screen, btn.params)}
                  style={{ alignItems: "center", justifyContent: "center", paddingHorizontal: 10, paddingVertical: 6 }}
                >
                  <Text style={{ fontSize: 18 }}>{btn.emoji}</Text>
                  <Text style={{ fontSize: 8, fontWeight: "700", letterSpacing: 0.5, color: theme.ink, marginTop: 2 }}>
                    {btn.label}
                  </Text>
                </Pressable>
              </React.Fragment>
            ))}
          </View>
        ),
      });}}
    >
      <Tab.Screen name="Wellness" component={HealthScreen} />
      <Tab.Screen name="Meals" component={MealsScreen} />
      <Tab.Screen name="Health" component={HealthTabScreen} />
      <Tab.Screen name="Exercise" component={ExerciseScreen} />
      <Tab.Screen name="Home" component={OverviewScreen} />
      <Tab.Screen name="Life" component={LifeScreen} options={{ title: "Hobbies" }} />
      <Tab.Screen name="Finance" component={FinanceScreen} />
    </Tab.Navigator>
  );
}

interface RootTabsProps {
  onNavigationStateChange?: () => void;
}

export function RootTabs({ onNavigationStateChange }: RootTabsProps) {
  const { theme } = useTheme();

  return (
    <NavigationContainer ref={navigationRef} onStateChange={onNavigationStateChange}>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.page },
          headerTitleStyle: { color: theme.textStrong, fontWeight: "800", fontSize: 19 },
          headerTintColor: theme.textStrong,
        }}
      >
        <Stack.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: "History" }} />
        <Stack.Screen name="StepsDetail" component={StepsDetailScreen} options={{ title: "Steps" }} />
        <Stack.Screen name="HeartRateDetail" component={HeartRateDetailScreen} options={{ title: "Heart Rate" }} />
        <Stack.Screen name="InsightsTrends" component={InsightsTrendsScreen} options={{ title: "Insights & Trends" }} />
        <Stack.Screen name="Trends" component={TrendsScreen} options={{ title: "Trends" }} />
        <Stack.Screen name="Completed" component={CompletedScreen} options={{ title: "My Bookshelf" }} />
        <Stack.Screen name="Insights" component={InsightsScreen} options={{ title: "Insights" }} />
        <Stack.Screen name="Mindfulness" component={MindfulnessScreen} options={{ title: "Mindfulness" }} />
        <Stack.Screen name="CustomizeDashboard" component={CustomizeDashboardScreen} options={{ title: "Customize Dashboard" }} />
        <Stack.Screen name="GlobalSearch" component={GlobalSearchScreen} options={{ title: "Search" }} />
        <Stack.Screen name="Help" component={HelpScreen} options={{ title: "Help & FAQ" }} />
        <Stack.Screen name="SettingsAppearance" component={AppearanceSettingsScreen} options={{ headerTitle: () => <SettingsTitle title="Appearance" /> }} />
        <Stack.Screen name="CardImageSplitter" component={CardImageSplitterScreen} options={{ headerTitle: () => <SettingsTitle title="Dashboard Image Split" /> }} />
        <Stack.Screen name="SettingsHealthConnect" component={HealthConnectSettingsScreen} options={{ headerTitle: () => <SettingsTitle title="Health Connect" /> }} />
        <Stack.Screen name="SettingsDexcom" component={DexcomSettingsScreen} options={{ headerTitle: () => <SettingsTitle title="Dexcom" /> }} />
        <Stack.Screen name="SettingsNotifications" component={NotificationsSettingsScreen} options={{ headerTitle: () => <SettingsTitle title="Notifications" /> }} />
        <Stack.Screen name="SettingsTracking" component={TrackingSettingsScreen} options={{ headerTitle: () => <SettingsTitle title="Always-on Tracking" /> }} />
        <Stack.Screen name="SettingsSecurity" component={SecuritySettingsScreen} options={{ headerTitle: () => <SettingsTitle title="App Lock" /> }} />
        <Stack.Screen name="SettingsPreferences" component={PreferencesSettingsScreen} options={{ headerTitle: () => <SettingsTitle title="Preferences" /> }} />
        <Stack.Screen name="SettingsExportBackup" component={ExportBackupSettingsScreen} options={{ headerTitle: () => <SettingsTitle title="Export & Backup" /> }} />
        <Stack.Screen name="SettingsBanks" component={BanksSettingsScreen} options={{ headerTitle: () => <SettingsTitle title="Connected Banks" /> }} />
        <Stack.Screen name="SettingsHardcover" component={HardcoverSettingsScreen} options={{ headerTitle: () => <SettingsTitle title="Hardcover" /> }} />
        <Stack.Screen name="ExerciseSession" component={ExerciseSessionScreen} options={{ title: "Workout Session" }} />
        <Stack.Screen name="ExerciseDetail" component={ExerciseDetailScreen} options={{ title: "Session Details" }} />
        <Stack.Screen name="MedicationReminders" component={MedicationRemindersScreen} options={{ headerTitle: () => <SettingsTitle title="Medication Reminders" /> }} />
        <Stack.Screen name="MedicationImport" component={MedicationImportScreen} options={{ title: "Import Medications" }} />
        <Stack.Screen name="MedicationHistory" component={MedicationHistoryScreen} options={({ route }: any) => ({ title: route.params?.medicationName ?? "Medication History" })} />
        <Stack.Screen name="Experiments" component={ExperimentScreen} options={{ title: "Experiments" }} />
        <Stack.Screen name="Friends" component={FriendsScreen} options={{ title: "Friends" }} />
        <Stack.Screen name="FriendsOnboarding" component={FriendsOnboardingScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={({ route }: any) => ({ title: (route.params?.category ?? "Leaderboard").charAt(0).toUpperCase() + (route.params?.category ?? "leaderboard").slice(1) + " Leaderboard" })} />
        <Stack.Screen name="Challenges" component={ChallengesScreen} options={{ title: "Challenges" }} />
        <Stack.Screen name="ChallengeDetail" component={ChallengeDetailScreen} options={{ title: "Challenge" }} />
        <Stack.Screen name="NewChallenge" component={NewChallengeScreen} options={{ title: "New Challenge" }} />
        <Stack.Screen name="SettingsSocial" component={SocialSettingsScreen} options={{ headerTitle: () => <SettingsTitle title="Friend Sharing" /> }} />
        <Stack.Screen name="SettingsCustomizeTabs" options={{ headerTitle: () => <SettingsTitle title="Customize Tabs" /> }}>
          {({ navigation }) => (
            <TabPreferencesScreen
              mode="settings"
              onDone={() => navigation.goBack()}
              onCancel={() => navigation.goBack()}
            />
          )}
        </Stack.Screen>
        <Stack.Screen
          name="OnboardingReplay"
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        >
          {({ navigation }) => (
            <OnboardingFlow replayMode onComplete={() => navigation.goBack()} />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
