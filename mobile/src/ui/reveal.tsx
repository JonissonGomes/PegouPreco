import React, {useEffect, useRef} from 'react';
import {Animated, type StyleProp, type ViewStyle} from 'react-native';

/** Entrada suave: sobe e aparece. Usada na abertura de insights e gráficos. */
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
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 420,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, opacity, translateY]);

  return (
    <Animated.View style={[style, {opacity, transform: [{translateY}]}]}>
      {children}
    </Animated.View>
  );
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
  const progress = useRef(new Animated.Value(0)).current;
  const target = Math.max(0, Math.min(1, ratio));

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: target,
      duration: 640,
      delay,
      useNativeDriver: false,
    }).start();
  }, [delay, progress, target]);

  const width = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: height,
        backgroundColor: color,
      }}
    />
  );
}
