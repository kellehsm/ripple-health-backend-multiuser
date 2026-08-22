import React from "react";
import { View, Text, Pressable } from "react-native";
import { ShadowCard } from "../../components/ShadowCard";
import { ThemedIcon } from "../../theme/iconRegistry";

type Section = "breathing" | "grounding" | "meditation" | "gratitude" | "body_scan" | "sounds";

export function TileGrid({ theme, ink, onSelect, onQuickReset, todayDone }: {
  theme: any;
  ink: string;
  onSelect: (s: Section) => void;
  onQuickReset: () => void;
  todayDone: string[];
}) {
  const tiles: { section: Section; slot: string; title: string; desc: string; colorKey: string }[] = [
    { section: "breathing",  slot: "mindfulness.breathing",  title: "Breathing",   desc: "Box · 4-7-8 · coherent",  colorKey: "teal"   },
    { section: "grounding",  slot: "mindfulness.grounding",  title: "Grounding",   desc: "5-4-3-2-1 · PMR · STOP",  colorKey: "coral"  },
    { section: "meditation", slot: "mindfulness.meditation", title: "Meditation",  desc: "Bells · chimes · ambient", colorKey: "purple" },
    { section: "gratitude",  slot: "mindfulness.gratitude",  title: "Gratitude",   desc: "Prompts & journaling",     colorKey: "berry"  },
    { section: "body_scan",  slot: "mindfulness.body_scan",  title: "Body Scan",   desc: "Head-to-toe attention",    colorKey: "blue"   },
    { section: "sounds",     slot: "mindfulness.sounds",     title: "Soundscapes", desc: "Ambient sound · sleep",    colorKey: "amber"  },
  ];

  const tealSolid = (theme.teal as any)?.solid ?? ink;

  return (
    <>
      <Text style={{ color: theme.textSoft, fontSize: 13, lineHeight: 18 }}>
        Choose a practice to begin.
      </Text>

      <Pressable onPress={onQuickReset} accessibilityRole="button" accessibilityLabel="Two minute reset">
        <ShadowCard size="card" bg={tealSolid} accent={tealSolid} rotate={-0.3} skipTransparency>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
            <ThemedIcon slot="ui.lightning" size={28} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "900" }}>2-Minute Reset</Text>
              <Text style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 }}>
                A quick guided breathing break — starts right away
              </Text>
            </View>
            <Text style={{ color: "#fff", fontSize: 20 }}>›</Text>
          </View>
        </ShadowCard>
      </Pressable>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {tiles.map((t, idx) => {
          const c = theme[t.colorKey];
          const rotation = idx % 2 === 0 ? -0.5 : 0.5;
          const doneToday = todayDone.includes(t.section);
          return (
            <Pressable
              key={t.section}
              onPress={() => onSelect(t.section)}
              style={{ width: "47%" }}
              accessibilityRole="button"
              accessibilityLabel={t.title + (doneToday ? ", completed today" : "")}
            >
              <ShadowCard size="card" bg={c?.solid ?? ink} accent={c?.solid} rotate={rotation} padding={18} skipTransparency>
                <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                  <ThemedIcon slot={t.slot} size={32} style={{ marginBottom: 8 } as any} />
                  {doneToday && (
                    <View style={{ backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, flexDirection: "row", alignItems: "center", gap: 3 }}>
                      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: "#fff" }} />
                      <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>DONE</Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: "#fff", fontSize: 17, fontWeight: "900", marginBottom: 4 }}>{t.title}</Text>
                <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>{t.desc}</Text>
              </ShadowCard>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
