export interface MoodDef {
  label: string;
  emoji: string;
}

export interface MoodCategory {
  label: string;
  colorKey: string;
  score: number;
  moods: MoodDef[];
}

export const MOOD_CATEGORIES: MoodCategory[] = [
  {
    label: "Happy",
    colorKey: "violet",
    score: 5,
    moods: [
      { label: "Joyful",     emoji: "😄" },
      { label: "Grateful",   emoji: "🙏" },
      { label: "Excited",    emoji: "🤩" },
      { label: "Content",    emoji: "😌" },
      { label: "Proud",      emoji: "💪" },
      { label: "Playful",    emoji: "😜" },
      { label: "Inspired",   emoji: "✨" },
      { label: "Optimistic", emoji: "🌈" },
    ],
  },
  {
    label: "Calm",
    colorKey: "teal",
    score: 4,
    moods: [
      { label: "Relaxed",    emoji: "😊" },
      { label: "Peaceful",   emoji: "☮️" },
      { label: "Focused",    emoji: "🎯" },
      { label: "Hopeful",    emoji: "🌟" },
      { label: "Refreshed",  emoji: "🌿" },
      { label: "Grounded",   emoji: "🧘" },
      { label: "Confident",  emoji: "😎" },
      { label: "Mindful",    emoji: "🍃" },
    ],
  },
  {
    label: "Okay",
    colorKey: "blue",
    score: 3,
    moods: [
      { label: "Okay",       emoji: "😐" },
      { label: "Tired",      emoji: "😴" },
      { label: "Distracted", emoji: "😶" },
      { label: "Bored",      emoji: "😑" },
      { label: "Meh",        emoji: "🤷" },
      { label: "Numb",       emoji: "😶‍🌫️" },
      { label: "Uncertain",  emoji: "🤔" },
      { label: "Restless",   emoji: "😬" },
    ],
  },
  {
    label: "Sad",
    colorKey: "coral",
    score: 2,
    moods: [
      { label: "Melancholy",   emoji: "😢" },
      { label: "Lonely",       emoji: "😞" },
      { label: "Disappointed", emoji: "😔" },
      { label: "Drained",      emoji: "🥱" },
      { label: "Grieving",     emoji: "💔" },
      { label: "Nostalgic",    emoji: "🌧️" },
      { label: "Hurt",         emoji: "🥺" },
      { label: "Defeated",     emoji: "😩" },
    ],
  },
  {
    label: "Stressed",
    colorKey: "red",
    score: 1,
    moods: [
      { label: "Frustrated",  emoji: "😤" },
      { label: "Overwhelmed", emoji: "😫" },
      { label: "Anxious",     emoji: "😰" },
      { label: "Irritated",   emoji: "😠" },
      { label: "Stressed",    emoji: "😣" },
      { label: "Angry",       emoji: "🤬" },
      { label: "Panicked",    emoji: "😱" },
      { label: "Burnt out",   emoji: "🔥" },
    ],
  },
];
