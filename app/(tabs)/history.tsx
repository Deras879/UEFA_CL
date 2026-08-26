import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { UCL } from "@/constants/theme";
import { TeamBadge } from "@/components/team-badge";
import { getTeamById } from "@/constants/teams";
import { getPlayerCardByName } from "@/constants/player-db";
import { Match, TournamentEdition, KnockoutTie } from "@/constants/types";
import { computeStandings, useTournamentStore } from "@/store/tournament";

const ROUND_LABELS: Record<string, string> = {
  round_of_16: "Octavos",
  quarterfinal: "Cuartos",
  semifinal: "Semifinales",
  final: "Final",
  third_place: "Tercer puesto",
};

export default function HistoryScreen() {
  const editions = useTournamentStore((s) => s.editions);
  const sortedEditions = useMemo(
    () => [...editions].sort((a, b) => b.editionNumber - a.editionNumber),
    [editions],
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    sortedEditions[0]?.id ?? null,
  );

  const selectedEdition =
    sortedEditions.find((edition) => edition.id === selectedId) ??
    sortedEditions[0] ??
    null;

  const selectedSnapshot = selectedEdition?.snapshot ?? null;

  const playerMap = useMemo(() => {
    const map = new Map<string, { nickname: string; teamId: string }>();
    if (!selectedSnapshot) return map;
    for (const player of selectedSnapshot.players) {
      map.set(player.id, { nickname: player.nickname, teamId: player.teamId });
    }
    return map;
  }, [selectedSnapshot]);

  function getPlayerName(playerId: string | null | undefined): string {
    if (!playerId) return "TBD";
    return playerMap.get(playerId)?.nickname ?? "Jugador";
  }

  function getPlayerTeam(playerId: string | null | undefined) {
    if (!playerId) return null;
    const teamId = playerMap.get(playerId)?.teamId;
    return teamId ? getTeamById(teamId) : null;
  }

  function renderPlayerAvatar(playerName: string, teamId?: string) {
    const name = playerName || "Jugador";
    const card = teamId
      ? getPlayerCardByName(teamId, name)
      : { name, photo: undefined, number: null };
    if (card.photo) {
      return (
        <Image
          source={{ uri: card.photo }}
          style={styles.playerAvatar}
          contentFit="cover"
        />
      );
    }
    return (
      <View style={styles.playerAvatarFallback}>
        <Text style={styles.playerAvatarText}>
          {(card.number ?? name).toString().slice(0, 2).toUpperCase()}
        </Text>
      </View>
    );
  }

  function formatPlayerName(playerName: string, teamId?: string) {
    const name = playerName || "Jugador";
    const card = teamId
      ? getPlayerCardByName(teamId, name)
      : { name, number: null };
    return `${card.number ? `#${card.number} ` : ""}${name}`;
  }

  function getResultText(match: Match) {
    if (match.homeScore === null || match.awayScore === null) {
      return "Pendiente";
    }
    return `${match.homeScore} - ${match.awayScore}`;
  }

  function getGroupName(groupId?: string) {
    if (!selectedSnapshot) return "Grupo";
    const group = selectedSnapshot.groups.find((item) => item.id === groupId);
    return group?.name ?? "Grupo";
  }

  function renderMatch(match: Match) {
    const homePlayer = selectedSnapshot?.players.find(
      (player) => player.id === match.homePlayerId,
    );
    const awayPlayer = selectedSnapshot?.players.find(
      (player) => player.id === match.awayPlayerId,
    );
    const homeTeam = homePlayer ? getTeamById(homePlayer.teamId) : null;
    const awayTeam = awayPlayer ? getTeamById(awayPlayer.teamId) : null;

    return (
      <View key={match.id} style={styles.matchCard}>
        <View style={styles.matchHeaderRow}>
          <Text style={styles.matchPhaseText}>
            {match.phase === "group"
              ? getGroupName(match.groupId)
              : "Eliminatoria"}
          </Text>
          <Text style={styles.matchScore}>{getResultText(match)}</Text>
        </View>

        <View style={styles.matchRow}>
          <View style={styles.teamCell}>
            <TeamBadge team={homeTeam} size={22} />
            <View style={styles.playerNameWrap}>
              {renderPlayerAvatar(
                homePlayer?.nickname ?? "TBD",
                homePlayer?.teamId,
              )}
              <Text style={styles.teamNameText} numberOfLines={1}>
                {formatPlayerName(
                  homePlayer?.nickname ?? "TBD",
                  homePlayer?.teamId,
                )}
              </Text>
            </View>
          </View>

          <View style={styles.teamCellRight}>
            <View style={styles.playerNameWrapRight}>
              <Text style={styles.teamNameText} numberOfLines={1}>
                {formatPlayerName(
                  awayPlayer?.nickname ?? "TBD",
                  awayPlayer?.teamId,
                )}
              </Text>
              {renderPlayerAvatar(
                awayPlayer?.nickname ?? "TBD",
                awayPlayer?.teamId,
              )}
            </View>
            <TeamBadge team={awayTeam} size={22} />
          </View>
        </View>

        {(match.homeGoalScorers.length > 0 ||
          match.awayGoalScorers.length > 0) && (
          <Text style={styles.goalText}>
            Goles:{" "}
            {match.homeGoalScorers.map((g) => g.playerName).join(", ") || "—"} ·{" "}
            {match.awayGoalScorers.map((g) => g.playerName).join(", ") || "—"}
          </Text>
        )}

        <Text style={styles.goalText}>
          Porteros: {match.homeGoalkeeperName ?? "—"} ·{" "}
          {match.awayGoalkeeperName ?? "—"}
        </Text>
      </View>
    );
  }

  function renderKnockoutTie(tie: KnockoutTie) {
    const homeSide = tie.player1Id ? getPlayerName(tie.player1Id) : "TBD";
    const awaySide = tie.player2Id ? getPlayerName(tie.player2Id) : "TBD";
    const homeTeam = getPlayerTeam(tie.player1Id);
    const awayTeam = getPlayerTeam(tie.player2Id);
    const leg1Match = selectedSnapshot?.matches.find(
      (match) => match.id === tie.leg1MatchId,
    );
    const leg2Match = selectedSnapshot?.matches.find(
      (match) => match.id === tie.leg2MatchId,
    );

    return (
      <View key={tie.id} style={styles.tieCard}>
        <Text style={styles.tieTitle}>
          {ROUND_LABELS[tie.round] ?? tie.round}
        </Text>
        <View style={styles.tieHeader}>
          <View style={styles.teamCell}>
            <TeamBadge team={homeTeam} size={22} />
            <View style={styles.playerNameWrap}>
              {renderPlayerAvatar(homeSide, getPlayerTeam(tie.player1Id)?.id)}
              <Text style={styles.teamNameText} numberOfLines={1}>
                {formatPlayerName(homeSide, getPlayerTeam(tie.player1Id)?.id)}
              </Text>
            </View>
          </View>
          <Text style={styles.tieVs}>vs</Text>
          <View style={styles.teamCellRight}>
            <View style={styles.playerNameWrapRight}>
              <Text style={styles.teamNameText} numberOfLines={1}>
                {formatPlayerName(awaySide, getPlayerTeam(tie.player2Id)?.id)}
              </Text>
              {renderPlayerAvatar(awaySide, getPlayerTeam(tie.player2Id)?.id)}
            </View>
            <TeamBadge team={awayTeam} size={22} />
          </View>
        </View>

        {leg1Match && (
          <View style={styles.legBlock}>
            <Text style={styles.legLabel}>
              {tie.isSingleLeg ? "Resultado" : "Ida"}
            </Text>
            <Text style={styles.legResult}>{getResultText(leg1Match)}</Text>
          </View>
        )}

        {!tie.isSingleLeg && leg2Match && (
          <View style={styles.legBlock}>
            <Text style={styles.legLabel}>Vuelta</Text>
            <Text style={styles.legResult}>{getResultText(leg2Match)}</Text>
          </View>
        )}

        {tie.winnerId && (
          <Text style={styles.winnerText}>
            Ganador: {getPlayerName(tie.winnerId)}
          </Text>
        )}
      </View>
    );
  }

  if (sortedEditions.length === 0) {
    return (
      <SafeAreaView style={styles.safe}>
        <LinearGradient
          colors={["#060B17", "#0A1225", "#0A142C"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.pageBg}
        >
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Sin historial todavía</Text>
            <Text style={styles.emptyText}>
              Cuando termine una edición se guardará aquí todo el desarrollo del
              torneo.
            </Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

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
            style={styles.header}
          >
            <Text style={styles.headerTitle}>HISTORIAL</Text>
            <Text style={styles.headerSubtitle}>Ediciones completadas</Text>
          </LinearGradient>

          <View style={styles.listContainer}>
            {sortedEditions.map((edition) => {
              const champion = getTeamById(edition.championTeamId);
              const runnerUp = getTeamById(edition.runnerUpTeamId);
              const isSelected = edition.id === selectedEdition?.id;

              return (
                <TouchableOpacity
                  key={edition.id}
                  activeOpacity={0.9}
                  onPress={() => setSelectedId(edition.id)}
                  style={[
                    styles.editionCard,
                    isSelected && styles.editionCardSelected,
                  ]}
                >
                  <View style={styles.editionHeaderRow}>
                    <Text style={styles.editionNumber}>
                      Edición #{edition.editionNumber}
                    </Text>
                    <Text style={styles.editionDate}>
                      {new Date(edition.finishedAt).toLocaleDateString("es-ES")}
                    </Text>
                  </View>

                  <View style={styles.editionFinalRow}>
                    <View style={styles.teamInline}>
                      <TeamBadge team={champion} size={22} />
                      <Text style={styles.teamInlineText}>
                        {champion?.shortName ?? "Campeón"}
                      </Text>
                    </View>
                    <Text style={styles.vsText}>vs</Text>
                    <View style={styles.teamInline}>
                      <TeamBadge team={runnerUp} size={22} />
                      <Text style={styles.teamInlineText}>
                        {runnerUp?.shortName ?? "Subcampeón"}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {selectedEdition && selectedSnapshot && (
            <LinearGradient
              colors={["#172541", "#0F1B31"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.detailCard}
            >
              <Text style={styles.detailTitle}>Resumen de la edición</Text>
              <Text style={styles.detailSummary}>
                {getTeamById(selectedEdition.championTeamId)?.name ?? "Campeón"}{" "}
                vs{" "}
                {getTeamById(selectedEdition.runnerUpTeamId)?.name ??
                  "Subcampeón"}
              </Text>

              <Text style={styles.sectionTitle}>Fase de grupos</Text>
              {selectedSnapshot.groups.length === 0 ? (
                <Text style={styles.emptyText}>No hubo fase de grupos.</Text>
              ) : (
                selectedSnapshot.groups.map((group) => {
                  const standings = computeStandings(
                    group,
                    selectedSnapshot.matches,
                  );
                  return (
                    <View key={group.id} style={styles.groupBlock}>
                      <Text style={styles.groupTitle}>{group.name}</Text>
                      {standings.map((standing, index) => {
                        const player = selectedSnapshot.players.find(
                          (item) => item.id === standing.playerId,
                        );
                        const team = player ? getTeamById(player.teamId) : null;

                        return (
                          <View
                            key={standing.playerId}
                            style={styles.standingRow}
                          >
                            <Text style={styles.standingPos}>{index + 1}</Text>
                            <TeamBadge team={team} size={18} />
                            <Text style={styles.standingName} numberOfLines={1}>
                              {player?.nickname ?? "Jugador"}
                            </Text>
                            <Text style={styles.standingPoints}>
                              {standing.points} pts
                            </Text>
                          </View>
                        );
                      })}

                      <View style={styles.groupMatchesWrap}>
                        {selectedSnapshot.matches
                          .filter((match) => match.groupId === group.id)
                          .map((match) => renderMatch(match))}
                      </View>
                    </View>
                  );
                })
              )}

              <Text style={styles.sectionTitle}>Eliminatorias</Text>
              {selectedSnapshot.ties.length === 0 ? (
                <Text style={styles.emptyText}>No hubo eliminatorias.</Text>
              ) : (
                selectedSnapshot.ties.map((tie) => renderKnockoutTie(tie))
              )}
            </LinearGradient>
          )}
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: UCL.bg,
  },
  pageBg: {
    flex: 1,
  },
  scroll: {
    padding: 16,
    paddingBottom: 80,
  },
  header: {
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: UCL.borderLight,
  },
  headerTitle: {
    color: UCL.textPrimary,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    color: UCL.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  listContainer: {
    gap: 10,
    marginBottom: 18,
  },
  editionCard: {
    backgroundColor: "rgba(18, 27, 49, 0.88)",
    borderColor: UCL.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  editionCardSelected: {
    borderColor: UCL.gold,
    shadowColor: UCL.gold,
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  editionHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  editionNumber: {
    color: UCL.textPrimary,
    fontSize: 16,
    fontWeight: "700",
  },
  editionDate: {
    color: UCL.textSecondary,
    fontSize: 11,
  },
  editionFinalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  teamInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  teamInlineText: {
    color: UCL.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  vsText: {
    color: UCL.textSecondary,
    fontSize: 12,
    marginHorizontal: 8,
  },
  detailCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: UCL.borderLight,
    marginBottom: 30,
  },
  detailTitle: {
    color: UCL.textPrimary,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  detailSummary: {
    color: UCL.textSecondary,
    fontSize: 13,
    marginBottom: 14,
  },
  sectionTitle: {
    color: UCL.gold,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 10,
    marginTop: 12,
    letterSpacing: 0.8,
  },
  groupBlock: {
    backgroundColor: "rgba(15, 27, 49, 0.8)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: UCL.border,
    marginBottom: 14,
  },
  groupTitle: {
    color: UCL.textPrimary,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  standingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    borderBottomColor: UCL.border,
    borderBottomWidth: 1,
  },
  standingPos: {
    color: UCL.textSecondary,
    width: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  standingName: {
    flex: 1,
    color: UCL.textPrimary,
    fontSize: 12,
    fontWeight: "600",
  },
  standingPoints: {
    color: UCL.gold,
    fontSize: 11,
    fontWeight: "700",
  },
  groupMatchesWrap: {
    marginTop: 10,
    gap: 10,
  },
  matchCard: {
    backgroundColor: "rgba(10, 16, 32, 0.7)",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: UCL.border,
  },
  matchHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  matchPhaseText: {
    color: UCL.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  matchScore: {
    color: UCL.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  matchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  teamCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  teamCellRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    justifyContent: "flex-end",
    flex: 1,
  },
  playerNameWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  playerNameWrapRight: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    flex: 1,
  },
  playerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UCL.border,
  },
  playerAvatarFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: UCL.blue,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UCL.border,
  },
  playerAvatarText: {
    color: "#fff",
    fontSize: 8,
    fontWeight: "800",
  },
  teamNameText: {
    color: UCL.textPrimary,
    fontSize: 12,
    fontWeight: "600",
    maxWidth: 120,
  },
  goalText: {
    color: UCL.textSecondary,
    fontSize: 11,
    marginTop: 8,
    lineHeight: 16,
  },
  tieCard: {
    backgroundColor: "rgba(10, 16, 32, 0.75)",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: UCL.border,
    marginBottom: 12,
  },
  tieTitle: {
    color: UCL.gold,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 8,
    letterSpacing: 0.7,
  },
  tieHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
  },
  tieVs: {
    color: UCL.textSecondary,
    fontSize: 12,
    fontWeight: "700",
  },
  legBlock: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: UCL.border,
  },
  legLabel: {
    color: UCL.textSecondary,
    fontSize: 11,
  },
  legResult: {
    color: UCL.textPrimary,
    fontSize: 12,
    fontWeight: "700",
  },
  winnerText: {
    color: UCL.gold,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 10,
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyTitle: {
    color: UCL.textPrimary,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },
  emptyText: {
    color: UCL.textSecondary,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
});
