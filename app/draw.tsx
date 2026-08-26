import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { UCL } from "@/constants/theme";
import { getTeamById } from "@/constants/teams";
import { useTournamentStore, formatDescription } from "@/store/tournament";
import { UCLTeam } from "@/constants/types";
import { TeamBadge } from "@/components/team-badge";

const ROUND_LABELS: Record<string, string> = {
  round_of_16: "RONDA DE 16",
  quarterfinal: "CUARTOS DE FINAL",
  semifinal: "SEMIFINAL",
};

export default function DrawScreen() {
  const tournament = useTournamentStore((s) => s.tournament);

  // ── Animation ──────────────────────────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const ballAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Ball spin animation
    Animated.sequence([
      Animated.timing(ballAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(ballAnim, {
        toValue: 0,
        duration: 0,
        useNativeDriver: true,
      }),
    ]).start();

    // Content fade in after brief delay
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }),
      ]).start();
    }, 500);
  }, []);

  const ballRotate = ballAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "720deg"],
  });

  if (!tournament) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Sin torneo activo.</Text>
          <TouchableOpacity onPress={() => router.replace("/setup")}>
            <Text style={styles.linkText}>Volver al setup</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isKnockout = tournament.format === "knockout";
  const isGroups = tournament.format === "groups-knockout";
  // First-round ties in knockout: non-final, non-third_place
  const firstRoundTies = tournament.ties.filter(
    (t) => t.round !== "final" && t.round !== "third_place",
  );
  const firstRoundName = firstRoundTies[0]?.round ?? "semifinal";

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <Animated.Text
            style={[styles.ball, { transform: [{ rotate: ballRotate }] }]}
          >
            ⚽
          </Animated.Text>
          <Text style={styles.titleTop}>EL SORTEO</Text>
          <Text style={styles.titleSub}>UEFA Champions League · FC 26</Text>
          <View style={styles.goldLine} />
        </View>

        <Animated.View
          style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}
        >
          {/* ── Format description ── */}
          <View style={styles.formatBadge}>
            <Text style={styles.formatBadgeText}>
              🏆 {formatDescription(tournament.players.length)}
            </Text>
          </View>

          {/* ── Pure knockout: show first-round ties ── */}
          {isKnockout && (
            <>
              <Text style={styles.phaseLabel}>
                {ROUND_LABELS[firstRoundName] ?? "ELIMINATORIA DIRECTA"}
              </Text>
              {firstRoundTies.map((tie, idx) => {
                const p1 = tournament.players.find(
                  (p) => p.id === tie.player1Id,
                );
                const p2 = tournament.players.find(
                  (p) => p.id === tie.player2Id,
                );
                const t1 = p1 ? getTeamById(p1.teamId) : null;
                const t2 = p2 ? getTeamById(p2.teamId) : null;
                return (
                  <View key={tie.id} style={styles.tieCard}>
                    <View style={styles.tieHeader}>
                      <Text style={styles.tieTitle}>
                        {ROUND_LABELS[tie.round] ?? tie.round.toUpperCase()}{" "}
                        {idx + 1}
                      </Text>
                      <View style={styles.tieBadge}>
                        <Text style={styles.tieBadgeText}>
                          {tie.isSingleLeg ? "Partido Único" : "Ida & Vuelta"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.tiePlayers}>
                      <PlayerChip player={p1} team={t1} />
                      <Text style={styles.vs}>VS</Text>
                      <PlayerChip player={p2} team={t2} />
                    </View>
                  </View>
                );
              })}
              <View style={styles.tieCard}>
                <View style={styles.tieHeader}>
                  <Text style={styles.tieTitle}>FINAL</Text>
                  <View
                    style={[
                      styles.tieBadge,
                      {
                        backgroundColor: UCL.gold + "22",
                        borderColor: UCL.gold + "60",
                      },
                    ]}
                  >
                    <Text style={[styles.tieBadgeText, { color: UCL.gold }]}>
                      Partido Único
                    </Text>
                  </View>
                </View>
                <Text style={styles.tbdText}>
                  Clasificados de las Semifinales
                </Text>
              </View>
            </>
          )}

          {/* ── Groups + knockout ── */}
          {isGroups && (
            <>
              <Text style={styles.phaseLabel}>
                📋 FASE DE GRUPOS · {tournament.config.numGroups} GRUPOS
              </Text>
              {/* Groups in rows of 2 */}
              {Array.from(
                { length: Math.ceil(tournament.groups.length / 2) },
                (_, rowIdx) => (
                  <View key={rowIdx} style={styles.groupsRow}>
                    {tournament.groups
                      .slice(rowIdx * 2, rowIdx * 2 + 2)
                      .map((group) => {
                        const groupPlayers = group.playerIds.map((pid) =>
                          tournament.players.find((p) => p.id === pid),
                        );
                        return (
                          <View key={group.id} style={styles.groupCard}>
                            <View style={styles.groupHeader}>
                              <Text style={styles.groupName}>
                                {group.name.toUpperCase()}
                              </Text>
                            </View>
                            {groupPlayers.map((p) => {
                              if (!p) return null;
                              const team = getTeamById(p.teamId);
                              return (
                                <View key={p.id} style={styles.groupPlayerRow}>
                                  <TeamBadge team={team} size={28} />
                                  <View style={styles.groupPlayerInfo}>
                                    <Text
                                      style={styles.groupPlayerNick}
                                      numberOfLines={1}
                                    >
                                      {p.nickname}
                                    </Text>
                                    <Text
                                      style={styles.groupPlayerTeam}
                                      numberOfLines={1}
                                    >
                                      {team?.shortName ?? "—"}
                                    </Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        );
                      })}
                  </View>
                ),
              )}

              <View style={styles.knockoutPreview}>
                <Text style={styles.knockoutPreviewTitle}>
                  ELIMINATORIAS (bracket de {tournament.config.bracketSize})
                </Text>
                <Text style={styles.knockoutPreviewText}>
                  Top {tournament.config.qualifiersPerGroup} de cada grupo
                  avanzan
                  {tournament.config.wildCardCount > 0
                    ? ` + ${tournament.config.wildCardCount} mejor(es) 3°`
                    : ""}
                </Text>
                <View style={styles.knockoutDivider} />
                <Text style={styles.knockoutPreviewNote}>
                  Final partido único · 3er Puesto partido único
                </Text>
              </View>
            </>
          )}

          {/* ── CTA ── */}
          <TouchableOpacity
            style={styles.startBtn}
            onPress={() => router.replace("/(tabs)/tournament")}
          >
            <Text style={styles.startBtnText}>COMENZAR TORNEO →</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => {
              useTournamentStore.getState().resetTournament();
              router.replace("/setup");
            }}
          >
            <Text style={styles.backBtnText}>← Volver al Setup</Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-component ──────────────────────────────────────────────────────────────
function PlayerChip({
  player,
  team,
}: {
  player: { nickname: string } | null | undefined;
  team: UCLTeam | null | undefined;
}) {
  if (!player || !team) return null;
  return (
    <View style={playerChipStyles.container}>
      <TeamBadge team={team} size={52} />
      <Text style={playerChipStyles.nickname} numberOfLines={1}>
        {player.nickname}
      </Text>
      <Text style={playerChipStyles.teamName} numberOfLines={1}>
        {team.name}
      </Text>
    </View>
  );
}

const playerChipStyles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", gap: 6 },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    minWidth: 50,
    alignItems: "center",
  },
  badgeText: { fontSize: 11, fontWeight: "800", color: "#fff" },
  nickname: {
    fontSize: 14,
    fontWeight: "800",
    color: UCL.textPrimary,
    textAlign: "center",
  },
  teamName: { fontSize: 11, color: UCL.textSecondary, textAlign: "center" },
});

// ── Styles ─────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UCL.bg },
  scroll: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { color: UCL.textSecondary, fontSize: 16, marginBottom: 12 },
  linkText: { color: UCL.gold, fontSize: 14, fontWeight: "600" },

  // Header
  header: { alignItems: "center", marginBottom: 32, marginTop: 16 },
  ball: { fontSize: 52, marginBottom: 16 },
  titleTop: {
    fontSize: 28,
    fontWeight: "900",
    color: UCL.textPrimary,
    letterSpacing: 6,
    marginBottom: 6,
  },
  titleSub: { fontSize: 13, color: UCL.textSecondary, marginBottom: 16 },
  goldLine: {
    height: 2,
    width: 60,
    backgroundColor: UCL.gold,
    borderRadius: 1,
  },

  formatBadge: {
    backgroundColor: UCL.bgCard,
    borderWidth: 1,
    borderColor: UCL.gold + "40",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 20,
    alignItems: "center",
  },
  formatBadgeText: {
    fontSize: 12,
    color: UCL.gold,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
  },

  phaseLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: UCL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 16,
  },

  // Tie cards (4 players)
  tieCard: {
    backgroundColor: UCL.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: UCL.border,
  },
  tieHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  tieTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: UCL.gold,
    letterSpacing: 1,
  },
  tieBadge: {
    borderWidth: 1,
    borderColor: UCL.borderLight,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tieBadgeText: { fontSize: 10, color: UCL.textSecondary, fontWeight: "600" },
  tiePlayers: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  vs: {
    fontSize: 13,
    fontWeight: "900",
    color: UCL.textMuted,
    marginHorizontal: 8,
  },
  tbdText: {
    fontSize: 13,
    color: UCL.textMuted,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 4,
  },

  // Group cards (6 players)
  groupsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  groupCard: {
    flex: 1,
    backgroundColor: UCL.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UCL.border,
    overflow: "hidden",
  },
  groupHeader: {
    backgroundColor: UCL.blue,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  groupName: {
    fontSize: 13,
    fontWeight: "900",
    color: UCL.gold,
    letterSpacing: 2,
  },
  groupPlayerRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: 1,
    borderTopColor: UCL.border,
    minHeight: 60,
  },
  groupTeamBar: { width: 4 },
  groupPlayerInfo: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    justifyContent: "center",
  },
  groupPlayerNick: {
    fontSize: 13,
    fontWeight: "700",
    color: UCL.textPrimary,
    marginBottom: 2,
  },
  groupPlayerTeam: { fontSize: 11, color: UCL.textSecondary },

  // Knockout preview
  knockoutPreview: {
    backgroundColor: UCL.bgCard,
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: UCL.border,
    alignItems: "center",
  },
  knockoutPreviewTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: UCL.gold,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  knockoutPreviewText: {
    fontSize: 13,
    color: UCL.textPrimary,
    fontWeight: "600",
    marginBottom: 4,
  },
  knockoutDivider: {
    height: 1,
    width: "60%",
    backgroundColor: UCL.border,
    marginVertical: 8,
  },
  knockoutPreviewNote: {
    fontSize: 11,
    color: UCL.textMuted,
    marginTop: 8,
    fontStyle: "italic",
  },

  // CTA
  startBtn: {
    backgroundColor: UCL.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  startBtnText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#000",
    letterSpacing: 1,
  },
  backBtn: { paddingVertical: 12, alignItems: "center" },
  backBtnText: { fontSize: 13, color: UCL.textSecondary },
});
