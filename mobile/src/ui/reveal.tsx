import React, {useEffect, useRef, useState} from 'react';
import {Animated, View, type DimensionValue, type StyleProp, type ViewStyle} from 'react-native';
import {easeOut, motion} from '@/ui/motion';

/** Entrada: sobe, cresce e aparece. */
export function Reveal({
  delay = 0,
  play = 0,
  children,
  style,
}: {
  delay?: number;
  play?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  const scale = useRef(new Animated.Value(0.98)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(16);
    scale.setValue(0.98);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: motion.enter,
        delay,
        easing: easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: motion.enter,
        delay,
        easing: easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: motion.enter,
        delay,
        easing: easeOut,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, play, scale, translateY]);

  return (
    <Animated.View style={[style, {opacity, transform: [{translateY}, {scale}]}]}>
      {children}
    </Animated.View>
  );
}

/** 0 → 1 para desenhar anel, barra e linha. */
export function useDraw(delay = 0, duration = 900, play = 0) {
  const [progress, setProgress] = useState(0);
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    value.setValue(0);
    const sub = value.addListener(({value: next}) => setProgress(next));
    Animated.timing(value, {
      toValue: 1,
      duration,
      delay,
      easing: easeOut,
      useNativeDriver: false,
    }).start();
    return () => value.removeListener(sub);
  }, [delay, duration, play, value]);

  return progress;
}

/** Barra que cresce da esquerda até a largura final. */
export function GrowBar({
  ratio,
  color,
  delay = 0,
  height = 4,
  play = 0,
}: {
  ratio: number;
  color: string;
  delay?: number;
  height?: number;
  play?: number;
}) {
  const progress = useDraw(delay, 880, play);
  const target = Math.max(0, Math.min(1, ratio));
  const width = `${Math.round(progress * target * 100)}%`;

  return (
    <View
      style={{
        width: width as DimensionValue,
        height,
        borderRadius: height,
        backgroundColor: color,
      }}
    />
  );
}

