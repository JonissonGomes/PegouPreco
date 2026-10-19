import React, {useEffect, useRef, useState} from 'react';
import {
  Animated,
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
import {easeOut} from './motion';
import {useAnimatedSheet} from './useAnimatedSheet';

/**
 * Bottom sheet de formulário.
 * O deslocamento segue a tela de login: KeyboardAvoidingView com
 * behavior "padding" e offset 0 no Android. Não somamos a altura do
 * teclado de novo — isso empurrava a folha até o topo.
 */
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
  const [keyboardOpen, setKeyboardOpen] = useState(false);
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
        Animated.timing(dragY, {
          toValue: 0,
          duration: 280,
          easing: easeOut,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) dragY.setValue(0);
  }, [visible, dragY]);

  useEffect(() => {
    if (!visible) {
      setKeyboardOpen(false);
      return;
    }
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      show.remove();
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
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top : 0}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </Pressable>
        <Animated.View
          style={[
            styles.sheet,
            sheetStyle,
            {paddingBottom: keyboardOpen ? 12 : Math.max(insets.bottom, 12)},
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
              contentContainerStyle={[
                styles.content,
                keyboardOpen ? styles.contentOpen : null,
              ]}>
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
    width: '100%',
    maxHeight: '88%',
    flexShrink: 1,
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
  scroll: {flexGrow: 0, flexShrink: 1},
  content: {padding: 16, gap: 8, paddingBottom: 8, flexGrow: 0},
  contentOpen: {paddingBottom: 24},
});
