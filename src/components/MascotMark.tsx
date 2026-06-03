import { StyleSheet, Text, View } from "react-native";
import { colors, radius } from "../theme";

type MascotMarkProps = {
  mood?: MascotMood;
  size?: "xs" | "sm" | "md" | "lg";
};

export type MascotMood = "chat" | "empty" | "location" | "safe";

const sizeMap = {
  xs: 42,
  sm: 54,
  md: 82,
  lg: 112
};

const moodMap: Record<
  MascotMood,
  {
    bubble: string;
    bubbleText: string;
    glow: string;
    pin: string;
    text: string;
  }
> = {
  chat: {
    bubble: colors.coral,
    bubbleText: "...",
    glow: colors.yellow,
    pin: colors.teal,
    text: colors.white
  },
  empty: {
    bubble: colors.yellowSoft,
    bubbleText: "?",
    glow: colors.lilacSoft,
    pin: colors.green,
    text: colors.ink
  },
  location: {
    bubble: colors.tealSoft,
    bubbleText: "5",
    glow: colors.yellow,
    pin: colors.teal,
    text: colors.teal
  },
  safe: {
    bubble: colors.lilac,
    bubbleText: "!",
    glow: colors.tealSoft,
    pin: colors.ink,
    text: colors.white
  }
};

export function MascotMark({ mood = "chat", size = "md" }: MascotMarkProps) {
  const box = sizeMap[size];
  const scale = box / sizeMap.md;
  const moodStyle = moodMap[mood];

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { height: box, width: box }]}
    >
      <View
        style={[
          styles.pin,
          { backgroundColor: moodStyle.pin, height: 70 * scale, width: 58 * scale, borderRadius: 30 * scale }
        ]}
      >
        <View style={[styles.face, { height: 35 * scale, width: 35 * scale, borderRadius: 18 * scale }]}>
          <View style={[styles.eye, styles.eyeLeft, scaledDot(scale)]} />
          <View style={[styles.eye, styles.eyeRight, scaledDot(scale)]} />
          <View style={[styles.mouth, { height: 6 * scale, width: 15 * scale, borderBottomWidth: 2 * scale }]} />
        </View>
        <View
          style={[
            styles.pinPoint,
            { backgroundColor: moodStyle.pin, height: 22 * scale, width: 22 * scale, bottom: -7 * scale }
          ]}
        />
      </View>
      <View
        style={[
          styles.chat,
          { backgroundColor: moodStyle.bubble, height: 31 * scale, width: 36 * scale, borderRadius: 15 * scale }
        ]}
      >
        <Text style={[styles.chatDots, { color: moodStyle.text, fontSize: 14 * scale, lineHeight: 16 * scale }]}>
          {moodStyle.bubbleText}
        </Text>
      </View>
      <View
        style={[
          styles.glow,
          {
            backgroundColor: moodStyle.glow,
            borderRadius: 9 * scale,
            height: 18 * scale,
            shadowColor: moodStyle.glow,
            width: 18 * scale
          }
        ]}
      />
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
    bottom: 8,
    justifyContent: "center",
    position: "absolute",
    right: 1
  },
  chatDots: {
    fontWeight: "900"
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
    left: 10,
    overflow: "visible",
    position: "absolute",
    top: 2
  },
  pinPoint: {
    left: 18,
    position: "absolute",
    transform: [{ rotate: "45deg" }]
  },
  root: {
    position: "relative"
  }
});
