import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type KeyboardEvent,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from './theme';
import {useAnimatedSheet} from './useAnimatedSheet';

/**
 * Quanto a folha precisa subir para encostar no teclado.
 * `screenY` no Android às vezes vem pequeno demais e empurrava o formulário
 * até o topo, cortando os botões. A altura reportada limita esse salto.
 * Se a janela já encolheu, a sobreposição fica ~0 e não somamos de novo.
 */
function keyboardOverlap(e: KeyboardEvent): number {
  const windowH = Dimensions.get('window').height;
  const {height, screenY} = e.endCoordinates;
  const reported = Number.isFinite(height) ? Math.max(0, height) : 0;
  const cap = Math.round(windowH * 0.55);
  if (!Number.isFinite(screenY) || screenY <= 0) {
    return Math.min(reported, cap);
  }
  const overlap = Math.round(windowH - screenY);
  if (overlap <= 0) return 0;
  const bounded = reported > 0 ? Math.min(overlap, reported) : overlap;
  return Math.min(bounded, cap);
}

/** Bottom sheet que sobe com o teclado e permite scroll dos campos. */
export function KeyboardSafeSheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const {mounted, backdropStyle, sheetStyle} = useAnimatedSheet(visible);
  const dragY = useRef(new Animated.Value(0)).current;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        dragY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 72 || gesture.vy > 0.9) {
          onCloseRef.current?.();
          dragY.setValue(0);
          return;
        }
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          friction: 8,
        }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) dragY.setValue(0);
  }, [visible, dragY]);
  const [keyboardLift, setKeyboardLift] = useState(0);

  useEffect(() => {
    if (!visible) {
      setKeyboardLift(0);
      return;
    }
    let last: KeyboardEvent | null = null;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const apply = () => {
      if (!last) return;
      setKeyboardLift(keyboardOverlap(last));
    };
    const schedule = (e: KeyboardEvent) => {
      last = e;
      apply();
      // O Android encolhe a janela depois do evento. Medir de novo evita subir duas vezes.
      timers.forEach(clearTimeout);
      timers = [setTimeout(apply, 80), setTimeout(apply, 280)];
    };
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, schedule);
    const frame = Keyboard.addListener('keyboardDidChangeFrame', schedule);
    const hide = Keyboard.addListener(hideEvent, () => {
      last = null;
      timers.forEach(clearTimeout);
      setKeyboardLift(0);
    });
    const dims = Dimensions.addEventListener('change', apply);
    return () => {
      timers.forEach(clearTimeout);
      show.remove();
      frame.remove();
      hide.remove();
      dims.remove();
    };
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>
        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            {
              bottom: keyboardLift,
              paddingBottom: keyboardLift > 0 ? 12 : Math.max(insets.bottom, 12),
              maxHeight: Math.max(
                180,
                Dimensions.get('window').height - keyboardLift - insets.top - 16,
              ),
            },
          ]}>
          <Animated.View style={{transform: [{translateY: dragY}]}}>
          <View style={styles.handleHit} {...pan.panHandlers}>
            <View style={styles.handle} />
          </View>
          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.content}>
            {children}
          </ScrollView>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomWidth: 0,
  },
  handleHit: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  scroll: {flexGrow: 0},
  content: {padding: 16, gap: 8, paddingBottom: 8, flexGrow: 0},
});
