// Social endpoints share the exact same BASE_URL + auth + error handling as the
// rest of the app by reusing the `request` helper exported from client.ts.
import { request as req } from "./client";

// ── Types ──────────────────────────────────────────────────────────────────────

export type SocialCategory = "steps" | "exercise" | "hobbies" | "books";

export interface Friend {
  connection_id: string;
  user_id: string;
  email: string;
  username: string | null;
  sharing: {
    steps: boolean;
    exercise: boolean;
    hobbies: boolean;
    books: boolean;
  };
}

export interface FriendRequest {
  connection_id: string;
  from_user_id: string;
  from_email: string;
  from_username: string | null;
  created_at: string;
}

export interface SentRequest {
  connection_id: string;
  to_user_id: string;
  to_email: string;
  to_username: string | null;
  created_at: string;
}

export interface SharingPrefs {
  steps: boolean;
  exercise: boolean;
  hobbies: boolean;
  books: boolean;
}

export interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  is_me: boolean;
  value: number;
  rank: number;
}

export interface Challenge {
  id: string;
  title: string;
  category: SocialCategory;
  goal_description: string;
  goal_value: number | null;
  start_date: string;
  end_date: string;
  participant_count: number;
  is_member: boolean;
  created_by: string;
}

export interface ChallengeParticipant {
  user_id: string;
  display_name: string;
  is_me: boolean;
  progress: number;
  rank: number;
}

export interface ChallengeDetail extends Challenge {
  participants: ChallengeParticipant[];
}

export interface SocialNotifPrefs {
  friend_request: boolean;
  friend_accepted: boolean;
  challenge_invite: boolean;
  challenge_update: boolean;
  leaderboard_milestone: boolean;
}

// ── API functions ─────────────────────────────────────────────────────────────

export function getFriends(): Promise<Friend[]> {
  return req("/friends");
}

export function getFriendRequests(): Promise<FriendRequest[]> {
  return req("/friends/requests");
}

export function getSentRequests(): Promise<SentRequest[]> {
  return req("/friends/sent");
}

export function sendFriendRequest(identifier: string): Promise<any> {
  return req("/friends/request", {
    method: "POST",
    body: JSON.stringify({ identifier }),
  });
}

export function acceptFriendRequest(connectionId: string): Promise<any> {
  return req("/friends/" + connectionId + "/accept", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function declineFriendRequest(connectionId: string): Promise<any> {
  return req("/friends/" + connectionId + "/decline", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getSharingPrefs(): Promise<SharingPrefs> {
  return req("/friends/sharing-prefs");
}

export function updateSharingPrefs(prefs: Partial<SharingPrefs>): Promise<SharingPrefs> {
  return req("/friends/sharing-prefs", {
    method: "PATCH",
    body: JSON.stringify(prefs),
  });
}

export function getLeaderboard(category: SocialCategory): Promise<LeaderboardEntry[]> {
  return req("/friends/leaderboard/" + category);
}

export function setUsername(username: string): Promise<any> {
  return req("/friends/username", {
    method: "PATCH",
    body: JSON.stringify({ username }),
  });
}

export function getChallenges(): Promise<Challenge[]> {
  return req("/challenges");
}

export function createChallenge(data: {
  title: string;
  category: SocialCategory;
  goal_description: string;
  goal_value?: number | null;
  start_date: string;
  end_date: string;
  invite_user_ids?: string[];
}): Promise<Challenge> {
  return req("/challenges", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getChallenge(id: string): Promise<ChallengeDetail> {
  return req("/challenges/" + id);
}

export function joinChallenge(id: string): Promise<any> {
  return req("/challenges/" + id + "/join", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function leaveChallenge(id: string): Promise<any> {
  return req("/challenges/" + id + "/leave", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function getSocialNotifPrefs(): Promise<SocialNotifPrefs> {
  return req("/social-notifications");
}

export function updateSocialNotifPrefs(
  prefs: Partial<SocialNotifPrefs>
): Promise<SocialNotifPrefs> {
  return req("/social-notifications", {
    method: "PATCH",
    body: JSON.stringify(prefs),
  });
}

// ── Activity feed ─────────────────────────────────────────────────────────────

export interface FeedMilestone {
  type: string;
  label: string;
  count: number;
}

export interface FeedEntry {
  user_id: string;
  display_name: string;
  milestones: FeedMilestone[];
}

export function getActivityFeed(): Promise<FeedEntry[]> {
  return req("/friends/activity-feed");
}

// ── Nudge ──────────────────────────────────────────────────────────────────────

export interface Nudge {
  sender_id: string;
  display_name: string;
  sent_at: string;
}

export function sendNudge(friendId: string): Promise<{ ok: boolean }> {
  return req("/friends/nudge/" + friendId, { method: "POST", body: JSON.stringify({}) });
}

export function getNudges(): Promise<Nudge[]> {
  return req("/friends/nudges");
}

// ── Cheers ────────────────────────────────────────────────────────────────────

export interface Cheer {
  sender_id: string;
  display_name: string;
  sent_at: string;
}

export function sendCheer(friendId: string): Promise<{ ok: boolean }> {
  return req("/friends/cheer/" + friendId, { method: "POST", body: JSON.stringify({}) });
}

export function getCheers(): Promise<Cheer[]> {
  return req("/friends/cheers");
}

export function getMyCheersToday(): Promise<string[]> {
  return req("/friends/my-cheers-sent");
}

// ── Reactions ─────────────────────────────────────────────────────────────────

export interface Reaction {
  from_user_id: string;
  to_user_id: string;
  emoji: string;
}

export function getReactions(category: SocialCategory, weekStart: string): Promise<Reaction[]> {
  return req("/friends/reactions?category=" + category + "&weekStart=" + weekStart);
}

export function addReaction(payload: {
  to_user_id: string;
  category: SocialCategory;
  emoji: string;
  week_start: string;
}): Promise<{ ok: boolean }> {
  return req("/friends/reactions", { method: "POST", body: JSON.stringify(payload) });
}
