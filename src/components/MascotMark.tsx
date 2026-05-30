import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";

type MascotMarkProps = {
  size?: "sm" | "md" | "lg";
};

const sizeMap = {
  sm: 54,
  md: 82,
  lg: 112
};

export function MascotMark({ size = "md" }: MascotMarkProps) {
  const box = sizeMap[size];
  const scale = box / sizeMap.md;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { height: box, width: box }]}
    >
      <View style={[styles.pin, { height: 70 * scale, width: 58 * scale, borderRadius: 30 * scale }]}>
        <View style={[styles.face, { height: 35 * scale, width: 35 * scale, borderRadius: 18 * scale }]}>
          <View style={[styles.eye, styles.eyeLeft, scaledDot(scale)]} />
          <View style={[styles.eye, styles.eyeRight, scaledDot(scale)]} />
          <View style={[styles.mouth, { height: 6 * scale, width: 15 * scale, borderBottomWidth: 2 * scale }]} />
        </View>
        <View style={[styles.pinPoint, { height: 22 * scale, width: 22 * scale, bottom: -7 * scale }]} />
      </View>
      <View style={[styles.chat, { height: 31 * scale, width: 36 * scale, borderRadius: 15 * scale }]}>
          <Text style={[styles.chatDots, { fontSize: 14 * scale }]}>...</Text>
      </View>
      <View style={[styles.glow, { height: 18 * scale, width: 18 * scale, borderRadius: 9 * scale }]} />
    </View>
  );
}

function scaledDot(scale: number) {
  return {
    height: 5 * scale,
    width: 5 * scale,
    borderRadius: 3 * scale
  };
}

const styles = StyleSheet.create({
  chat: {
    alignItems: "center",
    backgroundColor: colors.coral,
    bottom: 8,
    justifyContent: "center",
    position: "absolute",
    right: 1
  },
  chatDots: {
    color: colors.white,
    fontWeight: "900",
    lineHeight: 16
  },
  eye: {
    backgroundColor: colors.ink,
    position: "absolute",
    top: 13
  },
  eyeLeft: {
    left: 10
  },
  eyeRight: {
    right: 10
  },
  face: {
    backgroundColor: colors.paper,
    left: 12,
    position: "absolute",
    top: 12
  },
  glow: {
    backgroundColor: colors.yellow,
    bottom: 14,
    left: 4,
    position: "absolute",
    shadowColor: colors.yellow,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.65,
    shadowRadius: 10
  },
  mouth: {
    borderBottomColor: colors.ink,
    borderBottomLeftRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
    left: 10,
    position: "absolute",
    top: 21
  },
  pin: {
    backgroundColor: colors.teal,
    left: 10,
    overflow: "visible",
    position: "absolute",
    top: 2
  },
  pinPoint: {
    backgroundColor: colors.teal,
    left: 18,
    position: "absolute",
    transform: [{ rotate: "45deg" }]
  },
  root: {
    position: "relative"
  }
});
