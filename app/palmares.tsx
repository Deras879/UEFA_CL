import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { UCL } from "@/constants/theme";
import { getTeamById } from "@/constants/teams";
import { useTournamentStore } from "@/store/tournament";
import { TeamBadge } from "@/components/team-badge";

export default function PalmaresScreen() {
  const editions = useTournamentStore((s) => s.editions);

  const titlesByTeam = editions.reduce<Record<string, number>>((acc, ed) => {
    acc[ed.championTeamId] = (acc[ed.championTeamId] ?? 0) + 1;
    return acc;
  }, {});

  const palmares = Object.entries(titlesByTeam)
    .map(([teamId, titles]) => ({ teamId, titles }))
    .sort((a, b) => b.titles - a.titles);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Palmarés</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {palmares.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏆</Text>
            <Text style={styles.emptyText}>
              Todavía no hay campeones registrados.
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {palmares.map((row, index) => {
              const team = getTeamById(row.teamId);
              return (
                <LinearGradient
                  key={row.teamId}
                  colors={
                    index === 0
                      ? ["#3A2E0E", "#231A05"]
                      : ["#18243F", "#121B30"]
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.card, index === 0 && styles.cardFirst]}
                >
                  <TeamBadge team={team} size={72} />
                  <Text style={styles.teamName} numberOfLines={2}>
                    {team?.name ?? row.teamId}
                  </Text>
                  <View style={styles.starsRow}>
                    {Array.from({ length: row.titles }).map((_, i) => (
                      <Text key={i} style={styles.star}>
                        ⭐
                      </Text>
                    ))}
                  </View>
                  <Text style={styles.titlesCount}>
                    {row.titles} {row.titles === 1 ? "título" : "títulos"}
                  </Text>
                </LinearGradient>
              );
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UCL.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: UCL.border,
  },
  backBtn: { minWidth: 70 },
  backBtnText: { fontSize: 14, color: UCL.textSecondary, fontWeight: "600" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: UCL.textPrimary },
  scroll: { padding: 16, paddingBottom: 40 },
  emptyState: { alignItems: "center", marginTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 56 },
  emptyText: { fontSize: 14, color: UCL.textSecondary, textAlign: "center" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
  },
  card: {
    width: "47%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: UCL.border,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 7,
  },
  cardFirst: { borderColor: UCL.gold },
  teamName: {
    fontSize: 13,
    fontWeight: "800",
    color: UCL.textPrimary,
    textAlign: "center",
    minHeight: 32,
  },
  starsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 2,
    maxWidth: 140,
  },
  star: { fontSize: 16 },
  titlesCount: {
    fontSize: 11,
    color: UCL.textSecondary,
    fontWeight: "600",
  },
});
