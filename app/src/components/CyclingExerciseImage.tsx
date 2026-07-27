import React, { useEffect, useState } from 'react';
import { Image, View, StyleProp, ImageStyle } from 'react-native';

export const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

export function CyclingImage({ images, style }: { images: string[]; style: StyleProp<ImageStyle> }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (images.length <= 1) return;
    const t = setInterval(() => setIdx(i => (i + 1) % images.length), 2000);
    return () => clearInterval(t);
  }, [images.length]);
  if (!images.length) {
    return <View style={[style, { backgroundColor: '#D8F5EB', opacity: 0.5 }]} />;
  }
  return <Image source={{ uri: IMAGE_BASE + images[idx] }} style={style} resizeMode="cover" />;
}
