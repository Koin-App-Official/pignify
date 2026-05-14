import * as React from "react";
import { Switch as RNSwitch, type SwitchProps } from "react-native";

const Switch = React.forwardRef<React.ElementRef<typeof RNSwitch>, SwitchProps>(
  ({ ...props }, ref) => {
    return (
      <RNSwitch
        ref={ref}
        trackColor={{ false: "#CBD5E1", true: "#1D4ED8" }}
        thumbColor={"#ffffff"}
        {...props}
      />
    );
  }
);
Switch.displayName = "Switch";

export { Switch };
