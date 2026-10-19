import {useEffect, useMemo, useRef, useState} from 'react';
import {Animated} from 'react-native';
import {easeOut, motion} from '@/ui/motion';

type Options = {
  /** Deslocamento inicial do sheet (px). Default 48. */
  fromY?: number;
  openDuration?: number;
  closeDuration?: number;
};

/**
 * Controla mount + animações de backdrop/sheet para bottom sheets.
 * Use com Modal transparente (animationType="none").
 */
export function useAnimatedSheet(visible: boolean, opts: Options = {}) {
  const fromY = opts.fromY ?? 64;
  const openDuration = opts.openDuration ?? motion.open;
  const closeDuration = opts.closeDuration ?? motion.close;

  const backdrop = useRef(new Animated.Value(0)).current;
  const sheetY = useRef(new Animated.Value(fromY)).current;
  const [mounted, setMounted] = useState(visible);
  const openAnimStarted = useRef(false);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    if (visible) {
      // Evita reabrir (piscar) quando o pai re-renderiza com sugestões novas
      if (openAnimStarted.current) return;
      openAnimStarted.current = true;
      backdrop.setValue(0);
      sheetY.setValue(fromY);
      Animated.parallel([
        Animated.timing(backdrop, {
          toValue: 1,
          duration: openDuration,
          easing: easeOut,
          useNativeDriver: true,
        }),
        Animated.timing(sheetY, {
          toValue: 0,
          duration: openDuration,
          easing: easeOut,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }
    openAnimStarted.current = false;
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 0,
        duration: closeDuration,
        easing: easeOut,
        useNativeDriver: true,
      }),
      Animated.timing(sheetY, {
        toValue: fromY,
        duration: closeDuration,
        easing: easeOut,
        useNativeDriver: true,
      }),
    ]).start(({finished}) => {
      if (finished) setMounted(false);
    });
  }, [
    visible,
    mounted,
    backdrop,
    sheetY,
    fromY,
    openDuration,
    closeDuration,
  ]);

  const backdropStyle = useMemo(
    () => ({
      opacity: backdrop.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.45],
      }),
    }),
    [backdrop],
  );

  const sheetStyle = useMemo(
    () => ({
      opacity: backdrop,
      transform: [{translateY: sheetY}],
    }),
    [backdrop, sheetY],
  );

  return {mounted, backdropStyle, sheetStyle};
}
