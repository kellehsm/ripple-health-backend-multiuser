export type ModuleId =
  | 'wellness'
  | 'meals'
  | 'health'
  | 'exercise'
  | 'hobbies'
  | 'finance';

export interface ModuleDefinition {
  id: ModuleId;
  label: string;
  /** Icon registry slot ID, e.g. "tab.wellness" */
  iconSlot: string;
}

export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  { id: 'wellness', label: 'Wellness', iconSlot: 'tab.wellness' },
  { id: 'meals',    label: 'Meals',    iconSlot: 'tab.meals'    },
  { id: 'health',   label: 'Med/Cycle',iconSlot: 'tab.health_both' },
  { id: 'exercise', label: 'Exercise', iconSlot: 'tab.exercise' },
  { id: 'hobbies',  label: 'Hobbies',  iconSlot: 'tab.hobbies'  },
  { id: 'finance',  label: 'Finance',  iconSlot: 'tab.finance'  },
];
// Friends is accessed from the top header bar, not the bottom tab bar.

export const HOME_MODULE = {
  id: 'home' as const,
  label: 'Home',
  iconSlot: 'tab.home',
} as const;

export interface HealthSubPreferences {
  medication: boolean;
  cycle: boolean;
}

export interface TabPreferences {
  selectedModules: ModuleId[];
  health: HealthSubPreferences;
}

/** Hard cap: 6 modules + Home = 7 icons total. */
export const MAX_SELECTED_MODULES = 6;

export const DEFAULT_TAB_PREFERENCES: TabPreferences = {
  selectedModules: ['wellness', 'meals', 'hobbies', 'finance'],
  health: { medication: false, cycle: false },
};
