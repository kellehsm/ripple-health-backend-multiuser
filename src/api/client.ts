import { getToken } from "../lib/auth";
import { setNetworkOnline } from "../utils/networkState";
import { todayStr } from "../utils/dateUtils";
import { BASE_URL } from "./baseUrl";

export { BASE_URL } from "./baseUrl";

/**
 * Error thrown for non-2xx API responses. The message keeps the historical
 * "API error <status>: <body>" format so existing string matching still works,
 * but consumers should prefer `err instanceof ApiError && err.status === 401`.
 */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Abort hung requests so a dead connection can't stall login/startup forever.
const REQUEST_TIMEOUT_MS = 15000;

// Dedup identical GETs fired in the same window (e.g. two cards on one screen
// requesting the same endpoint) — they share a single network request.
const inflightGets = new Map<string, Promise<any>>();

// Water metric id never changes for a user — cache it for the session.
// Cleared on logout (lib/auth) so a different account can't reuse it.
let waterMetricCache: any = null;
export function clearWaterMetricCache(): void {
  waterMetricCache = null;
}

export async function request(path: string, options: RequestInit = {}): Promise<any> {
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET") return doRequest(path, options);
  const existing = inflightGets.get(path);
  if (existing) return existing;
  const p = doRequest(path, options).finally(() => inflightGets.delete(path));
  inflightGets.set(path, p);
  return p;
}

async function doRequest(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = "Bearer " + token;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(BASE_URL + path, { headers, signal: controller.signal, ...options });
    if (!res.ok) throw new ApiError(res.status, "API error " + res.status + ": " + (await res.text()));
    setNetworkOnline(true);
    return res.json();
  } catch (err) {
    const msg = (err as Error)?.message ?? "";
    if (
      (err as Error)?.name === "AbortError" ||
      msg.includes("Network request failed") ||
      msg.includes("Failed to fetch") ||
      (msg.includes("network") && !msg.includes("API error"))
    ) {
      setNetworkOnline(false);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function isNetworkOrServerError(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500;
  const msg = (err as Error)?.message ?? "";
  return (
    (err as Error)?.name === "AbortError" ||
    msg.includes("Network request failed") ||
    msg.includes("Failed to fetch") ||
    msg.includes("network") ||
    /API error 5\d\d/.test(msg)
  );
}

async function requestQueued(
  path: string,
  options: RequestInit,
  payload: Record<string, unknown>
): Promise<any> {
  try {
    return await request(path, options);
  } catch (err) {
    const { queueOfflineRequest, isQueueableEndpoint, getPendingQueueCount } = await import("../utils/syncQueue");
    if (isNetworkOrServerError(err) && isQueueableEndpoint(path)) {
      queueOfflineRequest(path, options.method as string, payload);
      const { setNetworkPending } = await import("../utils/networkState");
      setNetworkPending(getPendingQueueCount());
      return null;
    }
    throw err;
  }
}

// Returns BASE_URL with a short-lived, single-use download token appended —
// never embeds the long-lived JWT so it can't leak into logs, browser history,
// or referer headers. The backend mints the token via /api/download-token.
async function authedUrl(path: string): Promise<string> {
  const { token: dl } = await request("/download-token", { method: "POST" });
  const sep = path.includes("?") ? "&" : "?";
  return BASE_URL + path + sep + "dl=" + encodeURIComponent(dl);
}

export const GOOGLE_CLIENT_ID =
  "629396147708-a40h3rld7t1bjt1nsm097g010p2jaai9.apps.googleusercontent.com";

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  login: function (email: string, password: string) {
    return request("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  },
  signup: function (email: string, password: string, name?: string) {
    return request("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, ...(name ? { name } : {}) }),
    });
  },
  dexcomVerifyShare: function (params: { username?: string; account_id?: string; password: string; region?: string }) {
    return request("/dexcom/verify-share", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },
  me: function () {
    return request("/auth/me", { method: "POST", body: JSON.stringify({}) });
  },
  changePassword: function (current_password: string, new_password: string) {
    return request("/auth/change-password", { method: "POST", body: JSON.stringify({ current_password, new_password }) });
  },
  markOnboardingComplete: function () {
    return request("/auth/onboarding-complete", { method: "PATCH", body: JSON.stringify({}) });
  },

  // ── Summary ───────────────────────────────────────────────────────────────
  dashboard: function (date?: string) {
    return request("/dashboard" + (date ? "?date=" + date : ""));
  },
  today: function () {
    return request("/summary/today");
  },
  pattern: function (date?: string) {
    return request("/summary/pattern" + (date ? "?date=" + date : ""));
  },
  dayView: function (date: string) {
    return request("/summary/day?date=" + date);
  },
  weeklyDigest: function () {
    return request("/summary/weekly-digest");
  },
  whatChanged: function () {
    return request("/summary/what-changed");
  },
  whyMightThatBe: function (): Promise<{ notices: { text: string }[] }> {
    return request("/summary/why-might-that-be");
  },
  streaks: function () {
    return request("/summary/streaks");
  },
  dailySummary: function (date?: string) {
    const d = date ?? todayStr();
    return request("/summary/daily/" + d);
  },

  // ── Books ─────────────────────────────────────────────────────────────────
  books: function (status?: string) {
    return request("/books" + (status ? "?status=" + status : ""));
  },
  searchBooks: function (q: string) {
    return request("/books-search/search?q=" + encodeURIComponent(q));
  },
  createBook: function (payload: Record<string, unknown>) {
    return request("/books", { method: "POST", body: JSON.stringify(payload) });
  },
  logPages: function (bookId: string, pages_read: number) {
    return request("/books/" + bookId + "/logs", { method: "POST", body: JSON.stringify({ pages_read }) });
  },
  bookProgress: function (bookId: string) {
    return request("/books/" + bookId + "/progress");
  },
  updateBook: function (bookId: string, payload: Record<string, unknown>) {
    return request("/books/" + bookId, { method: "PATCH", body: JSON.stringify(payload) });
  },
  deleteBook: function (bookId: string) {
    return request("/books/" + bookId, { method: "DELETE" });
  },

  // ── Hobbies ───────────────────────────────────────────────────────────────
  hobbies: function (status?: string) {
    return request("/hobbies" + (status ? "?status=" + status : ""));
  },
  createHobby: function (payload: Record<string, unknown>) {
    return request("/hobbies", { method: "POST", body: JSON.stringify(payload) });
  },
  updateHobby: function (hobbyId: string, payload: Record<string, unknown>) {
    return request("/hobbies/" + hobbyId, { method: "PATCH", body: JSON.stringify(payload) });
  },
  logHobby: function (hobbyId: string, amount: number, rating?: number, note?: string) {
    return request("/hobbies/" + hobbyId + "/logs", { method: "POST", body: JSON.stringify({ amount, rating, note }) });
  },
  hobbyStats: function (hobbyId: string, weekStartDay?: number) {
    const qs = weekStartDay !== undefined ? "?week_start_day=" + weekStartDay : "";
    return request("/hobbies/" + hobbyId + "/stats" + qs);
  },
  deleteHobby: function (hobbyId: string) {
    return request("/hobbies/" + hobbyId, { method: "DELETE" });
  },
  getHobbyLogs: function (hobbyId: string) {
    return request("/hobbies/" + hobbyId + "/logs");
  },

  // ── Completed ─────────────────────────────────────────────────────────────
  completed: function () {
    return request("/completed");
  },

  // ── Glucose ───────────────────────────────────────────────────────────────
  glucoseToday: function (date: string) {
    return request("/glucose?date=" + date);
  },
  glucoseRange: function (start: string, end: string) {
    return request("/glucose?start=" + encodeURIComponent(start) + "&end=" + encodeURIComponent(end));
  },
  glucoseStatus: function () {
    return request("/glucose/status");
  },
  glucoseSyncShare: function () {
    return request("/glucose/sync-share", { method: "POST", body: JSON.stringify({}) });
  },

  // ── Food ──────────────────────────────────────────────────────────────────
  getPassioKey: function (): Promise<{ key?: string; error?: string }> {
    return request("/food/passio-key");
  },
  searchFood: function (q: string) {
    return request("/food/search?q=" + encodeURIComponent(q));
  },
  lookupBarcode: function (code: string, type?: "caffeine" | "alcohol") {
    return request("/food/barcode/" + code + (type ? "?type=" + type : ""));
  },
  saveBarcodeCorrection: function (
    barcode: string,
    correction: {
      name?: string | null;
      carbs_g?: number | null;
      calories?: number | null;
      sugar_g?: number | null;
      caffeine_mg?: number | null;
      abv_percent?: number | null;
      serving_size?: string | null;
    }
  ) {
    return request("/food/barcode/" + barcode + "/correction", {
      method: "POST",
      body: JSON.stringify(correction),
    });
  },

  // ── Meals ─────────────────────────────────────────────────────────────────
  meals: function (date: string) {
    return request("/meals?date=" + date);
  },
  addMeal: function (payload: Record<string, unknown>) {
    return requestQueued("/meals", { method: "POST", body: JSON.stringify(payload) }, payload);
  },
  updateMeal: function (mealId: string, payload: Record<string, unknown>) {
    return request("/meals/" + mealId, { method: "PATCH", body: JSON.stringify(payload) });
  },
  deleteMeal: function (mealId: string) {
    return request("/meals/" + mealId, { method: "DELETE" });
  },
  mealGlucoseResponse: function (mealId: string) {
    return request("/meals/" + mealId + "/glucose-response");
  },
  frequentMeals: function () {
    return request("/meals/frequent");
  },
  getMealImpactScores: function () {
    return request("/meals/impact-scores");
  },

  // ── Spending ──────────────────────────────────────────────────────────────
  spending: function (since?: string) {
    return request("/spending" + (since ? "?since=" + since : ""));
  },
  addSpending: function (payload: Record<string, unknown>) {
    return requestQueued("/spending", { method: "POST", body: JSON.stringify(payload) }, payload);
  },
  patchSpending: function (id: string, payload: { category?: string | null; notes?: string | null }) {
    return request("/spending/" + id, { method: "PATCH", body: JSON.stringify(payload) });
  },
  deleteSpending: function (id: string) {
    return request("/spending/" + id, { method: "DELETE" });
  },

  // ── Journal / Mood ────────────────────────────────────────────────────────
  logMood: function (mood_score: number, entry_text?: string) {
    const payload = { mood_score, entry_text };
    return requestQueued("/journal", { method: "POST", body: JSON.stringify(payload) }, payload);
  },
  upsertPeriodMood: function (mood_score: number, period: string, mood_label?: string, entry_text?: string, context?: Record<string, number>) {
    const payload = { mood_score, period, mood_label, entry_text, entry_type: "period", context: context ?? null };
    return requestQueued("/journal", { method: "POST", body: JSON.stringify(payload) }, payload);
  },
  logMoodMoment: function (mood_score: number, mood_label?: string, entry_text?: string) {
    const payload = { mood_score, mood_label, entry_text, entry_type: "moment" };
    return requestQueued("/journal", { method: "POST", body: JSON.stringify(payload) }, payload);
  },
  journalToday: function () {
    return request("/journal/today");
  },
  weeklyMoodSummary: function (days?: number) {
    const qs = days ? "?days=" + days : "";
    return request("/journal/weekly-summary" + qs);
  },

  // ── Health Connect ────────────────────────────────────────────────────────
  stepsToday: function (date: string) {
    return request("/health-connect/steps?date=" + date);
  },
  syncSteps: function (date: string, count: number) {
    return request("/health-connect/steps", { method: "POST", body: JSON.stringify({ date, count }) });
  },
  sleepToday: function (date: string) {
    return request("/health-connect/sleep?date=" + date);
  },
  sleepStats: function () {
    return request("/health-connect/sleep/stats");
  },
  sleepRange: function (start: string, end: string): Promise<{ sessions: Array<{
    id: string; start_time: string; end_time: string; quality_score: number | null;
    deep_ms: number | null; rem_ms: number | null; light_ms: number | null; awake_ms: number | null;
  }> }> {
    return request("/health-connect/sleep/range?start=" + encodeURIComponent(start) + "&end=" + encodeURIComponent(end));
  },
  syncSleep: function (sessions: Array<{
    start_time: string; end_time: string; quality_score: number | null;
    deep_ms?: number | null; rem_ms?: number | null; light_ms?: number | null; awake_ms?: number | null;
  }>) {
    return request("/health-connect/sleep", { method: "POST", body: JSON.stringify({ sessions }) });
  },
  syncHeartRate: function (readings: Array<{ recorded_at: string; bpm: number }>) {
    return request("/health-connect/heart-rate", { method: "POST", body: JSON.stringify({ readings }) });
  },

  // ── Metrics ───────────────────────────────────────────────────────────────
  getStepsMetric: function () {
    return request("/metrics?name=steps");
  },
  waterStats: function (metricId: string) {
    return request("/metrics/" + metricId + "/stats");
  },
  stepsWeeklyTotal: function (metricId: string, weekStartDay?: number) {
    const qs = weekStartDay !== undefined ? "?week_start_day=" + weekStartDay : "";
    return request("/metrics/" + metricId + "/weekly-total" + qs);
  },
  metricDailyBreakdown: function (metricId: string, weekStartDay: number, agg: string = "max") {
    return request("/metrics/" + metricId + "/daily-breakdown?week_start_day=" + weekStartDay + "&agg=" + agg);
  },
  metricMonthlyBreakdown: function (metricId: string, weekStartDay: number, agg: string = "max") {
    return request("/metrics/" + metricId + "/monthly-breakdown?week_start_day=" + weekStartDay + "&agg=" + agg);
  },
  getOrCreateWaterMetric: async function () {
    if (waterMetricCache) return waterMetricCache;
    const list = await request("/metrics?name=water");
    if (list && list.length > 0) {
      waterMetricCache = list[0];
      return list[0];
    }
    const created = await request("/metrics", {
      method: "POST",
      body: JSON.stringify({ name: "water", value_type: "number", unit: "glasses", icon: "water", color_key: "blue" }),
    });
    waterMetricCache = created;
    return created;
  },
  logWater: function (metricId: string) {
    const payload = { value: 1, logged_at: new Date().toISOString() };
    return requestQueued(
      "/metrics/" + metricId + "/logs",
      { method: "POST", body: JSON.stringify(payload) },
      payload
    );
  },
  todaysWaterCount: function (metricId: string) {
    return request("/metrics/" + metricId + "/logs");
  },

  // ── Heart Rate ────────────────────────────────────────────────────────────
  heartRateRange: function (start: string, end: string) {
    return request("/heart-rate?start=" + encodeURIComponent(start) + "&end=" + encodeURIComponent(end));
  },
  heartRateDaily: function (days: number = 7) {
    return request("/heart-rate/daily?days=" + days);
  },

  // ── Search ────────────────────────────────────────────────────────────────
  searchGlucose: function (params: { threshold?: number; bucket?: string; start?: string; end?: string } = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])));
    return request("/search/glucose?" + qs.toString());
  },
  searchMeals: function (params: { q?: string; min_carbs?: number; start?: string; end?: string } = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])));
    return request("/search/meals?" + qs.toString());
  },
  searchMood: function (params: { min_score?: number; max_score?: number; start?: string; end?: string } = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])));
    return request("/search/mood?" + qs.toString());
  },
  searchSpending: function (params: { min_amount?: number; category?: string; start?: string; end?: string } = {}) {
    const qs = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)])));
    return request("/search/spending?" + qs.toString());
  },
  searchGlobal: function (q: string) {
    return request("/search/global?q=" + encodeURIComponent(q));
  },

  // ── Export (URL-based, token appended as query param) ─────────────────────
  reportUrl: async function (start: string, end: string): Promise<string> {
    return authedUrl("/export/doctor-report?start=" + encodeURIComponent(start) + "&end=" + encodeURIComponent(end));
  },
  exportAllUrl: async function (): Promise<string> {
    return authedUrl("/export/all");
  },

  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings: function () {
    return request("/settings");
  },
  patchSettings: function (patch: Record<string, unknown>) {
    return request("/settings", { method: "PATCH", body: JSON.stringify(patch) });
  },

  // ── Google Drive ──────────────────────────────────────────────────────────
  getDriveStatus: function () {
    return request("/settings/google-drive/status");
  },
  triggerDriveBackup: function () {
    return request("/settings/google-drive/backup", { method: "POST", body: JSON.stringify({}) });
  },
  setDriveAutoBackup: function (enabled: boolean) {
    return request("/settings/google-drive/auto-backup", { method: "PATCH", body: JSON.stringify({ enabled }) });
  },
  disconnectDrive: function () {
    return request("/settings/google-drive/disconnect", { method: "POST", body: JSON.stringify({}) });
  },
  listDriveBackups: function () {
    return request("/settings/google-drive/list-backups");
  },
  restoreFromDrive: function (file_id: string) {
    return request("/settings/google-drive/restore", { method: "POST", body: JSON.stringify({ file_id }) });
  },

  // ── Substances ────────────────────────────────────────────────────────────
  searchSubstances: function (q: string, type: "caffeine" | "alcohol") {
    return request("/substances/search?query=" + encodeURIComponent(q) + "&type=" + type);
  },
  logSubstance: function (payload: Record<string, unknown>) {
    return requestQueued("/substances", { method: "POST", body: JSON.stringify(payload) }, payload);
  },
  substancesToday: function (date: string) {
    return request("/substances?date=" + date);
  },
  substancesSummary: function (start: string, end: string) {
    return request("/substances/summary?start=" + start + "&end=" + end);
  },
  deleteSubstance: function (id: string) {
    return request("/substances/" + id, { method: "DELETE" });
  },

  // ── Insights ──────────────────────────────────────────────────────────────
  getInsights: function () {
    return request("/insights");
  },
  getInsightHistory: function () {
    return request("/insights/history");
  },
  dismissInsight: function (id: string) {
    return request("/insights/" + id + "/dismiss", { method: "POST", body: JSON.stringify({}) });
  },
  snoozeInsight: function (id: string, days: number = 7) {
    return request("/insights/" + id + "/snooze", { method: "POST", body: JSON.stringify({ days }) });
  },
  undismissInsight: function (id: string) {
    return request("/insights/" + id + "/undismiss", { method: "POST", body: JSON.stringify({}) });
  },
  regenerateInsights: function () {
    return request("/insights/regenerate", { method: "POST", body: JSON.stringify({}) });
  },
  insightFeedback: function (id: string, rating: 'helpful' | 'neutral' | 'not_useful' | 'already_knew') {
    return request("/insights/" + id + "/feedback", { method: "POST", body: JSON.stringify({ rating }) });
  },
  insightTry: function (id: string): Promise<{ ok: boolean; experiment_id?: string; description?: string; reason?: string }> {
    return request("/insights/" + id + "/try", { method: "POST", body: JSON.stringify({}) });
  },
  insightPin: function (id: string, pinned: boolean) {
    return request("/insights/" + id + "/pin", { method: "POST", body: JSON.stringify({ pinned }) });
  },
  insightExplain: function (id: string): Promise<{ system_guidance: string; insight: any }> {
    return request("/insights/" + id + "/explain", { method: "POST", body: JSON.stringify({}) });
  },
  insightDebug: function (id: string) {
    return request("/insights/" + id + "/debug");
  },
  insightTimeline: function () {
    return request("/insights/timeline");
  },
  insightDigest: function (): Promise<{ top_insight: any | null; nudge: any | null }> {
    return request("/insights/digest");
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  contextCorrelation: function (key: string, compareTo: "mood" | "glucose", days?: number) {
    const qs = new URLSearchParams({ key, compare_to: compareTo, ...(days ? { days: String(days) } : {}) });
    return request("/analytics/context-correlation?" + qs.toString());
  },
  crossMetric: function () {
    return request("/analytics/cross-metric");
  },
  journey: function () {
    return request("/analytics/journey");
  },

  // ── Recipes ───────────────────────────────────────────────────────────────────
  recipes: function () {
    return request("/recipes");
  },
  createRecipe: function (payload: Record<string, unknown>) {
    return request("/recipes", { method: "POST", body: JSON.stringify(payload) });
  },
  updateRecipe: function (id: string, payload: Record<string, unknown>) {
    return request("/recipes/" + id, { method: "PATCH", body: JSON.stringify(payload) });
  },
  deleteRecipe: function (id: string) {
    return request("/recipes/" + id, { method: "DELETE" });
  },

  // ── Sync status ───────────────────────────────────────────────────────────────
  syncStatus: function () {
    return request("/settings/sync-status");
  },

  // ── Exercise ──────────────────────────────────────────────────────────────────
  searchExerciseLibrary: function (params: { search?: string; muscle?: string; equipment?: string; limit?: number } = {}) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]))
    );
    return request('/exercise/library?' + qs.toString());
  },
  getExerciseDetail: function (id: string) {
    return request('/exercise/library/' + id);
  },
  startExerciseSession: function () {
    return request('/exercise/sessions', { method: 'POST', body: '{}' });
  },
  listExerciseSessions: function (limit = 20, offset = 0) {
    return request(`/exercise/sessions?limit=${limit}&offset=${offset}`);
  },
  getExerciseSession: function (id: string) {
    return request('/exercise/sessions/' + id);
  },
  finishExerciseSession: function (id: string) {
    return request('/exercise/sessions/' + id, { method: 'PATCH', body: JSON.stringify({ ended_at: new Date().toISOString() }) });
  },
  addExerciseEntry: function (sessionId: string, payload: {
    exercise_id: string;
    sets?: number;
    reps?: number;
    duration_seconds?: number;
    weight_used?: number;
    target_rep_range_min?: number;
    target_rep_range_max?: number;
    actual_reps_per_set?: number[];
  }) {
    return request('/exercise/sessions/' + sessionId + '/entries', { method: 'POST', body: JSON.stringify(payload) });
  },
  deleteExerciseEntry: function (entryId: string) {
    return request('/exercise/log-entries/' + entryId, { method: 'DELETE' });
  },
  getExercisePreferences: function () {
    return request('/exercise/preferences');
  },
  getExerciseSuggestion: function () {
    return request('/exercise/suggestion');
  },
  getExerciseProgression: function (exerciseId: string) {
    return request('/exercise/progression/' + exerciseId);
  },

  // ── Workout wizard & programs ─────────────────────────────────────────────────
  getWorkoutWizardStatus: function () {
    return request('/exercise/wizard/status');
  },
  generateWorkoutPlan: function (answers: object) {
    return request('/exercise/wizard/generate', { method: 'POST', body: JSON.stringify(answers) });
  },
  acceptWorkoutPlan: function (payload: { answers: object; days: object[] }) {
    return request('/exercise/wizard/accept', { method: 'POST', body: JSON.stringify(payload) });
  },
  skipWorkoutWizard: function () {
    return request('/exercise/wizard/skip', { method: 'POST', body: '{}' });
  },
  listWorkoutPrograms: function () {
    return request('/exercise/programs');
  },
  deleteWorkoutProgram: function (id: string) {
    return request('/exercise/programs/' + id, { method: 'DELETE' });
  },
  patchWorkoutProgram: function (id: string, patch: { name?: string; is_active?: boolean }) {
    return request('/exercise/programs/' + id, { method: 'PATCH', body: JSON.stringify(patch) });
  },
  resetWorkoutWizard: function () {
    return request('/exercise/wizard/reset', { method: 'POST', body: '{}' });
  },
  createCustomWorkoutProgram: function (payload: {
    name: string;
    days: Array<{
      focus: string;
      exercises: Array<{ exercise_id: string; sets?: number; rep_range_min?: number; rep_range_max?: number }>;
    }>;
  }) {
    return request('/exercise/programs', { method: 'POST', body: JSON.stringify(payload) });
  },
  addProgramExercise: function (dayId: string, payload: { exercise_id: string; sets?: number; rep_range_min?: number; rep_range_max?: number }) {
    return request('/exercise/programs/days/' + dayId + '/exercises', { method: 'POST', body: JSON.stringify(payload) });
  },
  removeProgramExercise: function (id: string) {
    return request('/exercise/program-exercises/' + id, { method: 'DELETE' });
  },
  deleteExerciseSession: function (id: string) {
    return request('/exercise/sessions/' + id, { method: 'DELETE' });
  },

  // ── Medications ───────────────────────────────────────────────────────────────
  getMedications: function () {
    return request('/medications');
  },
  searchMedicationNames: function (q: string) {
    return request('/medications/search?q=' + encodeURIComponent(q));
  },
  addMedication: function (payload: object) {
    return request('/medications', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateMedication: function (id: string, payload: object) {
    return request('/medications/' + id, { method: 'PATCH', body: JSON.stringify(payload) });
  },
  deleteMedication: function (id: string) {
    return request('/medications/' + id, { method: 'DELETE' });
  },
  previewMedicationImport: function (fileBase64: string, filename: string) {
    return request('/medications/import/preview', { method: 'POST', body: JSON.stringify({ fileBase64, filename }) });
  },
  commitMedicationImport: function (rows: object[], mapping: Record<string, string | null>) {
    return request('/medications/import/commit', { method: 'POST', body: JSON.stringify({ rows, mapping }) });
  },
  getMedicationHistory: function (medicationId: string) {
    return request('/medications/' + medicationId + '/history');
  },
  getMedicationCategories: function () {
    return request('/medications/categories');
  },
  addMedicationCategory: function (payload: { label: string; color_hex: string }) {
    return request('/medications/categories', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateMedicationCategory: function (id: string, payload: object) {
    return request('/medications/categories/' + id, { method: 'PATCH', body: JSON.stringify(payload) });
  },
  deleteMedicationCategory: function (id: string) {
    return request('/medications/categories/' + id, { method: 'DELETE' });
  },
  getMedicationPrescribers: function () {
    return request('/medications/prescribers');
  },
  addMedicationPrescriber: function (payload: { name: string; specialty?: string; phone?: string }) {
    return request('/medications/prescribers', { method: 'POST', body: JSON.stringify(payload) });
  },
  updateMedicationPrescriber: function (id: string, payload: object) {
    return request('/medications/prescribers/' + id, { method: 'PATCH', body: JSON.stringify(payload) });
  },
  markSlotTaken: function (time_of_day: string, date?: string) {
    return request('/medication-doses/mark-slot', { method: 'POST', body: JSON.stringify({ time_of_day, date }) });
  },
  markSelectedTaken: function (slot_ids: string[], date?: string) {
    return request('/medication-doses/mark-selected', { method: 'POST', body: JSON.stringify({ slot_ids, date }) });
  },
  deleteDoseLog: function (id: string) {
    return request('/medication-doses/' + id, { method: 'DELETE' });
  },
  logPrnDose: function (medication_id: string) {
    return request('/medication-doses/prn', { method: 'POST', body: JSON.stringify({ medication_id }) });
  },
  getPrnSummary: function () {
    return request('/medication-doses/prn-summary');
  },
  getMedicationAdherence: function () {
    return request('/medications/adherence');
  },
  getMedicationDoseStats: function (medicationId: string) {
    return request('/medications/' + medicationId + '/dose-stats');
  },

  // ── Cycle ─────────────────────────────────────────────────────────────────────
  upsertCycleLog: function (payload: object) {
    return request('/cycle/logs', { method: 'POST', body: JSON.stringify(payload) });
  },
  getCycleLogs: function (from: string, to: string) {
    return request(`/cycle/logs?from=${from}&to=${to}`);
  },
  getCycleLog: function (date: string) {
    return request('/cycle/logs/' + date);
  },
  deleteCycleLog: function (date: string) {
    return request('/cycle/logs/' + date, { method: 'DELETE' });
  },
  getCyclePrediction: function () {
    return request('/cycle/prediction');
  },
  getCycleHistory: function () {
    return request('/cycle/history');
  },
  getRankedSymptoms: function () {
    return request('/cycle/symptoms/ranked');
  },
  addCustomSymptom: function (label: string) {
    return request('/cycle/symptoms/custom', { method: 'POST', body: JSON.stringify({ label }) });
  },
  getRankedMoods: function (q = '') {
    return request('/cycle/moods/ranked?q=' + encodeURIComponent(q));
  },
  getCyclePhasePatterns: function () {
    return request('/cycle/phase-patterns');
  },
  getCycleEnergyCurve: function () {
    return request('/cycle/energy-curve');
  },
  getHealthOverviewInsight: function () {
    return request('/cycle/overview-insight');
  },

  // Cycle instruction card
  getCycleInstructionCardStatus: function () {
    return request('/cycle/instruction-card');
  },
  dismissCycleInstructionCard: function () {
    return request('/cycle/instruction-card/dismiss', { method: 'POST', body: JSON.stringify({}) });
  },

  // Feature hints
  getHintStatus: function (hintKey: string) {
    return request('/hints/' + hintKey);
  },
  dismissHint: function (hintKey: string) {
    return request('/hints/' + hintKey + '/dismiss', { method: 'POST', body: JSON.stringify({}) });
  },

  // Medication RxNorm + openFDA
  triggerMedicationRxNorm: function (id: string) {
    return request('/medications/' + id + '/rxnorm', { method: 'POST', body: JSON.stringify({}) });
  },
  getMedicationRxNormByName: function (name: string) {
    return request('/medications/rxnorm-by-name?name=' + encodeURIComponent(name));
  },
  getMedicationLabel: function (id: string) {
    return request('/medications/' + id + '/label');
  },

  // ── Mindfulness ───────────────────────────────────────────────────────────────
  logMindfulness: function (payload: { type: string; duration_seconds?: number; mood_before?: number; mood_after?: number }) {
    return request('/mindfulness/log', { method: 'POST', body: JSON.stringify(payload) });
  },
  mindfulnessStats: function () {
    return request('/mindfulness/stats');
  },
  mindfulnessJournal: function () {
    return request('/mindfulness/journal');
  },

  // ── Media assets (admin-managed app content: soundscapes, chimes, images) ─────
  mediaList: function (kind?: string, category?: string) {
    const qs = new URLSearchParams();
    if (kind) qs.set('kind', kind);
    if (category) qs.set('category', category);
    const s = qs.toString();
    return request('/media' + (s ? '?' + s : ''));
  },
  mediaFileUrl: function (id: string) {
    return BASE_URL + '/media/file/' + id;
  },

  // ── Tab preferences ───────────────────────────────────────────────────────────
  getTabPreferences: function () {
    return request('/user/tab-preferences');
  },
  putTabPreferences: function (prefs: object) {
    return request('/user/tab-preferences', { method: 'PUT', body: JSON.stringify(prefs) });
  },

  // ── Chart annotations ─────────────────────────────────────────────────────────
  getAnnotations: function (start: string, end: string) {
    return request("/annotations?start=" + encodeURIComponent(start) + "&end=" + encodeURIComponent(end));
  },
  createAnnotation: function (annotated_at: string, label: string) {
    return request("/annotations", { method: "POST", body: JSON.stringify({ annotated_at, label }) });
  },
  deleteAnnotation: function (id: string) {
    return request("/annotations/" + id, { method: "DELETE" });
  },

  // ── Plaid ─────────────────────────────────────────────────────────────────────
  plaidCreateLinkToken: function () {
    return request("/plaid/create-link-token", { method: "POST", body: "{}" });
  },
  plaidExchangeToken: function (public_token: string, institution_id?: string, institution_name?: string) {
    return request("/plaid/exchange-token", {
      method: "POST",
      body: JSON.stringify({ public_token, institution_id, institution_name }),
    });
  },
  plaidGetAccounts: function () {
    return request("/plaid/accounts");
  },
  plaidSync: function () {
    return request("/plaid/sync", { method: "POST", body: "{}" });
  },
  plaidGetItems: function () {
    return request("/plaid/items");
  },
  plaidDeleteItem: function (itemId: string) {
    return request("/plaid/items/" + itemId, { method: "DELETE" });
  },
  submitErrorReport: function (message: string, context?: string, platform?: string) {
    return request("/errors", {
      method: "POST",
      body: JSON.stringify({ message, context, platform }),
    });
  },

  // ── Glucose TIR ───────────────────────────────────────────────────────────────
  getGlucoseTir: (date: string) => request(`/glucose/tir?date=${date}`),

  // ── Spending mood suggestion ───────────────────────────────────────────────────
  spendingMoodSuggest: () => request('/spending/mood-suggest'),
  tagSpending: (id: string, tag: string | null) => request(`/spending/${id}`, { method: 'PATCH', body: JSON.stringify({ tag }) }),

  // ── Experiments ───────────────────────────────────────────────────────────────
  getExperiments: () => request('/experiments'),
  getExperiment: (id: string) => request(`/experiments/${id}`),
  createExperiment: (body: { description: string; duration_days: number; metrics: string[] }) =>
    request('/experiments', { method: 'POST', body: JSON.stringify(body) }),
  getExperimentResults: (id: string) => request(`/experiments/${id}/results`),
  updateExperiment: (id: string, body: { status: string }) =>
    request(`/experiments/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // ── Hardcover.app book tracking integration ────────────────────────────────
  hardcoverStatus: (): Promise<{ connected: boolean; last_synced_at: string | null }> =>
    request(`/hardcover/status`),
  hardcoverConnect: (api_token: string): Promise<{ ok: boolean; username: string }> =>
    request(`/hardcover/connect`, { method: 'POST', body: JSON.stringify({ api_token }) }),
  hardcoverDisconnect: (): Promise<{ ok: boolean }> =>
    request(`/hardcover/disconnect`, { method: 'DELETE' }),
  hardcoverSync: (): Promise<{ books_checked: number; pushed: number; pulled: number; imported?: number; errors: number }> =>
    request(`/hardcover/sync`, { method: 'POST', body: JSON.stringify({}) }),
};
