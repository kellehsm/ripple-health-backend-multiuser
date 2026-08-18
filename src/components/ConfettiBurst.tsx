import React, { useEffect, useRef } from "react";
import { View, Animated, Easing } from "react-native";

const COLORS = ["#3FA0A6", "#E8654E", "#7B3FBF", "#A62A50", "#E6B31E", "#4A90D9"];
const COUNT = 14;

type Particle = {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  rotate: Animated.Value;
  color: string;
  size: number;
};

/** Lightweight confetti burst. Re-fires whenever `burstKey` changes (> 0). */
export function ConfettiBurst({ burstKey }: { burstKey: number }) {
  const particles = useRef<Particle[]>(
    Array.from({ length: COUNT }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      rotate: new Animated.Value(0),
      color: COLORS[i % COLORS.length],
      size: 5 + (i % 3) * 2,
    }))
  ).current;

  useEffect(() => {
    if (burstKey <= 0) return;
    const anims = particles.map((p, i) => {
      const angle = (i / COUNT) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 40 + Math.random() * 50;
      p.x.setValue(0);
      p.y.setValue(0);
      p.opacity.setValue(1);
      p.rotate.setValue(0);
      return Animated.parallel([
        Animated.timing(p.x, { toValue: Math.cos(angle) * dist, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(p.y, { toValue: Math.sin(angle) * dist - 20, duration: 650, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: 650, delay: 200, useNativeDriver: true }),
        Animated.timing(p.rotate, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]);
    });
    Animated.parallel(anims).start();
  }, [burstKey]);

  if (burstKey <= 0) return null;

  return (
    <View pointerEvents="none" style={{ position: "absolute", top: "50%", left: "50%", width: 1, height: 1 }}>
      {particles.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: i % 2 === 0 ? p.size / 2 : 1,
            backgroundColor: p.color,
            opacity: p.opacity,
            transform: [
              { translateX: p.x },
              { translateY: p.y },
              { rotate: p.rotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "220deg"] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}
