import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import type { ReactNode } from 'react';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { springPresets } from '@/lib/springPresets';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  maxHeight?: number;
}

/**
 * Gesture-driven bottom sheet (guide §5.2): drag handle tracks the finger 1:1,
 * release hands off to a velocity-aware spring snap, and the backdrop fades
 * from the same translateY shared value that drives the sheet transform.
 *
 * Sheet height is content-driven (measured via onLayout, capped at `maxHeight`)
 * rather than fixed, so short content (e.g. a calendar) doesn't stretch to fill
 * the screen.
 */
export function BottomSheet({ visible, onClose, children, maxHeight }: BottomSheetProps) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const cap = maxHeight ?? windowHeight * 0.9;

  const [mounted, setMounted] = useState(visible);
  const [sheetHeight, setSheetHeight] = useState(0);
  const translateY = useSharedValue(windowHeight);
  const startY = useSharedValue(0);

  useEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;
    if (visible && sheetHeight > 0) {
      translateY.value = withSpring(0, springPresets.sheet);
    } else if (!visible) {
      translateY.value = withSpring(sheetHeight || windowHeight, springPresets.sheet, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, sheetHeight, mounted]);

  const handleContentLayout = (e: LayoutChangeEvent) => {
    setSheetHeight(e.nativeEvent.layout.height);
  };

  const snapHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

  const handlePan = Gesture.Pan()
    .onStart(() => {
      startY.value = translateY.value;
    })
    .onUpdate((e) => {
      translateY.value = Math.max(0, startY.value + e.translationY);
    })
    .onEnd((e) => {
      const shouldClose = e.velocityY > 500 || translateY.value > sheetHeight / 3;
      if (shouldClose) {
        translateY.value = withSpring(
          sheetHeight,
          { ...springPresets.sheet, velocity: e.velocityY },
          (finished) => {
            if (finished) {
              runOnJS(snapHaptic)();
              runOnJS(onClose)();
            }
          }
        );
      } else {
        translateY.value = withSpring(0, { ...springPresets.sheet, velocity: e.velocityY }, (finished) => {
          if (finished) runOnJS(snapHaptic)();
        });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [0, sheetHeight || windowHeight], [0.4, 0], Extrapolation.CLAMP),
  }));

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  if (!mounted) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        onLayout={handleContentLayout}
        style={[
          styles.sheet,
          { maxHeight: cap, paddingBottom: Math.max(insets.bottom, 20) },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={handlePan}>
          <View style={styles.handleZone}>
            <View style={styles.handle} />
          </View>
        </GestureDetector>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: '#000000',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 25,
  },
  handleZone: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
});
