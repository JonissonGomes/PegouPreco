import {Easing, LayoutAnimation} from 'react-native';

/** Saída longa, sem salto no fim. */
export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);

export const motion = {
  open: 340,
  close: 280,
  enter: 420,
};

export function animateLayout() {
  LayoutAnimation.configureNext({
    duration: motion.open,
    update: {type: LayoutAnimation.Types.easeInEaseOut},
    create: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
    delete: {
      type: LayoutAnimation.Types.easeInEaseOut,
      property: LayoutAnimation.Properties.opacity,
    },
  });
}
