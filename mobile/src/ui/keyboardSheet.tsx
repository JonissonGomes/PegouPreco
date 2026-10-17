import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {colors} from './theme';
import {useAnimatedSheet} from './useAnimatedSheet';

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
    const overlap = (e: {endCoordinates: {screenY: number; height: number}}) => {
      const windowH = Dimensions.get('window').height;
      const screenY = e.endCoordinates.screenY;
      const height = e.endCoordinates.height;
      if (!Number.isFinite(windowH)) return 0;
      if (!Number.isFinite(screenY) || screenY < 40) {
        return Math.min(Math.max(0, height), Math.round(windowH * 0.5));
      }
      return Math.max(0, Math.round(windowH - screenY));
    };
    const show = Keyboard.addListener('keyboardDidShow', e => {
      setKeyboardLift(overlap(e));
      setTimeout(() => setKeyboardLift(overlap(e)), 80);
    });
    const frame = Keyboard.addListener('keyboardDidChangeFrame', e => {
      setKeyboardLift(overlap(e));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardLift(0));
    return () => {
      show.remove();
      frame.remove();
      hide.remove();
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
      <KeyboardAvoidingView
        style={styles.root}
        // Em Android, `height` faz o sheet piscar ao mudar a lista de sugestões
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>
        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            {
              marginBottom: keyboardLift,
              paddingBottom: Math.max(insets.bottom, 12),
              maxHeight:
                Dimensions.get('window').height - keyboardLift - insets.top - 24,
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, justifyContent: 'flex-end'},
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
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
