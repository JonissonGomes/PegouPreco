import React, {useRef} from 'react';
import {Animated, Pressable, StyleSheet, Text, View} from 'react-native';
import {Swipeable} from 'react-native-gesture-handler';
import {Pencil, Trash2} from 'lucide-react-native';
import {colors, radii} from '@/ui/theme';

type Props = {
  children: React.ReactNode;
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
};

export function SwipeableActions({
  children,
  onEdit,
  onDelete,
  editLabel = 'Editar',
  deleteLabel = 'Excluir',
}: Props) {
  const ref = useRef<Swipeable>(null);

  const renderRight = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) => {
    const translate = dragX.interpolate({
      inputRange: [-160, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });
    return (
      <Animated.View style={[styles.actions, {transform: [{translateX: translate}]}]}>
        {onEdit ? (
          <Pressable
            style={[styles.btn, styles.edit]}
            onPress={() => {
              ref.current?.close();
              onEdit();
            }}>
            <Pencil size={18} color={colors.navy} />
            <Text style={styles.editText}>{editLabel}</Text>
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable
            style={[styles.btn, styles.del]}
            onPress={() => {
              ref.current?.close();
              onDelete();
            }}>
            <Trash2 size={18} color="#fff" />
            <Text style={styles.delText}>{deleteLabel}</Text>
          </Pressable>
        ) : null}
      </Animated.View>
    );
  };

  return (
    <Swipeable
      ref={ref}
      friction={2}
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={renderRight}
      containerStyle={styles.wrap}>
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  wrap: {marginBottom: 12, overflow: 'hidden', borderRadius: radii.md},
  actions: {
    flexDirection: 'row',
    width: 152,
    marginLeft: 8,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: radii.md,
  },
  edit: {
    backgroundColor: colors.yellowBright,
    marginRight: 6,
  },
  del: {backgroundColor: colors.danger},
  editText: {fontSize: 11, fontWeight: '800', color: colors.navy},
  delText: {fontSize: 11, fontWeight: '800', color: '#fff'},
});
