import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { UCL } from "@/constants/theme";
import { getTeamById } from "@/constants/teams";
import { getPlayerCardByName } from "@/constants/player-db";
import { useTournamentStore } from "@/store/tournament";
import { TeamBadge } from "@/components/team-badge";

export default function StatsScreen() {
  const tournament = useTournamentStore((s) => s.tournament);
  const editions = useTournamentStore((s) => s.editions);

  if (!tournament) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyTitle}>Sin torneo activo</Text>
          <Text style={styles.emptySub}>
            Las estadísticas aparecerán aquí una vez iniciado el torneo.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Compute player (manager) stats and real footballer awards from completed matches
  const playerStats: Record<
    string,
    {
      goalsFor: number;
      goalsAgainst: number;
      played: number;
      wins: number;
      lastWinAt: string;
    }
  > = {};
  const scorerStats: Record<
    string,
    { goals: number; teamId: string; lastGoalAt: string }
  > = {};
  const goalkeeperStats: Record<
    string,
    {
      conceded: number;
      cleanSheets: number;
      teamId: string;
      matches: number;
      lastMatchAt: string;
    }
  > = {};

  for (const p of tournament.players) {
    playerStats[p.id] = {
      goalsFor: 0,
      goalsAgainst: 0,
      played: 0,
      wins: 0,
      lastWinAt: "",
    };
  }

  // Process chronologically so tied stats reflect who reached the mark last.
  const chronologicalMatches = [...tournament.matches].sort((a, b) =>
    (a.playedAt ?? "").localeCompare(b.playedAt ?? ""),
  );

  for (const m of chronologicalMatches) {
    if (
      m.status !== "completed" ||
      m.homeScore === null ||
      m.awayScore === null
    )
      continue;
    const playedAt = m.playedAt ?? "";
    const h = playerStats[m.homePlayerId];
    const a = playerStats[m.awayPlayerId];
    if (h) {
      h.goalsFor += m.homeScore;
      h.goalsAgainst += m.awayScore;
      h.played++;
      if (m.homeScore > m.awayScore) {
        h.wins++;
        h.lastWinAt = playedAt;
      }
    }
    if (a) {
      a.goalsFor += m.awayScore;
      a.goalsAgainst += m.homeScore;
      a.played++;
      if (m.awayScore > m.homeScore) {
        a.wins++;
        a.lastWinAt = playedAt;
      }
    }

    if (m.isForfeit) continue;

    // Real scorer awards from selected scorer list
    for (const gs of m.homeGoalScorers ?? []) {
      const key = gs.playerName.trim();
      if (!key) continue;
      const owner = tournament.players.find((pl) => pl.id === m.homePlayerId);
      const teamId = owner?.teamId ?? "";
      if (!scorerStats[key])
        scorerStats[key] = { goals: 0, teamId, lastGoalAt: "" };
      scorerStats[key].goals += 1;
      scorerStats[key].lastGoalAt = playedAt;
    }
    for (const gs of m.awayGoalScorers ?? []) {
      const key = gs.playerName.trim();
      if (!key) continue;
      const owner = tournament.players.find((pl) => pl.id === m.awayPlayerId);
      const teamId = owner?.teamId ?? "";
      if (!scorerStats[key])
        scorerStats[key] = { goals: 0, teamId, lastGoalAt: "" };
      scorerStats[key].goals += 1;
      scorerStats[key].lastGoalAt = playedAt;
    }

    // Goalkeeper stats from selected keepers
    if (m.homeGoalkeeperName?.trim()) {
      const owner = tournament.players.find((pl) => pl.id === m.homePlayerId);
      const key = m.homeGoalkeeperName.trim();
      if (!goalkeeperStats[key]) {
        goalkeeperStats[key] = {
          conceded: 0,
          cleanSheets: 0,
          teamId: owner?.teamId ?? "",
          matches: 0,
          lastMatchAt: "",
        };
      }
      goalkeeperStats[key].matches += 1;
      goalkeeperStats[key].conceded += m.awayScore;
      if (m.awayScore === 0) goalkeeperStats[key].cleanSheets += 1;
      goalkeeperStats[key].lastMatchAt = playedAt;
    }
    if (m.awayGoalkeeperName?.trim()) {
      const owner = tournament.players.find((pl) => pl.id === m.awayPlayerId);
      const key = m.awayGoalkeeperName.trim();
      if (!goalkeeperStats[key]) {
        goalkeeperStats[key] = {
          conceded: 0,
          cleanSheets: 0,
          teamId: owner?.teamId ?? "",
          matches: 0,
          lastMatchAt: "",
        };
      }
      goalkeeperStats[key].matches += 1;
      goalkeeperStats[key].conceded += m.homeScore;
      if (m.homeScore === 0) goalkeeperStats[key].cleanSheets += 1;
      goalkeeperStats[key].lastMatchAt = playedAt;
    }
  }

  const sortedByGoals = [...tournament.players].sort(
    (a, b) =>
      (playerStats[b.id]?.goalsFor ?? 0) - (playerStats[a.id]?.goalsFor ?? 0),
  );

  const sortedByDefense = [...tournament.players].sort(
    (a, b) =>
      (playerStats[a.id]?.goalsAgainst ?? 0) -
      (playerStats[b.id]?.goalsAgainst ?? 0),
  );

  const sortedByWins = [...tournament.players].sort(
    (a, b) =>
      (playerStats[b.id]?.wins ?? 0) - (playerStats[a.id]?.wins ?? 0) ||
      (playerStats[b.id]?.lastWinAt ?? "").localeCompare(
        playerStats[a.id]?.lastWinAt ?? "",
      ),
  );

  const topScorers = Object.entries(scorerStats)
    .map(([name, s]) => ({ name, ...s }))
    .sort(
      (a, b) => b.goals - a.goals || b.lastGoalAt.localeCompare(a.lastGoalAt),
    );

  const topKeepers = Object.entries(goalkeeperStats)
    .map(([name, s]) => ({ name, ...s }))
    .sort(
      (a, b) =>
        b.cleanSheets - a.cleanSheets ||
        a.conceded - b.conceded ||
        a.matches - b.matches ||
        b.lastMatchAt.localeCompare(a.lastMatchAt),
    );

  const completedMatches = tournament.matches.filter(
    (m) => m.status === "completed",
  ).length;
  const totalMatches = tournament.matches.filter(
    (m) => m.homePlayerId !== "",
  ).length;

  const sortedEditions = [...editions].sort(
    (a, b) => b.editionNumber - a.editionNumber,
  );

  const renderPlayerAvatar = (teamId: string, name: string) => {
    const card = getPlayerCardByName(teamId, name);
    console.log(card);

    if (card.photo) {
      return (
        <Image
          source={{ uri: card.photo }}
          style={awardStyles.playerAvatar}
          contentFit="cover"
        />
      );
    }
    const label = (card.number ?? card.name ?? "J")
      .toString()
      .slice(0, 2)
      .toUpperCase();
    return (
      <View style={awardStyles.playerAvatarFallback}>
        <Text style={awardStyles.playerAvatarText}>{label}</Text>
      </View>
    );
  };

  const formatPlayerName = (teamId: string, name: string) => {
    const card = getPlayerCardByName(teamId, name);
    return `${card.number ? `#${card.number} ` : ""}${name}`;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <LinearGradient
        colors={["#060B17", "#0A1225", "#0A142C"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.pageBg}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={["#162645", "#101A30"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandHeader}
          >
            <Image
              source={require("@/assets/images/ucl-logo-no-text-blue.png")}
              style={styles.brandLogo}
              contentFit="contain"
            />
            <View>
              <Text style={styles.brandTitle}>UEFA CHAMPIONS LEAGUE</Text>
              <Text style={styles.brandSubtitle}>Estadísticas y premios</Text>
            </View>
          </LinearGradient>

          <Text style={styles.pageTitle}>📈 ESTADÍSTICAS</Text>

          {/* Progress */}
          <LinearGradient
            colors={["#1A2743", "#131E35"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.progressCard}
          >
            <Text style={styles.progressLabel}>PROGRESO DEL TORNEO</Text>
            <Text style={styles.progressCount}>
              {completedMatches} / {totalMatches} partidos
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width:
                      totalMatches > 0
                        ? `${(completedMatches / totalMatches) * 100}%`
                        : "0%",
                  },
                ]}
              />
            </View>
          </LinearGradient>

          {/* Golden Boot (real footballers from scorer picker) */}
          <LinearGradient
            colors={["#192742", "#131D34"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={awardStyles.card}
          >
            <View style={awardStyles.header}>
              <Text style={awardStyles.emoji}>⚽</Text>
              <View>
                <Text style={awardStyles.title}>BOTA DE ORO</Text>
                <Text style={awardStyles.subtitle}>
                  Máximos goleadores registrados
                </Text>
              </View>
            </View>
            {topScorers.length === 0 ? (
              <Text style={awardStyles.emptyText}>
                Aún no hay goleadores seleccionados.
              </Text>
            ) : (
              topScorers.slice(0, 8).map((s, i) => {
                const team = getTeamById(s.teamId);
                return (
                  <View
                    key={`${s.name}-${i}`}
                    style={[awardStyles.row, i === 0 && awardStyles.rowFirst]}
                  >
                    <View
                      style={[awardStyles.pos, i === 0 && awardStyles.posFirst]}
                    >
                      <Text
                        style={[
                          awardStyles.posText,
                          i === 0 && awardStyles.posTextFirst,
                        ]}
                      >
                        {i === 0
                          ? "🥇"
                          : i === 1
                            ? "🥈"
                            : i === 2
                              ? "🥉"
                              : `${i + 1}`}
                      </Text>
                    </View>
                    {renderPlayerAvatar(s.teamId, s.name)}
                    <View style={awardStyles.info}>
                      <Text
                        style={[
                          awardStyles.nick,
                          i === 0 && awardStyles.nickFirst,
                        ]}
                        numberOfLines={1}
                      >
                        {formatPlayerName(s.teamId, s.name)}
                      </Text>
                      <Text style={awardStyles.teamName} numberOfLines={1}>
                        {team?.name ?? "Equipo"}
                      </Text>
                    </View>
                    <Text
                      style={[
                        awardStyles.value,
                        i === 0 && awardStyles.valueFirst,
                      ]}
                    >
                      {s.goals} goles
                    </Text>
                  </View>
                );
              })
            )}
          </LinearGradient>

          {/* Golden Glove (real keepers from goalkeeper picker) */}
          <LinearGradient
            colors={["#192742", "#131D34"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={awardStyles.card}
          >
            <View style={awardStyles.header}>
              <Text style={awardStyles.emoji}>🧤</Text>
              <View>
                <Text style={awardStyles.title}>GUANTE DE ORO</Text>
                <Text style={awardStyles.subtitle}>
                  Porteros: más porterías a cero
                </Text>
              </View>
            </View>
            {topKeepers.length === 0 ? (
              <Text style={awardStyles.emptyText}>
                Aún no hay porteros seleccionados.
              </Text>
            ) : (
              topKeepers.slice(0, 8).map((k, i) => {
                const team = getTeamById(k.teamId);
                return (
                  <View
                    key={`${k.name}-${i}`}
                    style={[awardStyles.row, i === 0 && awardStyles.rowFirst]}
                  >
                    <View
                      style={[awardStyles.pos, i === 0 && awardStyles.posFirst]}
                    >
                      <Text
                        style={[
                          awardStyles.posText,
                          i === 0 && awardStyles.posTextFirst,
                        ]}
                      >
                        {i === 0
                          ? "🥇"
                          : i === 1
                            ? "🥈"
                            : i === 2
                              ? "🥉"
                              : `${i + 1}`}
                      </Text>
                    </View>
                    {renderPlayerAvatar(k.teamId, k.name)}
                    <View style={awardStyles.info}>
                      <Text
                        style={[
                          awardStyles.nick,
                          i === 0 && awardStyles.nickFirst,
                        ]}
                        numberOfLines={1}
                      >
                        {formatPlayerName(k.teamId, k.name)}
                      </Text>
                      <Text style={awardStyles.teamName} numberOfLines={1}>
                        {team?.name ?? "Equipo"}
                      </Text>
                    </View>
                    <Text
                      style={[
                        awardStyles.value,
                        i === 0 && awardStyles.valueFirst,
                      ]}
                    >
                      {k.cleanSheets} CS · {k.conceded} GC
                    </Text>
                  </View>
                );
              })
            )}
          </LinearGradient>

          {/* Best player (wins) */}
          <AwardCard
            emoji="🏆"
            title="BALÓN DE ORO"
            subtitle="Más victorias"
            players={sortedByWins}
            getValue={(p) => `${playerStats[p.id]?.wins ?? 0} victorias`}
            getSecondary={(p) => {
              const team = getTeamById(p.teamId);
              return `${team?.flag ?? ""} ${team?.name ?? ""}`;
            }}
          />

          {sortedEditions.length > 0 && (
            <LinearGradient
              colors={["#192742", "#131D34"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={awardStyles.card}
            >
              <View style={awardStyles.header}>
                <Text style={awardStyles.emoji}>🗃️</Text>
                <View>
                  <Text style={awardStyles.title}>HISTÓRICO DE EDICIONES</Text>
                  <Text style={awardStyles.subtitle}>
                    Campeones, subcampeones y premios finales
                  </Text>
                </View>
              </View>

              {sortedEditions.map((ed, i) => {
                const champion = getTeamById(ed.championTeamId);
                const runnerUp = getTeamById(ed.runnerUpTeamId);
                const isLatest = i === 0;

                return (
                  <View
                    key={ed.id}
                    style={[
                      awardStyles.historyEdition,
                      isLatest && awardStyles.rowFirst,
                    ]}
                  >
                    <Text style={awardStyles.historyEditionTitle}>
                      Edición #{ed.editionNumber}
                    </Text>

                    <View style={awardStyles.historyLineRow}>
                      <Text style={awardStyles.historyLabel}>Campeón:</Text>
                      <View style={awardStyles.historyValueRow}>
                        <TeamBadge team={champion} size={16} />
                        <Text style={awardStyles.historyValueText}>
                          {champion?.name ?? ed.championTeamId}
                        </Text>
                      </View>
                    </View>

                    <View style={awardStyles.historyLineRow}>
                      <Text style={awardStyles.historyLabel}>Subcampeón:</Text>
                      <View style={awardStyles.historyValueRow}>
                        <TeamBadge team={runnerUp} size={16} />
                        <Text style={awardStyles.historyValueText}>
                          {runnerUp?.name ?? ed.runnerUpTeamId}
                        </Text>
                      </View>
                    </View>

                    <Text style={awardStyles.historyMeta}>
                      ⚽ {ed.awards.goldenBootName ?? "—"} · 🧤{" "}
                      {ed.awards.goldenGloveName ?? "—"} · 🏆{" "}
                      {ed.awards.goldenBallManagerName ?? "—"}
                    </Text>
                  </View>
                );
              })}
            </LinearGradient>
          )}

          <Text style={styles.disclaimer}>
            * Los premios finales se determinan al término del torneo.
          </Text>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

function AwardCard({
  emoji,
  title,
  subtitle,
  players,
  getValue,
  getSecondary,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  players: { id: string; nickname: string; teamId: string }[];
  getValue: (p: { id: string; nickname: string; teamId: string }) => string;
  getSecondary: (p: { id: string; nickname: string; teamId: string }) => string;
}) {
  return (
    <LinearGradient
      colors={["#192742", "#131D34"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={awardStyles.card}
    >
      <View style={awardStyles.header}>
        <Text style={awardStyles.emoji}>{emoji}</Text>
        <View>
          <Text style={awardStyles.title}>{title}</Text>
          <Text style={awardStyles.subtitle}>{subtitle}</Text>
        </View>
      </View>
      {players.map((p, i) => {
        const team = getTeamById(p.teamId);
        const isFirst = i === 0;
        return (
          <View
            key={p.id}
            style={[awardStyles.row, isFirst && awardStyles.rowFirst]}
          >
            <View style={[awardStyles.pos, isFirst && awardStyles.posFirst]}>
              <Text
                style={[
                  awardStyles.posText,
                  isFirst && awardStyles.posTextFirst,
                ]}
              >
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}`}
              </Text>
            </View>
            <View
              style={[
                awardStyles.dot,
                { backgroundColor: team?.primaryColor ?? UCL.blueLight },
              ]}
            />
            <View style={awardStyles.info}>
              <Text
                style={[awardStyles.nick, isFirst && awardStyles.nickFirst]}
                numberOfLines={1}
              >
                {p.nickname}
              </Text>
              <Text style={awardStyles.teamName} numberOfLines={1}>
                {getSecondary(p)}
              </Text>
            </View>
            <Text
              style={[awardStyles.value, isFirst && awardStyles.valueFirst]}
            >
              {getValue(p)}
            </Text>
          </View>
        );
      })}
    </LinearGradient>
  );
}

const awardStyles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: UCL.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 7,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: UCL.border,
    paddingBottom: 12,
  },
  emoji: { fontSize: 28 },
  title: { fontSize: 13, fontWeight: "800", color: UCL.gold, letterSpacing: 1 },
  subtitle: { fontSize: 11, color: UCL.textSecondary, marginTop: 2 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: UCL.border,
  },
  rowFirst: {
    backgroundColor: UCL.gold + "10",
    borderRadius: 8,
    paddingHorizontal: 6,
  },
  pos: { width: 28, alignItems: "center" },
  posFirst: {},
  posText: { fontSize: 12, color: UCL.textMuted, fontWeight: "700" },
  posTextFirst: { fontSize: 18 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  info: { flex: 1 },
  nick: { fontSize: 13, fontWeight: "600", color: UCL.textPrimary },
  nickFirst: { fontWeight: "800", fontSize: 14 },
  teamName: { fontSize: 11, color: UCL.textSecondary, marginTop: 1 },
  value: { fontSize: 12, fontWeight: "700", color: UCL.textSecondary },
  valueFirst: { color: UCL.gold, fontSize: 13 },
  emptyText: {
    color: UCL.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
  },
  playerAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: UCL.border,
  },
  playerAvatarFallback: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: UCL.blue,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UCL.border,
  },
  playerAvatarText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  historyEdition: {
    borderTopWidth: 1,
    borderTopColor: UCL.border,
    paddingTop: 10,
    marginTop: 6,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  historyEditionTitle: {
    color: UCL.gold,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 6,
  },
  historyLineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
    gap: 10,
  },
  historyLabel: {
    color: UCL.textMuted,
    fontSize: 11,
    minWidth: 78,
  },
  historyValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
    justifyContent: "flex-end",
  },
  historyValueText: {
    color: UCL.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  historyMeta: {
    marginTop: 4,
    color: UCL.textSecondary,
    fontSize: 11,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UCL.bg },
  pageBg: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 48 },
  brandHeader: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UCL.border,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 9 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
  },
  brandLogo: { width: 40, height: 40 },
  brandTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: UCL.gold,
    letterSpacing: 1.3,
  },
  brandSubtitle: {
    fontSize: 12,
    color: UCL.textSecondary,
    marginTop: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  emptyEmoji: { fontSize: 60 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: UCL.textSecondary },
  emptySub: {
    fontSize: 13,
    color: UCL.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
  pageTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: UCL.gold,
    letterSpacing: 2,
    marginBottom: 20,
    textAlign: "center",
  },

  progressCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: UCL.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 7,
  },
  progressLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: UCL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  progressCount: {
    fontSize: 20,
    fontWeight: "800",
    color: UCL.textPrimary,
    marginBottom: 10,
  },
  progressBar: {
    height: 6,
    backgroundColor: UCL.bgCardAlt,
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: "100%", backgroundColor: UCL.gold, borderRadius: 3 },
  disclaimer: {
    fontSize: 11,
    color: UCL.textMuted,
    textAlign: "center",
    fontStyle: "italic",
    marginTop: 8,
  },
});
