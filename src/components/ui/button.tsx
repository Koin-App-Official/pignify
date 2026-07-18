import * as React from "react";
import { Text, View, type PressableProps } from "react-native";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import * as Haptics from "expo-haptics";
import { springPresets } from "@/lib/springPresets";

const buttonVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-full disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary",
        destructive: "bg-destructive",
        outline: "border border-outline bg-transparent",
        secondary: "bg-secondary",
        ghost: "bg-transparent",
        link: "bg-transparent",
        tonal: "bg-primary-container",
      },
      size: {
        default: "h-12 px-6 py-3",
        sm: "h-10 px-4",
        lg: "h-14 px-8",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const buttonTextVariants = cva(
  "text-center font-bold tracking-wide",
  {
    variants: {
      variant: {
        default: "text-primary-foreground",
        destructive: "text-destructive-foreground",
        outline: "text-primary",
        secondary: "text-secondary-foreground",
        ghost: "text-primary",
        link: "text-primary underline",
        tonal: "text-on-primary-container",
      },
      size: {
        default: "text-base",
        sm: "text-sm",
        lg: "text-lg",
        icon: "",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const VARIANT_BOTTOM_BORDERS: Record<string, { borderBottomWidth: number; borderBottomColor: string }> = {
  default: { borderBottomWidth: 4, borderBottomColor: '#1E3A8A' },
  destructive: { borderBottomWidth: 4, borderBottomColor: '#7F1D1D' },
  tonal: { borderBottomWidth: 4, borderBottomColor: '#166534' },
};

export interface ButtonProps
  extends Pick<PressableProps, "disabled" | "style">,
    VariantProps<typeof buttonVariants> {
  onPress?: () => void;
  label?: string;
  textClassName?: string;
  className?: string;
  children?: React.ReactNode;
}

const Button = React.forwardRef<React.ElementRef<typeof View>, ButtonProps>(
  ({ className, textClassName, variant, size, label, children, onPress, disabled, style }, ref) => {
    const pressed = useSharedValue(0);

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [
        { scale: interpolate(pressed.value, [0, 1], [1, 0.97]) },
        { translateY: interpolate(pressed.value, [0, 1], [0, 3]) },
      ],
    }));

    const tap = Gesture.Tap()
      .enabled(!disabled)
      .onBegin(() => {
        pressed.value = withSpring(1, springPresets.press);
      })
      .onFinalize(() => {
        pressed.value = withSpring(0, springPresets.press);
      })
      .onEnd(() => {
        runOnJS(Haptics.selectionAsync)();
        if (onPress) runOnJS(onPress)();
      });

    const borderBottomStyle = variant ? VARIANT_BOTTOM_BORDERS[variant] ?? {} : {};

    return (
      <GestureDetector gesture={tap}>
        <Animated.View
          className={cn(buttonVariants({ variant, size, className }), disabled && "opacity-50")}
          ref={ref}
          style={[animatedStyle, borderBottomStyle, style as any]}
        >
          {label ? (
            <Text className={cn(buttonTextVariants({ variant, size, className: textClassName }))}>
              {label}
            </Text>
          ) : children}
        </Animated.View>
      </GestureDetector>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants, buttonTextVariants };
