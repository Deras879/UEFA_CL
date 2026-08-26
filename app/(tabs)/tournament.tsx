import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  FlatList,
  Modal,
  TextInput,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { UCL } from "@/constants/theme";
import { getTeamById } from "@/constants/teams";
import { getPlayerCardByName, getTeamPlayers } from "@/constants/player-db";
import { useTournamentStore, computeStandings } from "@/store/tournament";
import { Match, Player, KnockoutTie, KnockoutRound } from "@/constants/types";
import { TeamBadge } from "@/components/team-badge";
import { fetchTeamInfo, fetchSquad, SquadPlayer } from "@/services/sportsdb";

const ROUND_ORDER: KnockoutRound[] = [
  "round_of_16",
  "quarterfinal",
  "semifinal",
];
const ROUND_LABELS: Record<KnockoutRound, string> = {
  round_of_16: "RONDA DE 16",
  quarterfinal: "CUARTOS DE FINAL",
  semifinal: "SEMIFINALES",
  final: "FINAL",
  third_place: "TERCER PUESTO",
};

const PICKER_PAGE_SIZE = 20;

function getPlayerVisual(teamId: string, playerName: string) {
  return getPlayerCardByName(teamId, playerName);
}

export default function TournamentScreen() {
  const tournament = useTournamentStore((s) => s.tournament);
  const recordResult = useTournamentStore((s) => s.recordResult);
  const advanceToKnockout = useTournamentStore((s) => s.advanceToKnockout);
  const repairKnockout = useTournamentStore((s) => s.repairKnockout);
  const swapGroupPlayers = useTournamentStore((s) => s.swapGroupPlayers);
  const swapKnockoutPlayers = useTournamentStore((s) => s.swapKnockoutPlayers);

  const [matchModal, setMatchModal] = useState<Match | null>(null);
  const [homeGoals, setHomeGoals] = useState("");
  const [awayGoals, setAwayGoals] = useState("");
  const [homeSquad, setHomeSquad] = useState<SquadPlayer[]>([]);
  const [awaySquad, setAwaySquad] = useState<SquadPlayer[]>([]);
  const [homeScorers, setHomeScorers] = useState<string[]>([]);
  const [awayScorers, setAwayScorers] = useState<string[]>([]);
  const [homeGoalkeeper, setHomeGoalkeeper] = useState<string | null>(null);
  const [awayGoalkeeper, setAwayGoalkeeper] = useState<string | null>(null);
  const [pickerState, setPickerState] = useState<{
    side: "home" | "away";
    mode: "scorer" | "goalkeeper";
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"groups" | "knockout">("knockout");
  const [editDrawMode, setEditDrawMode] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [pickerPageSize, setPickerPageSize] = useState(PICKER_PAGE_SIZE);
  const squadCacheRef = useRef<Map<string, SquadPlayer[]>>(new Map());
  const isMountedRef = useRef(true);

  function getPlayerVisual(teamId: string, playerName: string) {
    return getPlayerCardByName(teamId, playerName);
  }

  function fallbackSquad(teamShortName: string): SquadPlayer[] {
    return [
      {
        id: `${teamShortName}-gk1`,
        name: `Portero titular ${teamShortName}`,
        position: "Goalkeeper",
      },
      {
        id: `${teamShortName}-gk2`,
        name: `Portero suplente ${teamShortName}`,
        position: "Goalkeeper",
      },
      {
        id: `${teamShortName}-df1`,
        name: `Defensa central ${teamShortName}`,
        position: "Defender",
      },
      {
        id: `${teamShortName}-df2`,
        name: `Lateral derecho ${teamShortName}`,
        position: "Defender",
      },
      {
        id: `${teamShortName}-df3`,
        name: `Lateral izquierdo ${teamShortName}`,
        position: "Defender",
      },
      {
        id: `${teamShortName}-mf1`,
        name: `Mediocentro ${teamShortName}`,
        position: "Midfielder",
      },
      {
        id: `${teamShortName}-mf2`,
        name: `Interior ${teamShortName}`,
        position: "Midfielder",
      },
      {
        id: `${teamShortName}-mf3`,
        name: `Organizador ${teamShortName}`,
        position: "Midfielder",
      },
      {
        id: `${teamShortName}-fw1`,
        name: `Extremo derecho ${teamShortName}`,
        position: "Forward",
      },
      {
        id: `${teamShortName}-fw2`,
        name: `Extremo izquierdo ${teamShortName}`,
        position: "Forward",
      },
      {
        id: `${teamShortName}-fw3`,
        name: `Delantero centro ${teamShortName}`,
        position: "Forward",
      },
    ];
  }

  function dedupeSquad(squad: SquadPlayer[]): SquadPlayer[] {
    const map = new Map<string, SquadPlayer>();
    for (const sp of squad) {
      const name = sp.name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { ...sp, name });
      }
    }
    return Array.from(map.values());
  }

  function sanitizeApiSquad(squad: SquadPlayer[]): SquadPlayer[] {
    return squad.filter((sp) => {
      const name = sp.name?.trim().toLowerCase();
      if (!name) return false;
      const pos = (sp.position || "").toLowerCase();
      // Drop obvious staff entries that sometimes appear in TheSportsDB
      if (
        pos.includes("manager") ||
        pos.includes("coach") ||
        pos.includes("president")
      ) {
        return false;
      }
      return true;
    });
  }

  async function resolveSquadForMatchPlayer(
    playerId: string,
  ): Promise<SquadPlayer[]> {
    const p = getPlayer(playerId);
    const team = p ? getTeamById(p.teamId) : null;
    if (!team) return [];

    const cacheKey = String(team.id);
    const cached = squadCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const dbPlayers = getTeamPlayers(team.id);
    const canonical = dedupeSquad(
      dbPlayers.map((player) => ({
        id: String(player.id),
        name: player.name,
        position: player.position,
      })),
    );

    squadCacheRef.current.set(cacheKey, canonical);
    return canonical;
  }

  useEffect(() => {
    if (tournament?.phase === "knockout" || tournament?.phase === "finished") {
      repairKnockout();
    }
  }, [tournament?.id, tournament?.phase, repairKnockout]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const pickerPlayers = useMemo(() => {
    if (!pickerState) return [];
    const source = pickerState.side === "home" ? homeSquad : awaySquad;
    const query = searchTerm.trim().toLowerCase();

    return source.filter((sp) => {
      const positionMatches =
        pickerState.mode === "goalkeeper"
          ? /goalkeeper|keeper|portero/i.test(sp.position || "")
          : true;
      const nameMatches =
        !query || (sp.name ?? "").toLowerCase().includes(query);
      return positionMatches && nameMatches;
    });
  }, [pickerState, homeSquad, awaySquad, searchTerm]);

  // Reset pagination whenever the picker opens or the search changes.
  useEffect(() => {
    setPickerPageSize(PICKER_PAGE_SIZE);
  }, [pickerState, searchTerm]);

  const pagedPickerPlayers = useMemo(
    () => pickerPlayers.slice(0, pickerPageSize),
    [pickerPlayers, pickerPageSize],
  );

  if (!tournament) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🏆</Text>
          <Text style={styles.emptyTitle}>Sin torneo activo</Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => router.push("/setup")}
          >
            <Text style={styles.ctaBtnText}>CREAR TORNEO</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const getPlayer = (id: string): Player | undefined =>
    tournament.players.find((p) => p.id === id);

  async function openMatch(match: Match) {
    if (match.homePlayerId === "" || match.awayPlayerId === "") return;

    setMatchModal(match);
    setHomeGoals(match.homeScore !== null ? String(match.homeScore) : "");
    setAwayGoals(match.awayScore !== null ? String(match.awayScore) : "");
    setHomeScorers(match.homeGoalScorers.map((g) => g.playerName));
    setAwayScorers(match.awayGoalScorers.map((g) => g.playerName));
    setHomeGoalkeeper(match.homeGoalkeeperName ?? null);
    setAwayGoalkeeper(match.awayGoalkeeperName ?? null);
    setHomeSquad([]);
    setAwaySquad([]);

    Promise.all([
      resolveSquadForMatchPlayer(match.homePlayerId),
      resolveSquadForMatchPlayer(match.awayPlayerId),
    ])
      .then(([hSquad, aSquad]) => {
        if (!isMountedRef.current) return;
        setHomeSquad(hSquad);
        setAwaySquad(aSquad);
      })
      .catch(() => {
        if (!isMountedRef.current) return;
        setHomeSquad([]);
        setAwaySquad([]);
      });
  }

  function saveResult() {
    if (!matchModal) return;
    const h = parseInt(homeGoals, 10);
    const a = parseInt(awayGoals, 10);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) {
      Alert.alert("Resultado inválido", "Introduce números enteros ≥ 0.");
      return;
    }
    if (!homeGoalkeeper || !awayGoalkeeper) {
      Alert.alert(
        "Portero requerido",
        "Selecciona el portero de ambos equipos.",
      );
      return;
    }
    if (homeScorers.length !== h || awayScorers.length !== a) {
      Alert.alert(
        "Goleadores incompletos",
        "La cantidad de goleadores debe coincidir con los goles de cada equipo.",
      );
      return;
    }
    recordResult(
      matchModal.id,
      h,
      a,
      homeScorers,
      awayScorers,
      homeGoalkeeper,
      awayGoalkeeper,
    );
    setMatchModal(null);
  }

  function saveForfeit(absentSide: "home" | "away") {
    if (!matchModal) return;
    const absentName =
      getPlayer(
        absentSide === "home"
          ? matchModal.homePlayerId
          : matchModal.awayPlayerId,
      )?.nickname ?? "este participante";

    Alert.alert(
      "Registrar incomparecencia",
      `${absentName} pierde 3-0. No se asignarán goleadores ni estadísticas de portero.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Confirmar 3-0",
          style: "destructive",
          onPress: () => {
            recordResult(
              matchModal.id,
              absentSide === "home" ? 0 : 3,
              absentSide === "away" ? 0 : 3,
              [],
              [],
              null,
              null,
              true,
            );
            setMatchModal(null);
          },
        },
      ],
    );
  }

  function addScorer(side: "home" | "away", name: string) {
    if (side === "home") {
      const max = parseInt(homeGoals || "0", 10) || 0;
      setHomeScorers((prev) => (prev.length >= max ? prev : [...prev, name]));
      return;
    }
    const max = parseInt(awayGoals || "0", 10) || 0;
    setAwayScorers((prev) => (prev.length >= max ? prev : [...prev, name]));
  }

  function removeLastScorer(side: "home" | "away") {
    if (side === "home") {
      setHomeScorers((prev) => prev.slice(0, -1));
      return;
    }
    setAwayScorers((prev) => prev.slice(0, -1));
  }

  function handleDrawPlayerPress(playerId: string, isGroupsPhase: boolean) {
    if (!editDrawMode) return;
    if (!selectedPlayerId) {
      setSelectedPlayerId(playerId);
      return;
    }
    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
      return;
    }
    const ok = isGroupsPhase
      ? swapGroupPlayers(selectedPlayerId, playerId)
      : swapKnockoutPlayers(selectedPlayerId, playerId);
    if (!ok) {
      Alert.alert(
        "No se puede intercambiar",
        "Ese grupo o llave ya tiene partidos jugados, o el intercambio no es válido.",
      );
    }
    setSelectedPlayerId(null);
  }

  // ── Group phase ────────────────────────────────────────────────────────────
  const isGroups = tournament.phase === "groups";
  const hasGroupHistory = tournament.groups.length > 0;
  const isKnockoutView =
    tournament.phase === "knockout" || tournament.phase === "finished";
  const showTabs = isKnockoutView && hasGroupHistory;
  const showGroupsContent = isGroups || (showTabs && activeTab === "groups");
  const showKnockoutContent =
    isKnockoutView && (!showTabs || activeTab === "knockout");
  const allGroupMatchesDone =
    isGroups &&
    tournament.matches
      .filter((m) => m.phase === "group")
      .every((m) => m.status === "completed");

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
            colors={["#173E97", "#0F2E76"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.brandHeader}
          >
            <Image
              source={require("@/assets/images/ucl-logo-no-text-white.png")}
              style={styles.brandLogo}
              contentFit="contain"
            />
            <View>
              <Text style={styles.brandTitle}>UEFA CHAMPIONS LEAGUE</Text>
              <Text style={styles.brandSubtitle}>Panel de torneo</Text>
            </View>
          </LinearGradient>

          {/* ── Phase banner ── */}
          <LinearGradient
            colors={["#173C91", "#122F74"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0.8 }}
            style={styles.phaseBanner}
          >
            <Text style={styles.phaseBannerText}>
              {tournament.phase === "groups"
                ? "🗂️  FASE DE GRUPOS"
                : tournament.phase === "knockout"
                  ? "🧭  ELIMINATORIAS"
                  : "✅  TORNEO FINALIZADO"}
            </Text>
          </LinearGradient>

          {tournament.phase !== "finished" && (
            <TouchableOpacity
              style={[
                styles.editDrawBtn,
                editDrawMode && styles.editDrawBtnActive,
              ]}
              onPress={() => {
                setEditDrawMode((prev) => !prev);
                setSelectedPlayerId(null);
              }}
            >
              <Text style={styles.editDrawBtnText}>
                {editDrawMode
                  ? "✅ Listo (toca 2 jugadores para intercambiar)"
                  : "✏️ Editar sorteo"}
              </Text>
            </TouchableOpacity>
          )}

          {/* ── Sub-tabs (groups → knockout) ── */}
          {showTabs && (
            <View style={styles.subTabBar}>
              <TouchableOpacity
                style={[
                  styles.subTab,
                  activeTab === "groups" && styles.subTabActive,
                ]}
                onPress={() => setActiveTab("groups")}
              >
                <Text
                  style={[
                    styles.subTabText,
                    activeTab === "groups" && styles.subTabTextActive,
                  ]}
                >
                  🗂️ GRUPOS
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.subTab,
                  activeTab === "knockout" && styles.subTabActive,
                ]}
                onPress={() => setActiveTab("knockout")}
              >
                <Text
                  style={[
                    styles.subTabText,
                    activeTab === "knockout" && styles.subTabTextActive,
                  ]}
                >
                  🧭 ELIMINATORIAS
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ═══ GROUP PHASE ═══ */}
          {showGroupsContent &&
            tournament.groups.map((group) => {
              const standings = computeStandings(group, tournament.matches);
              const groupMatches = tournament.matches.filter(
                (m) => m.groupId === group.id,
              );

              return (
                <View key={group.id} style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    {group.name.toUpperCase()}
                  </Text>

                  {/* Standings table */}
                  <View style={styles.table}>
                    <View style={styles.tableHeader}>
                      <Text style={[styles.th, styles.thPlayer]}>Jugador</Text>
                      <Text style={styles.th}>PJ</Text>
                      <Text style={styles.th}>G</Text>
                      <Text style={styles.th}>E</Text>
                      <Text style={styles.th}>P</Text>
                      <Text style={styles.th}>GD</Text>
                      <Text style={[styles.th, styles.thPts]}>Pts</Text>
                    </View>
                    {standings.map((st, i) => {
                      const p = getPlayer(st.playerId);
                      const team = p ? getTeamById(p.teamId) : null;
                      const isQualified =
                        i < tournament.config.qualifiersPerGroup;
                      const isSelected = selectedPlayerId === st.playerId;
                      return (
                        <TouchableOpacity
                          key={st.playerId}
                          activeOpacity={editDrawMode ? 0.6 : 1}
                          onPress={() =>
                            handleDrawPlayerPress(st.playerId, true)
                          }
                          style={[
                            styles.tableRow,
                            isQualified && styles.tableRowQ,
                            isSelected && styles.tableRowSelected,
                          ]}
                        >
                          <View style={styles.tdPlayer}>
                            <View
                              style={[
                                styles.posCircle,
                                {
                                  backgroundColor: isQualified
                                    ? UCL.gold
                                    : UCL.bgCardAlt,
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.posNum,
                                  {
                                    color: isQualified ? "#000" : UCL.textMuted,
                                  },
                                ]}
                              >
                                {i + 1}
                              </Text>
                            </View>
                            <View
                              style={[
                                styles.teamDot,
                                {
                                  backgroundColor:
                                    team?.primaryColor ?? UCL.blueLight,
                                },
                              ]}
                            />
                            <Text style={styles.tdName} numberOfLines={1}>
                              {p?.nickname ?? "—"}
                            </Text>
                          </View>
                          <Text style={styles.td}>{st.played}</Text>
                          <Text style={styles.td}>{st.won}</Text>
                          <Text style={styles.td}>{st.drawn}</Text>
                          <Text style={styles.td}>{st.lost}</Text>
                          <Text style={styles.td}>
                            {st.goalDiff > 0 ? "+" : ""}
                            {st.goalDiff}
                          </Text>
                          <Text style={[styles.td, styles.tdPts]}>
                            {st.points}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Group matches */}
                  <Text style={styles.matchesLabel}>PARTIDOS</Text>
                  {groupMatches.map((m) => (
                    <MatchRow
                      key={m.id}
                      match={m}
                      getPlayer={getPlayer}
                      onPress={openMatch}
                    />
                  ))}
                </View>
              );
            })}

          {/* Advance to knockout button — only in live group phase */}
          {isGroups && allGroupMatchesDone && (
            <TouchableOpacity
              style={styles.advanceBtn}
              onPress={() => {
                Alert.alert(
                  "Avanzar a Eliminatorias",
                  "¿Todos los partidos de grupos están listos?",
                  [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Avanzar", onPress: advanceToKnockout },
                  ],
                );
              }}
            >
              <Text style={styles.advanceBtnText}>
                🚀 AVANZAR A ELIMINATORIAS
              </Text>
            </TouchableOpacity>
          )}

          {/* ═══ KNOCKOUT PHASE ═══ */}
          {showKnockoutContent && (
            <>
              {/* Intermediate rounds (R16, QF, SF) */}
              {ROUND_ORDER.map((round) => {
                const roundTies = tournament.ties.filter(
                  (t) => t.round === round,
                );
                if (roundTies.length === 0) return null;
                return (
                  <View key={round} style={styles.section}>
                    <Text style={styles.sectionTitle}>
                      {ROUND_LABELS[round]}
                    </Text>
                    {roundTies.map((tie, idx) => {
                      const p1 = getPlayer(tie.player1Id ?? "");
                      const p2 = getPlayer(tie.player2Id ?? "");
                      const leg1 = tournament.matches.find(
                        (m) => m.id === tie.leg1MatchId,
                      );
                      const leg2 = tournament.matches.find(
                        (m) => m.id === tie.leg2MatchId,
                      );
                      return (
                        <LinearGradient
                          key={tie.id}
                          colors={["#18243F", "#121B31"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.tieCard}
                        >
                          <Text style={styles.tieLabel}>
                            {ROUND_LABELS[round]}{" "}
                            {roundTies.length > 1 ? idx + 1 : ""}
                          </Text>
                          <TiePlayers
                            p1={p1}
                            p2={p2}
                            editMode={editDrawMode}
                            selectedPlayerId={selectedPlayerId}
                            onSelectPlayer={(playerId) =>
                              handleDrawPlayerPress(playerId, false)
                            }
                          />
                          {leg1 && (
                            <MatchRow
                              match={leg1}
                              label="IDA"
                              getPlayer={getPlayer}
                              onPress={openMatch}
                            />
                          )}
                          {leg2 && (
                            <MatchRow
                              match={leg2}
                              label="VUELTA"
                              getPlayer={getPlayer}
                              onPress={openMatch}
                            />
                          )}
                          {leg1?.status === "completed" &&
                            leg2?.status === "completed" && (
                              <TieAggregate
                                tie={tie}
                                leg1={leg1}
                                leg2={leg2}
                                getPlayer={getPlayer}
                              />
                            )}
                        </LinearGradient>
                      );
                    })}
                  </View>
                );
              })}

              {/* Final */}
              {(() => {
                const finalTie = tournament.ties.find(
                  (t) => t.round === "final",
                );
                if (!finalTie) return null;
                const p1 = getPlayer(finalTie.player1Id ?? "");
                const p2 = getPlayer(finalTie.player2Id ?? "");
                const m = tournament.matches.find(
                  (match) => match.id === finalTie.leg1MatchId,
                );
                return (
                  <View style={styles.section}>
                    <Text style={[styles.sectionTitle, { color: UCL.gold }]}>
                      👑 FINAL
                    </Text>
                    <LinearGradient
                      colors={["#18243F", "#121B31"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.tieCard}
                    >
                      {p1 || p2 ? (
                        <TiePlayers p1={p1} p2={p2} />
                      ) : (
                        <Text style={styles.tbdText}>Por definir</Text>
                      )}
                      {m && p1 && p2 && (
                        <MatchRow
                          match={m}
                          label="FINAL"
                          getPlayer={getPlayer}
                          onPress={openMatch}
                        />
                      )}
                    </LinearGradient>
                  </View>
                );
              })()}

              {/* 3rd place */}
              {(() => {
                const thirdTie = tournament.ties.find(
                  (t) => t.round === "third_place",
                );
                if (!thirdTie) return null;
                const p1 = getPlayer(thirdTie.player1Id ?? "");
                const p2 = getPlayer(thirdTie.player2Id ?? "");
                const m = tournament.matches.find(
                  (match) => match.id === thirdTie.leg1MatchId,
                );
                return (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>🥉 TERCER PUESTO</Text>

                    <LinearGradient
                      colors={["#18243F", "#121B31"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.tieCard}
                    >
                      {p1 || p2 ? (
                        <TiePlayers p1={p1} p2={p2} />
                      ) : (
                        <Text style={styles.tbdText}>Por definir</Text>
                      )}
                      {m && p1 && p2 && (
                        <MatchRow
                          match={m}
                          label="3er Puesto"
                          getPlayer={getPlayer}
                          onPress={openMatch}
                        />
                      )}
                    </LinearGradient>
                  </View>
                );
              })()}
            </>
          )}
        </ScrollView>
      </LinearGradient>

      {/* ── Match result modal ── */}
      <Modal
        visible={!!matchModal}
        animationType="slide"
        transparent
        onRequestClose={() => setMatchModal(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            {matchModal &&
              (() => {
                const h = getPlayer(matchModal.homePlayerId);
                const a = getPlayer(matchModal.awayPlayerId);
                const ht = h ? getTeamById(h.teamId) : null;
                const at = a ? getTeamById(a.teamId) : null;
                return (
                  <>
                    <Text style={styles.modalTitle}>Registrar Resultado</Text>
                    {matchModal.leg && (
                      <Text style={styles.modalLeg}>
                        {matchModal.leg === 1 ? "IDA" : "VUELTA"}
                      </Text>
                    )}
                    <View style={styles.modalTeams}>
                      <View style={styles.modalTeam}>
                        <Text style={styles.modalNick} numberOfLines={1}>
                          {h?.nickname ?? "—"}
                        </Text>
                        <View style={styles.modalTeamNameRow}>
                          <TeamBadge team={ht} size={20} />
                          <Text style={styles.modalTeamName} numberOfLines={1}>
                            {ht?.shortName}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.modalScoreInputs}>
                        <TextInput
                          style={styles.scoreInput}
                          keyboardType="number-pad"
                          value={homeGoals}
                          onChangeText={setHomeGoals}
                          maxLength={2}
                          placeholder="0"
                          placeholderTextColor={UCL.textMuted}
                          textAlign="center"
                        />
                        <Text style={styles.scoreDash}>-</Text>
                        <TextInput
                          style={styles.scoreInput}
                          keyboardType="number-pad"
                          value={awayGoals}
                          onChangeText={setAwayGoals}
                          maxLength={2}
                          placeholder="0"
                          placeholderTextColor={UCL.textMuted}
                          textAlign="center"
                        />
                      </View>
                      <View style={styles.modalTeam}>
                        <Text style={styles.modalNick} numberOfLines={1}>
                          {a?.nickname ?? "—"}
                        </Text>
                        <View style={styles.modalTeamNameRow}>
                          <TeamBadge team={at} size={20} />
                          <Text style={styles.modalTeamName} numberOfLines={1}>
                            {at?.shortName}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {/* Goal scorers + goalkeeper selectors */}
                    <View style={styles.scorersSection}>
                      <Text style={styles.scorersLabel}>
                        PORTERO · {h?.nickname ?? ""}
                      </Text>
                      <TouchableOpacity
                        style={styles.selectorBtn}
                        onPress={() =>
                          setPickerState({ side: "home", mode: "goalkeeper" })
                        }
                      >
                        <Text style={styles.selectorBtnText} numberOfLines={1}>
                          {homeGoalkeeper ?? "Seleccionar portero"}
                        </Text>
                      </TouchableOpacity>

                      <Text style={[styles.scorersLabel, { marginTop: 8 }]}>
                        GOLEADORES · {h?.nickname ?? ""} ({homeScorers.length}/
                        {homeGoals || 0})
                      </Text>
                      <TouchableOpacity
                        style={styles.selectorBtn}
                        onPress={() =>
                          setPickerState({ side: "home", mode: "scorer" })
                        }
                      >
                        <Text style={styles.selectorBtnText}>
                          Agregar goleador
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.selectorSummary} numberOfLines={2}>
                        {homeScorers.length > 0
                          ? homeScorers.join(", ")
                          : "Sin goleadores seleccionados"}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removeLastScorer("home")}
                      >
                        <Text style={styles.removeText}>Quitar último</Text>
                      </TouchableOpacity>

                      <Text style={[styles.scorersLabel, { marginTop: 12 }]}>
                        PORTERO · {a?.nickname ?? ""}
                      </Text>
                      <TouchableOpacity
                        style={styles.selectorBtn}
                        onPress={() =>
                          setPickerState({ side: "away", mode: "goalkeeper" })
                        }
                      >
                        <Text style={styles.selectorBtnText} numberOfLines={1}>
                          {awayGoalkeeper ?? "Seleccionar portero"}
                        </Text>
                      </TouchableOpacity>

                      <Text style={[styles.scorersLabel, { marginTop: 8 }]}>
                        GOLEADORES · {a?.nickname ?? ""} ({awayScorers.length}/
                        {awayGoals || 0})
                      </Text>
                      <TouchableOpacity
                        style={styles.selectorBtn}
                        onPress={() =>
                          setPickerState({ side: "away", mode: "scorer" })
                        }
                      >
                        <Text style={styles.selectorBtnText}>
                          Agregar goleador
                        </Text>
                      </TouchableOpacity>
                      <Text style={styles.selectorSummary} numberOfLines={2}>
                        {awayScorers.length > 0
                          ? awayScorers.join(", ")
                          : "Sin goleadores seleccionados"}
                      </Text>
                      <TouchableOpacity
                        onPress={() => removeLastScorer("away")}
                      >
                        <Text style={styles.removeText}>Quitar último</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.forfeitActions}>
                      <TouchableOpacity
                        style={styles.forfeitBtn}
                        onPress={() => saveForfeit("home")}
                      >
                        <Text style={styles.forfeitBtnText}>
                          LOCAL NO SE PRESENTÓ
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.forfeitBtn}
                        onPress={() => saveForfeit("away")}
                      >
                        <Text style={styles.forfeitBtnText}>
                          VISITANTE NO SE PRESENTÓ
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.modalActions}>
                      <TouchableOpacity
                        style={styles.modalCancel}
                        onPress={() => setMatchModal(null)}
                      >
                        <Text style={styles.modalCancelText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.modalSave}
                        onPress={saveResult}
                      >
                        <Text style={styles.modalSaveText}>GUARDAR</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                );
              })()}
          </View>
        </View>
      </Modal>

      {/* Squad picker modal */}
      <Modal
        visible={!!pickerState}
        transparent
        animationType="none"
        onRequestClose={() => {
          setSearchTerm("");
          setPickerState(null);
        }}
      >
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>
              {pickerState?.mode === "goalkeeper"
                ? "Seleccionar Portero"
                : "Seleccionar Goleador"}
            </Text>
            <TextInput
              style={styles.pickerSearch}
              value={searchTerm}
              onChangeText={setSearchTerm}
              placeholder="Buscar jugador..."
              placeholderTextColor={UCL.textMuted}
              autoCapitalize="words"
            />
            <FlatList
              data={pagedPickerPlayers}
              keyExtractor={(sp) => sp.id || sp.name}
              style={styles.pickerList}
              initialNumToRender={PICKER_PAGE_SIZE}
              maxToRenderPerBatch={PICKER_PAGE_SIZE}
              windowSize={5}
              removeClippedSubviews
              onEndReachedThreshold={0.4}
              onEndReached={() => {
                if (pickerPageSize < pickerPlayers.length) {
                  setPickerPageSize((prev) => prev + PICKER_PAGE_SIZE);
                }
              }}
              ListEmptyComponent={
                <Text style={styles.pickerEmptyText}>Sin resultados</Text>
              }
              ListFooterComponent={
                pickerPageSize < pickerPlayers.length ? (
                  <Text style={styles.pickerLoadingMore}>
                    Cargando más jugadores…
                  </Text>
                ) : null
              }
              renderItem={({ item: sp }) => (
                <PickerRow
                  sp={sp}
                  playerId={
                    (pickerState?.side === "home"
                      ? matchModal?.homePlayerId
                      : matchModal?.awayPlayerId) ?? ""
                  }
                  onSelect={(card, selectedSp) => {
                    const selectedName = card.name || selectedSp.name;
                    if (!pickerState) return;
                    if (pickerState.mode === "goalkeeper") {
                      if (pickerState.side === "home")
                        setHomeGoalkeeper(selectedName);
                      else setAwayGoalkeeper(selectedName);
                    } else {
                      addScorer(pickerState.side, selectedName);
                    }
                    setSearchTerm("");
                    setPickerState(null);
                  }}
                />
              )}
            />
            <TouchableOpacity
              onPress={() => {
                setSearchTerm("");
                setPickerState(null);
              }}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const PickerRow = React.memo(function PickerRow({
  sp,
  playerId,
  onSelect,
}: {
  sp: SquadPlayer;
  playerId: string;
  onSelect: (card: ReturnType<typeof getPlayerVisual>, sp: SquadPlayer) => void;
}) {
  const card = getPlayerVisual(playerId, sp.name);

  return (
    <TouchableOpacity
      style={styles.pickerRow}
      onPress={() => onSelect(card, sp)}
    >
      <View style={styles.pickerAvatarWrap}>
        {card.photo ? (
          <Image
            source={{ uri: card.photo }}
            style={styles.pickerAvatar}
            contentFit="cover"
          />
        ) : (
          <View style={styles.pickerAvatarFallback}>
            <Text style={styles.pickerAvatarText}>
              {card.name.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.pickerMeta}>
        <Text style={styles.pickerName} numberOfLines={1}>
          {card.name || sp.name}
        </Text>
        <Text style={styles.pickerPos}>
          {card.number ? `#${card.number} · ` : ""}
          {card.position || sp.position || "Jugador"}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

function MatchRow({
  match,
  label,
  getPlayer,
  onPress,
}: {
  match: Match;
  label?: string;
  getPlayer: (id: string) => Player | undefined;
  onPress: (m: Match) => void;
}) {
  const hp = getPlayer(match.homePlayerId);
  const ap = getPlayer(match.awayPlayerId);
  const ht = hp ? getTeamById(hp.teamId) : null;
  const at = ap ? getTeamById(ap.teamId) : null;
  const done = match.status === "completed";

  return (
    <TouchableOpacity
      style={matchRowStyles.touch}
      onPress={() => onPress(match)}
    >
      {label && <Text style={matchRowStyles.label}>{label}</Text>}
      <LinearGradient
        colors={done ? ["#203252", "#1B2A46"] : ["#1B2943", "#17243A"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[matchRowStyles.row, done && matchRowStyles.rowDone]}
      >
        <View style={matchRowStyles.teams}>
          <View style={matchRowStyles.teamCol}>
            <View style={matchRowStyles.team}>
              <TeamBadge team={ht} size={22} />
              <Text style={matchRowStyles.nick} numberOfLines={1}>
                {hp?.nickname ?? "?"}
              </Text>
            </View>
          </View>
          <View style={matchRowStyles.scoreBox}>
            {done ? (
              <Text style={matchRowStyles.scoreText}>
                {match.homeScore} - {match.awayScore}
              </Text>
            ) : (
              <Text style={matchRowStyles.pendingText}>VS</Text>
            )}
          </View>
          <View style={[matchRowStyles.teamCol, matchRowStyles.teamColRight]}>
            <View style={matchRowStyles.teamRightWrap}>
              <TeamBadge team={at} size={22} />
              <Text
                style={[matchRowStyles.nick, matchRowStyles.nickRight]}
                numberOfLines={1}
              >
                {ap?.nickname ?? "?"}
              </Text>
            </View>
          </View>
        </View>
        {!done && (
          <Text style={matchRowStyles.tapHint}>Toca para registrar</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
}

function TiePlayers({
  p1,
  p2,
  editMode = false,
  selectedPlayerId = null,
  onSelectPlayer,
}: {
  p1?: Player;
  p2?: Player;
  editMode?: boolean;
  selectedPlayerId?: string | null;
  onSelectPlayer?: (playerId: string) => void;
}) {
  if (!p1 && !p2) return null;
  const t1 = p1 ? getTeamById(p1.teamId) : null;
  const t2 = p2 ? getTeamById(p2.teamId) : null;

  return (
    <View style={tiePStyles.row}>
      <TouchableOpacity
        activeOpacity={editMode && p1 ? 0.6 : 1}
        disabled={!editMode || !p1}
        onPress={() => p1 && onSelectPlayer?.(p1.id)}
        style={[
          tiePStyles.player,
          editMode &&
            p1 &&
            selectedPlayerId === p1.id &&
            tiePStyles.playerSelected,
        ]}
      >
        <TeamBadge team={t1} size={44} />
        <Text style={tiePStyles.nick}>{p1?.nickname ?? "—"}</Text>
      </TouchableOpacity>
      <Text style={tiePStyles.vs}>VS</Text>
      <TouchableOpacity
        activeOpacity={editMode && p2 ? 0.6 : 1}
        disabled={!editMode || !p2}
        onPress={() => p2 && onSelectPlayer?.(p2.id)}
        style={[
          tiePStyles.player,
          tiePStyles.playerRight,
          editMode &&
            p2 &&
            selectedPlayerId === p2.id &&
            tiePStyles.playerSelected,
        ]}
      >
        <TeamBadge team={t2} size={44} />
        <Text style={tiePStyles.nick}>{p2?.nickname ?? "—"}</Text>
      </TouchableOpacity>
    </View>
  );
}

function TieAggregate({
  tie,
  leg1,
  leg2,
  getPlayer,
}: {
  tie: KnockoutTie;
  leg1: Match;
  leg2: Match;
  getPlayer: (id: string) => Player | undefined;
}) {
  const [penaltyOpen, setPenaltyOpen] = useState(false);
  const recordPenalties = useTournamentStore((s) => s.recordPenalties);

  const agg1 = (leg1.homeScore ?? 0) + (leg2.awayScore ?? 0);
  const agg2 = (leg1.awayScore ?? 0) + (leg2.homeScore ?? 0);
  const p1 = getPlayer(tie.player1Id ?? "");
  const p2 = getPlayer(tie.player2Id ?? "");
  const isDrawn = agg1 === agg2;
  const penaltyWinner = tie.penaltyWinnerId
    ? getPlayer(tie.penaltyWinnerId)
    : null;

  const winnerName = !isDrawn
    ? ((agg1 > agg2 ? p1?.nickname : p2?.nickname) ?? null)
    : (penaltyWinner?.nickname ?? null);

  return (
    <View style={aggStyles.box}>
      <Text style={aggStyles.label}>GLOBAL</Text>
      <Text style={aggStyles.score}>
        {p1?.nickname ?? "—"}: {agg1} — {p2?.nickname ?? "—"}: {agg2}
      </Text>

      {winnerName && !isDrawn && (
        <Text style={aggStyles.winner}>🏆 Clasificado: {winnerName}</Text>
      )}
      {winnerName && isDrawn && (
        <Text style={aggStyles.winner}>
          🏆 Clasificado por penales: {winnerName}
        </Text>
      )}

      {isDrawn && !penaltyWinner && !penaltyOpen && (
        <>
          <Text style={aggStyles.draw}>
            ⚠ Empate global — se define por penales
          </Text>
          <TouchableOpacity
            style={aggStyles.penaltyBtn}
            onPress={() => setPenaltyOpen(true)}
          >
            <Text style={aggStyles.penaltyBtnText}>🎯 DEFINIR POR PENALES</Text>
          </TouchableOpacity>
        </>
      )}

      {isDrawn && !penaltyWinner && penaltyOpen && (
        <View style={aggStyles.penaltyPicker}>
          <Text style={aggStyles.penaltyQuestion}>¿Quién gana la tanda?</Text>
          {[p1, p2].filter(Boolean).map((p) => (
            <TouchableOpacity
              key={p!.id}
              style={aggStyles.penaltyPlayerBtn}
              onPress={() => {
                recordPenalties(tie.id, p!.id);
                setPenaltyOpen(false);
              }}
            >
              <Text style={aggStyles.penaltyPlayerText}>🏆 {p!.nickname}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setPenaltyOpen(false)}>
            <Text style={aggStyles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const matchRowStyles = StyleSheet.create({
  touch: { marginBottom: 8 },
  row: {
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: UCL.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 5,
  },
  rowDone: { borderColor: UCL.win + "40" },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: UCL.gold,
    letterSpacing: 1,
    marginBottom: 6,
  },
  teams: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  teamCol: { width: 124 },
  teamColRight: { alignItems: "flex-end" },
  team: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamRightWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  nick: {
    fontSize: 12,
    fontWeight: "700",
    color: UCL.textPrimary,
    maxWidth: 94,
  },
  nickRight: { textAlign: "right", maxWidth: 94 },
  scoreBox: { width: 56, alignItems: "center", justifyContent: "center" },
  scoreText: { fontSize: 16, fontWeight: "900", color: UCL.textPrimary },
  pendingText: {
    fontSize: 13,
    fontWeight: "800",
    color: UCL.textMuted,
    letterSpacing: 1.1,
  },
  tapHint: {
    fontSize: 10,
    color: UCL.textMuted,
    textAlign: "center",
    marginTop: 6,
  },
});

const tiePStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  player: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    borderRadius: 8,
    paddingVertical: 4,
  },
  playerRight: {},
  playerSelected: {
    backgroundColor: "rgba(255, 215, 0, 0.18)",
    borderWidth: 1,
    borderColor: UCL.gold,
  },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  nick: {
    fontSize: 13,
    fontWeight: "700",
    color: UCL.textPrimary,
    textAlign: "center",
  },
  vs: {
    fontSize: 12,
    fontWeight: "900",
    color: UCL.textMuted,
    marginHorizontal: 8,
  },
});

const aggStyles = StyleSheet.create({
  box: {
    backgroundColor: UCL.bg,
    borderRadius: 8,
    padding: 10,
    marginTop: 4,
    borderWidth: 1,
    borderColor: UCL.borderLight,
    alignItems: "center",
  },
  label: {
    fontSize: 10,
    fontWeight: "700",
    color: UCL.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  score: {
    fontSize: 14,
    fontWeight: "700",
    color: UCL.textPrimary,
    marginBottom: 4,
  },
  winner: { fontSize: 12, color: UCL.win, fontWeight: "700" },
  draw: { fontSize: 12, color: UCL.draw, fontWeight: "600" },
  penaltyBtn: {
    marginTop: 8,
    backgroundColor: UCL.gold + "22",
    borderWidth: 1,
    borderColor: UCL.gold + "80",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  penaltyBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: UCL.gold,
    letterSpacing: 0.5,
  },
  penaltyPicker: { width: "100%", marginTop: 8, gap: 8 },
  penaltyQuestion: {
    fontSize: 11,
    fontWeight: "700",
    color: UCL.textMuted,
    textAlign: "center",
    marginBottom: 4,
  },
  penaltyPlayerBtn: {
    backgroundColor: UCL.bgCardAlt,
    borderWidth: 1,
    borderColor: UCL.borderLight,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  penaltyPlayerText: {
    fontSize: 13,
    fontWeight: "800",
    color: UCL.textPrimary,
  },
  cancelText: {
    fontSize: 11,
    color: UCL.textMuted,
    textAlign: "center",
    marginTop: 4,
  },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UCL.bg },
  pageBg: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 48 },
  brandHeader: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UCL.border,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.33,
    shadowRadius: 15,
    elevation: 8,
  },
  brandLogo: { width: 42, height: 42 },
  brandTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: UCL.gold,
    letterSpacing: 1.3,
  },
  brandSubtitle: {
    fontSize: 12,
    color: "#DDE8FF",
    marginTop: 1,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  emptyEmoji: { fontSize: 64 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: UCL.textSecondary },
  ctaBtn: {
    backgroundColor: UCL.gold,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  ctaBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#000",
    letterSpacing: 1,
  },

  phaseBanner: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 11,
    elevation: 6,
  },
  phaseBannerText: {
    fontSize: 13,
    fontWeight: "800",
    color: UCL.gold,
    letterSpacing: 2,
  },

  editDrawBtn: {
    borderWidth: 1,
    borderColor: UCL.border,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: "center",
    marginBottom: 16,
  },
  editDrawBtnActive: {
    borderColor: UCL.gold,
    backgroundColor: "rgba(255, 215, 0, 0.12)",
  },
  editDrawBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: UCL.textSecondary,
    letterSpacing: 0.3,
  },

  // Sub-tabs
  subTabBar: {
    flexDirection: "row",
    backgroundColor: UCL.bgCard,
    borderRadius: 10,
    padding: 3,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: UCL.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 4,
  },
  subTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: "center",
    borderRadius: 8,
  },
  subTabActive: {
    backgroundColor: UCL.blue,
  },
  subTabText: {
    fontSize: 12,
    fontWeight: "700",
    color: UCL.textMuted,
    letterSpacing: 0.5,
  },
  subTabTextActive: {
    color: UCL.gold,
  },

  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: UCL.textSecondary,
    letterSpacing: 2,
    marginBottom: 12,
  },

  // Table
  table: {
    backgroundColor: UCL.bgCard,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: UCL.border,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 5,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: UCL.blue,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  th: {
    width: 28,
    textAlign: "center",
    fontSize: 10,
    fontWeight: "700",
    color: UCL.gold,
  },
  thPlayer: { flex: 1, textAlign: "left" },
  thPts: { color: UCL.gold },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: UCL.border,
    alignItems: "center",
  },
  tableRowQ: { backgroundColor: UCL.gold + "08" },
  tableRowSelected: {
    backgroundColor: "rgba(255, 215, 0, 0.18)",
    borderTopColor: UCL.gold,
  },
  tdPlayer: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  posCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  posNum: { fontSize: 10, fontWeight: "800" },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  tdName: { fontSize: 12, fontWeight: "600", color: UCL.textPrimary, flex: 1 },
  td: {
    width: 28,
    textAlign: "center",
    fontSize: 12,
    color: UCL.textSecondary,
  },
  tdPts: { fontWeight: "800", color: UCL.textPrimary },
  matchesLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: UCL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 6,
  },

  // Tie card
  tieCard: {
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: UCL.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 7,
  },
  tieLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: UCL.gold,
    letterSpacing: 1,
    marginBottom: 10,
  },
  tbdText: {
    fontSize: 13,
    color: UCL.textMuted,
    fontStyle: "italic",
    textAlign: "center",
  },

  advanceBtn: {
    backgroundColor: UCL.blueLight,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 5,
  },
  advanceBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 1,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "#00000080",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: UCL.bgCard,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderColor: UCL.border,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: UCL.textPrimary,
    textAlign: "center",
    marginBottom: 4,
  },
  modalLeg: {
    fontSize: 11,
    fontWeight: "700",
    color: UCL.gold,
    textAlign: "center",
    letterSpacing: 1.5,
    marginBottom: 20,
  },
  modalTeams: { flexDirection: "row", alignItems: "center", marginBottom: 24 },
  modalTeam: { flex: 1, alignItems: "center", gap: 4 },
  modalNick: {
    fontSize: 15,
    fontWeight: "800",
    color: UCL.textPrimary,
    textAlign: "center",
  },
  modalTeamName: {
    fontSize: 11,
    color: UCL.textSecondary,
    textAlign: "center",
  },
  modalTeamNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  modalScoreInputs: { flexDirection: "row", alignItems: "center", gap: 8 },
  scoreInput: {
    width: 56,
    height: 56,
    backgroundColor: UCL.bgInput,
    borderRadius: 12,
    fontSize: 28,
    fontWeight: "800",
    color: UCL.textPrimary,
    borderWidth: 1,
    borderColor: UCL.borderLight,
    textAlign: "center",
  },
  scoreDash: { fontSize: 22, color: UCL.textMuted, fontWeight: "800" },
  modalActions: { flexDirection: "row", gap: 12 },
  modalCancel: {
    flex: 1,
    borderWidth: 1,
    borderColor: UCL.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalCancelText: {
    fontSize: 14,
    color: UCL.textSecondary,
    fontWeight: "600",
  },
  modalSave: {
    flex: 2,
    backgroundColor: UCL.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  modalSaveText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#000",
    letterSpacing: 1,
  },

  // Goal scorers section in match modal
  scorersSection: {
    marginTop: 16,
    gap: 4,
  },
  scorersLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: UCL.textMuted,
    letterSpacing: 1,
    marginBottom: 2,
  },
  scorersInput: {
    backgroundColor: UCL.bgInput,
    borderWidth: 1,
    borderColor: UCL.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: UCL.textPrimary,
  },
  selectorBtn: {
    backgroundColor: UCL.bgInput,
    borderWidth: 1,
    borderColor: UCL.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectorBtnText: {
    fontSize: 12,
    color: UCL.textPrimary,
    fontWeight: "600",
  },
  selectorSummary: {
    fontSize: 11,
    color: UCL.textSecondary,
    marginTop: 6,
  },
  removeText: {
    fontSize: 11,
    color: UCL.draw,
    marginTop: 4,
    fontWeight: "700",
  },
  forfeitActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 18,
    marginBottom: 14,
  },
  forfeitBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: UCL.draw + "80",
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: "center",
  },
  forfeitBtnText: {
    fontSize: 9,
    fontWeight: "800",
    color: UCL.draw,
    textAlign: "center",
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "#00000080",
    justifyContent: "center",
    padding: 24,
  },
  pickerBox: {
    backgroundColor: UCL.bgCard,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UCL.border,
    padding: 14,
  },
  pickerTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: UCL.gold,
    marginBottom: 10,
  },
  pickerSearch: {
    backgroundColor: UCL.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UCL.border,
    color: UCL.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    marginBottom: 12,
  },
  pickerList: { maxHeight: 340 },
  pickerEmptyText: {
    fontSize: 12,
    color: UCL.textMuted,
    textAlign: "center",
    paddingVertical: 16,
  },
  pickerLoadingMore: {
    fontSize: 11,
    color: UCL.textMuted,
    textAlign: "center",
    paddingVertical: 10,
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: UCL.border,
  },
  pickerAvatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: "hidden",
    backgroundColor: UCL.bgCardAlt,
    borderWidth: 1,
    borderColor: UCL.border,
  },
  pickerAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  pickerAvatarFallback: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: UCL.blue,
    alignItems: "center",
    justifyContent: "center",
  },
  pickerAvatarText: {
    color: "#fff",
    fontSize: 9,
    fontWeight: "800",
  },
  pickerMeta: {
    flex: 1,
  },
  pickerName: {
    fontSize: 13,
    color: UCL.textPrimary,
    fontWeight: "700",
  },
  pickerPos: {
    fontSize: 11,
    color: UCL.textSecondary,
    marginTop: 2,
  },
  cancelText: {
    fontSize: 11,
    color: UCL.textMuted,
    textAlign: "center",
    marginTop: 10,
  },
});
