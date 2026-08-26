import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import type { UCLTeam } from "@/constants/types";

interface TeamBadgeProps {
  team: UCLTeam | null | undefined;
  size?: number;
  /** Number of Champions titles won — renders a small star badge when > 0. */
  titles?: number;
}

/**
 * Displays the official team crest using a pre-resolved URL stored in team.badgeUrl.
 * Falls back to a colored box with the team shortName if no badge URL is available.
 */
export function TeamBadge({ team, size = 32, titles = 0 }: TeamBadgeProps) {
  const badgeUrl = team?.badgeUrl;

  const crest = badgeUrl ? (
    <Image
      source={{ uri: badgeUrl }}
      style={{ width: size, height: size }}
      contentFit="contain"
      transition={200}
      cachePolicy="memory-disk"
    />
  ) : (
    <View
      style={[
        styles.fallback,
        {
          width: size,
          height: size,
          borderRadius: Math.max(4, size * 0.18),
          backgroundColor: team?.primaryColor ?? "#1A2B4A",
        },
      ]}
    >
      <Text style={[styles.text, { fontSize: Math.max(7, size * 0.28) }]}>
        {team?.shortName?.slice(0, 3) ?? "?"}
      </Text>
    </View>
  );

  if (titles <= 0) return crest;

  return (
    <View style={{ width: size, height: size }}>
      {crest}
      <View style={[styles.starBadge, { minWidth: Math.max(14, size * 0.4) }]}>
        <Text style={[styles.starText, { fontSize: Math.max(8, size * 0.24) }]}>
          ⭐{titles}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  text: {
    color: "#fff",
    fontWeight: "800",
    textAlign: "center",
  },
  starBadge: {
    position: "absolute",
    top: -6,
    right: -6,
    backgroundColor: "#F5C518",
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  starText: {
    color: "#1A1400",
    fontWeight: "800",
  },
});
