import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, View, type StyleProp, type ViewStyle} from 'react-native';

/** Entrada: sobe, cresce e aparece. */
export function Reveal({
  delay = 0,
  children,
  style,
}: {
  delay?: number;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(28)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 480,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        delay,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        delay,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, scale, translateY]);

  return (
    <Animated.View style={[style, {opacity, transform: [{translateY}, {scale}]}]}>
      {children}
    </Animated.View>
  );
}

/** 0 → 1 para desenhar anel, barra e linha. */
export function useDraw(delay = 0, duration = 900) {
  const [progress, setProgress] = useState(0);
  const value = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    value.setValue(0);
    const sub = value.addListener(({value: next}) => setProgress(next));
    Animated.timing(value, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => value.removeListener(sub);
  }, [delay, duration, value]);

  return progress;
}

/** Barra que cresce da esquerda até a largura final. */
export function GrowBar({
  ratio,
  color,
  delay = 0,
  height = 4,
}: {
  ratio: number;
  color: string;
  delay?: number;
  height?: number;
}) {
  const progress = useDraw(delay, 880);
  const target = Math.max(0, Math.min(1, ratio));
  const width = `${Math.round(progress * target * 100)}%`;

  return (
    <View
      style={{
        width,
        height,
        borderRadius: height,
        backgroundColor: color,
      }}
    />
  );
}

