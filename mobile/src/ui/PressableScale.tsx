import React, {useRef} from 'react';
import {Animated, Pressable, type StyleProp, type ViewStyle} from 'react-native';

interface PressableScaleProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  activeScale?: number;
  disabled?: boolean;
  hitSlop?: number | {top?: number; bottom?: number; left?: number; right?: number};
}

/**
 * Componente Pressable com animação de escala e feedback fluido (padrão iOS / nativo)
 */
export function PressableScale({
  children,
  onPress,
  style,
  activeScale = 0.96,
  disabled = false,
  hitSlop,
}: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: activeScale,
      useNativeDriver: true,
      speed: 35,
      bounciness: 4,
    }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 25,
      bounciness: 6,
    }).start();
  };

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      style={style}>
      <Animated.View style={[{transform: [{scale}]}, style]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
