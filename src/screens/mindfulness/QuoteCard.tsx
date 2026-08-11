import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";

const FALLBACK_QUOTES: { q: string; a: string }[] = [
  { q: "You should sit in meditation for twenty minutes every day — unless you're too busy; then you should sit for an hour.", a: "Zen proverb" },
  { q: "Feelings come and go like clouds in a windy sky. Conscious breathing is my anchor.", a: "Thich Nhat Hanh" },
  { q: "The present moment is the only time over which we have dominion.", a: "Thich Nhat Hanh" },
  { q: "Wherever you are, be there totally.", a: "Eckhart Tolle" },
  { q: "You can't stop the waves, but you can learn to surf.", a: "Jon Kabat-Zinn" },
  { q: "Almost everything will work again if you unplug it for a few minutes, including you.", a: "Anne Lamott" },
  { q: "Nothing can bring you peace but yourself.", a: "Ralph Waldo Emerson" },
  { q: "Between stimulus and response there is a space. In that space is our power to choose our response.", a: "Viktor Frankl" },
  { q: "Be where you are, otherwise you will miss your life.", a: "Buddha" },
  { q: "The quieter you become, the more you can hear.", a: "Ram Dass" },
  { q: "Breath is the bridge which connects life to consciousness.", a: "Thich Nhat Hanh" },
  { q: "Within you there is a stillness and a sanctuary to which you can retreat at any time.", a: "Hermann Hesse" },
  { q: "Each morning we are born again. What we do today is what matters most.", a: "Buddha" },
  { q: "Peace comes from within. Do not seek it without.", a: "Buddha" },
];

function dayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  return Math.floor((now.getTime() - start.getTime()) / 86400000);
}

export function QuoteCard({ theme }: { theme: any }) {
  const fallback = FALLBACK_QUOTES[dayOfYear() % FALLBACK_QUOTES.length];
  const [quote, setQuote] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    fetch("https://zenquotes.io/api/today", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data) && data[0]?.q && data[0]?.a) {
          setQuote({ q: data[0].q, a: data[0].a });
        }
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => { cancelled = true; controller.abort(); };
  }, []);

  const violet = (theme.purple as any) ?? {};

  return (
    <View style={{
      borderRadius: 18, borderWidth: 1.5,
      borderColor: violet.solid ? violet.solid + "55" : "rgba(150,150,150,0.3)",
      backgroundColor: violet.tint ?? theme.card,
      paddingVertical: 12, paddingHorizontal: 16,
    }}>
      <Text style={{ color: violet.fg ?? theme.textStrong, fontSize: 13, lineHeight: 19, fontStyle: "italic" }}>
        “{quote.q}”
      </Text>
      <Text style={{ color: violet.sub ?? theme.textSoft, fontSize: 11, marginTop: 6, textAlign: "right", fontWeight: "700" }}>
        — {quote.a}
      </Text>
    </View>
  );
}
