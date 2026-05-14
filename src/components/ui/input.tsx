import * as React from "react";
import { TextInput, type TextInputProps } from "react-native";
import { cn } from "../../lib/utils";

const Input = React.forwardRef<React.ElementRef<typeof TextInput>, TextInputProps>(
  ({ className, placeholderTextColor, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        className={cn(
          "flex h-14 w-full rounded-2xl bg-surface-container-low px-4 py-3 text-base text-on-surface",
          className
        )}
        placeholderTextColor={placeholderTextColor ?? "#64748B"}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
