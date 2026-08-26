import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  FlatList,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useTournamentStore } from "@/store/tournament";
import { UCL } from "@/constants/theme";
import { UCL_TEAMS, getTeamById } from "@/constants/teams";
import { formatDescription } from "@/store/tournament";
import { TeamBadge } from "@/components/team-badge";
import { TournamentEdition } from "@/constants/types";

const PHASE_LABEL: Record<string, string> = {
  groups: "Fase de grupos",
  knockout: "Eliminatorias",
  finished: "Edicion finalizada",
};

export default function HomeScreen() {
  const tournaments = useTournamentStore((s) => s.tournaments);
  const tournament = useTournamentStore((s) => s.tournament);
  const editions = useTournamentStore((s) => s.editions);
  const reset = useTournamentStore((s) => s.resetTournament);
  const startNextEdition = useTournamentStore((s) => s.startNextEdition);
  const setActiveTournament = useTournamentStore((s) => s.setActiveTournament);
  const deleteTournament = useTournamentStore((s) => s.deleteTournament);
  const addManualEdition = useTournamentStore((s) => s.addManualEdition);
  const updateEdition = useTournamentStore((s) => s.updateEdition);
  const deleteEdition = useTournamentStore((s) => s.deleteEdition);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);

  const sortedEditions = [...editions].sort(
    (a, b) => b.editionNumber - a.editionNumber,
  );
  const latestEdition = sortedEditions[0] ?? null;

  const titlesByTeam = editions.reduce<Record<string, number>>((acc, ed) => {
    acc[ed.championTeamId] = (acc[ed.championTeamId] ?? 0) + 1;
    return acc;
  }, {});

  const palmares = Object.entries(titlesByTeam)
    .map(([teamId, titles]) => ({ teamId, titles }))
    .sort((a, b) => b.titles - a.titles);

  function handleReset() {
    Alert.alert(
      "Reiniciar Torneo",
      "¿Estás seguro? Se perderán todos los resultados.",
      [
        { text: "Cancelar", style: "cancel" },
        { text: "Reiniciar", style: "destructive", onPress: reset },
      ],
    );
  }

  function handleDeleteTournament(id: string) {
    Alert.alert(
      "Eliminar torneo",
      "¿Seguro que quieres eliminar este torneo? No quedará registrado en el historial.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => deleteTournament(id),
        },
      ],
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
          {/* ── Header ── */}
          <LinearGradient
            colors={["#173E97", "#0F2E76"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.header}
          >
            <Image
              source={require("@/assets/images/ucl-logo-no-text-white.png")}
              style={styles.headerLogo}
              contentFit="contain"
            />
            <Text style={styles.headerTitle}>UEFA Champions League</Text>
            <Text style={styles.headerSubtitle}>FC 26</Text>
          </LinearGradient>

          {/* ── Hall of fame / current champion ── */}
          {latestEdition && (
            <LinearGradient
              colors={["#18243F", "#121B30"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.historyCard}
            >
              <Text style={styles.historyTitle}>VIGENTE CAMPEÓN</Text>
              <View style={styles.championRow}>
                <TeamBadge
                  team={getTeamById(latestEdition.championTeamId)}
                  size={26}
                  titles={titlesByTeam[latestEdition.championTeamId] ?? 0}
                />
                <Text style={styles.championText}>
                  {getTeamById(latestEdition.championTeamId)?.name ??
                    latestEdition.championTeamId}
                </Text>
                <Text style={styles.championEdition}>
                  Edición #{latestEdition.editionNumber}
                </Text>
              </View>

              <Text style={styles.historySubTitle}>SUBCAMPEÓN</Text>
              <View style={styles.championRow}>
                <TeamBadge
                  team={getTeamById(latestEdition.runnerUpTeamId)}
                  size={20}
                />
                <Text style={styles.runnerText}>
                  {getTeamById(latestEdition.runnerUpTeamId)?.name ??
                    latestEdition.runnerUpTeamId}
                </Text>
              </View>

              <Text style={styles.historySubTitle}>PREMIOS VIGENTES</Text>
              <Text style={styles.historyLine}>
                👟 Bota de Oro: {latestEdition.awards.goldenBootName ?? "—"}
              </Text>
              <Text style={styles.historyLine}>
                🥅 Guante de Oro: {latestEdition.awards.goldenGloveName ?? "—"}
              </Text>
              <Text style={styles.historyLine}>
                🏆 Balón de Oro:{" "}
                {latestEdition.awards.goldenBallManagerName ?? "—"}
              </Text>

              <View style={styles.historySubTitleRow}>
                <Text style={styles.historySubTitle}>PALMARÉS (CHAMPIONS)</Text>
                <TouchableOpacity onPress={() => router.push("/palmares")}>
                  <Text style={styles.editHistoryLink}>Ver todo →</Text>
                </TouchableOpacity>
              </View>
              {palmares.slice(0, 8).map((row) => {
                const team = getTeamById(row.teamId);
                return (
                  <View key={row.teamId} style={styles.palmaresRow}>
                    <View style={styles.palmaresTeam}>
                      <TeamBadge team={team} size={18} titles={row.titles} />
                      <Text style={styles.palmaresName} numberOfLines={1}>
                        {team?.name ?? row.teamId}
                      </Text>
                    </View>
                    <Text style={styles.palmaresCount}>
                      {row.titles} {row.titles === 1 ? "título" : "títulos"}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.historySubTitleRow}>
                <Text style={styles.historySubTitle}>
                  HISTÓRICO DE EDICIONES
                </Text>
                <TouchableOpacity onPress={() => setHistoryModalOpen(true)}>
                  <Text style={styles.editHistoryLink}>✏️ Editar</Text>
                </TouchableOpacity>
              </View>
              {sortedEditions.slice(0, 8).map((ed) => (
                <Text key={ed.id} style={styles.historyLine}>
                  #{ed.editionNumber} ·{" "}
                  {getTeamById(ed.championTeamId)?.shortName ??
                    ed.championTeamId}{" "}
                  campeón vs{" "}
                  {getTeamById(ed.runnerUpTeamId)?.shortName ??
                    ed.runnerUpTeamId}
                </Text>
              ))}
            </LinearGradient>
          )}

          {tournaments.length > 0 && (
            <LinearGradient
              colors={["#18243F", "#111B31"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.historyCard}
            >
              <Text style={styles.historyTitle}>TORNEOS ACTIVOS</Text>
              {tournaments.map((item) => (
                <View
                  key={item.id}
                  style={[
                    styles.playerChip,
                    styles.tournamentRow,
                    tournament?.id === item.id &&
                      styles.activeTournamentSelector,
                  ]}
                >
                  <TouchableOpacity
                    style={styles.tournamentRowInfo}
                    onPress={() => setActiveTournament(item.id)}
                  >
                    <Text style={styles.playerChipName} numberOfLines={1}>
                      {formatDescription(item.players.length)}
                    </Text>
                    <Text style={styles.playerChipTeam}>
                      {item.phase === "groups"
                        ? "Fase de grupos"
                        : item.phase === "knockout"
                          ? "Eliminatorias"
                          : "Finalizado"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.tournamentDeleteBtn}
                    onPress={() => handleDeleteTournament(item.id)}
                  >
                    <Text style={styles.tournamentDeleteBtnText}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity
                style={styles.newTournamentBtn}
                onPress={() => router.push("/setup")}
              >
                <Text style={styles.newTournamentBtnText}>
                  + CREAR NUEVO TORNEO
                </Text>
              </TouchableOpacity>
            </LinearGradient>
          )}

          {tournament ? (
            <>
              {/* ── Active tournament card ── */}
              <LinearGradient
                colors={["#18243F", "#111B31"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.activeCard}
              >
                <View style={styles.activeBadge}>
                  <Text style={styles.activeBadgeText}>EN CURSO</Text>
                </View>
                <Text style={styles.activeFormat}>
                  {formatDescription(tournament.players.length)}
                </Text>
                <Text style={styles.activePhase}>
                  {tournament.phase === "groups"
                    ? "🗂️ " + PHASE_LABEL[tournament.phase]
                    : tournament.phase === "knockout"
                      ? "🧭 " + PHASE_LABEL[tournament.phase]
                      : "✅ " + PHASE_LABEL[tournament.phase]}
                </Text>

                <View style={styles.divider} />

                {/* Players summary */}
                <Text style={styles.sectionLabel}>PARTICIPANTES</Text>
                <View style={styles.playerGrid}>
                  {tournament.players.map((p) => {
                    const team = getTeamById(p.teamId);
                    return (
                      <View key={p.id} style={styles.playerChip}>
                        <TeamBadge team={team} size={22} />
                        <Text style={styles.playerChipName} numberOfLines={1}>
                          {p.nickname}
                        </Text>
                        <Text style={styles.playerChipTeam}>
                          {team?.shortName ?? "—"}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.divider} />

                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => router.push("/(tabs)/tournament")}
                >
                  <Text style={styles.primaryBtnText}>IR AL TORNEO</Text>
                </TouchableOpacity>

                {tournament.phase === "finished" && (
                  <TouchableOpacity
                    style={[styles.primaryBtn, styles.nextEditionBtn]}
                    onPress={() => {
                      startNextEdition();
                      router.push("/setup");
                    }}
                  >
                    <Text style={styles.primaryBtnText}>
                      + NUEVA EDICIÓN (SETUP)
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.ghostBtn} onPress={handleReset}>
                  <Text style={styles.ghostBtnText}>Reiniciar torneo</Text>
                </TouchableOpacity>
              </LinearGradient>
            </>
          ) : (
            <>
              {/* ── Empty state ── */}
              <View style={styles.trophyContainer}>
                <Image
                  source={require("@/assets/images/ucl-logo-no-text-blue.png")}
                  style={styles.emptyLogo}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.emptyTitle}>Sin Torneo Activo</Text>
              <Text style={styles.emptySubtitle}>
                Junta a tus amigos, elige vuestros equipos de Champions y haz el
                sorteo.
              </Text>

              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => router.push("/setup")}
              >
                <Text style={styles.primaryBtnText}>CREAR NUEVO TORNEO</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </LinearGradient>

      <EditionsModal
        visible={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        editions={sortedEditions}
        addManualEdition={addManualEdition}
        updateEdition={updateEdition}
        deleteEdition={deleteEdition}
      />
    </SafeAreaView>
  );
}

type EditionFormState = {
  id: string | null;
  editionNumber: string;
  championTeamId: string;
  runnerUpTeamId: string;
  goldenBootName: string;
  goldenGloveName: string;
  goldenBallManagerName: string;
};

const emptyEditionForm: EditionFormState = {
  id: null,
  editionNumber: "",
  championTeamId: "",
  runnerUpTeamId: "",
  goldenBootName: "",
  goldenGloveName: "",
  goldenBallManagerName: "",
};

function EditionsModal({
  visible,
  onClose,
  editions,
  addManualEdition,
  updateEdition,
  deleteEdition,
}: {
  visible: boolean;
  onClose: () => void;
  editions: TournamentEdition[];
  addManualEdition: (input: {
    editionNumber: number;
    championTeamId: string;
    runnerUpTeamId: string;
    goldenBootName?: string | null;
    goldenGloveName?: string | null;
    goldenBallManagerName?: string | null;
  }) => void;
  updateEdition: (
    id: string,
    patch: {
      editionNumber?: number;
      championTeamId?: string;
      runnerUpTeamId?: string;
      goldenBootName?: string | null;
      goldenGloveName?: string | null;
      goldenBallManagerName?: string | null;
    },
  ) => void;
  deleteEdition: (id: string) => void;
}) {
  const [form, setForm] = useState<EditionFormState | null>(null);
  const [teamPickerFor, setTeamPickerFor] = useState<
    "champion" | "runnerUp" | null
  >(null);
  const [teamSearch, setTeamSearch] = useState("");

  function close() {
    setForm(null);
    setTeamPickerFor(null);
    setTeamSearch("");
    onClose();
  }

  function startCreate() {
    const nextNumber =
      editions.reduce((max, e) => Math.max(max, e.editionNumber), 0) + 1;
    setForm({ ...emptyEditionForm, editionNumber: String(nextNumber) });
  }

  function startEdit(ed: TournamentEdition) {
    setForm({
      id: ed.id,
      editionNumber: String(ed.editionNumber),
      championTeamId: ed.championTeamId,
      runnerUpTeamId: ed.runnerUpTeamId,
      goldenBootName: ed.awards.goldenBootName ?? "",
      goldenGloveName: ed.awards.goldenGloveName ?? "",
      goldenBallManagerName: ed.awards.goldenBallManagerName ?? "",
    });
  }

  function handleDelete(id: string) {
    Alert.alert(
      "Eliminar edición",
      "¿Seguro que quieres eliminar esta edición del historial?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Eliminar",
          style: "destructive",
          onPress: () => deleteEdition(id),
        },
      ],
    );
  }

  function handleSave() {
    if (!form) return;
    const editionNumber = parseInt(form.editionNumber, 10);
    if (!form.championTeamId || !form.runnerUpTeamId) {
      Alert.alert("Faltan equipos", "Selecciona campeón y subcampeón.");
      return;
    }
    if (Number.isNaN(editionNumber) || editionNumber < 1) {
      Alert.alert("Edición inválida", "Introduce un número de edición válido.");
      return;
    }
    const payload = {
      editionNumber,
      championTeamId: form.championTeamId,
      runnerUpTeamId: form.runnerUpTeamId,
      goldenBootName: form.goldenBootName.trim() || null,
      goldenGloveName: form.goldenGloveName.trim() || null,
      goldenBallManagerName: form.goldenBallManagerName.trim() || null,
    };
    if (form.id) {
      updateEdition(form.id, payload);
    } else {
      addManualEdition(payload);
    }
    setForm(null);
  }

  const filteredTeams = UCL_TEAMS.filter(
    (t) =>
      teamSearch === "" ||
      t.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
      t.shortName.toLowerCase().includes(teamSearch.toLowerCase()),
  ).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={close}
    >
      <SafeAreaView style={editionModalStyles.safe}>
        <View style={editionModalStyles.header}>
          <Text style={editionModalStyles.title}>
            {teamPickerFor
              ? "Elegir equipo"
              : form
                ? form.id
                  ? "Editar edición"
                  : "Agregar edición antigua"
                : "Editar historial"}
          </Text>
          <TouchableOpacity
            onPress={() => {
              if (teamPickerFor) {
                setTeamPickerFor(null);
                setTeamSearch("");
              } else if (form) {
                setForm(null);
              } else {
                close();
              }
            }}
          >
            <Text style={editionModalStyles.close}>
              {teamPickerFor || form ? "← Volver" : "✕"}
            </Text>
          </TouchableOpacity>
        </View>

        {teamPickerFor ? (
          <>
            <TextInput
              style={editionModalStyles.search}
              placeholder="Buscar equipo..."
              placeholderTextColor={UCL.textMuted}
              value={teamSearch}
              onChangeText={setTeamSearch}
            />
            <FlatList
              data={filteredTeams}
              keyExtractor={(t) => t.id}
              renderItem={({ item: team }) => (
                <TouchableOpacity
                  style={editionModalStyles.teamRow}
                  onPress={() => {
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            ...(teamPickerFor === "champion"
                              ? { championTeamId: team.id }
                              : { runnerUpTeamId: team.id }),
                          }
                        : prev,
                    );
                    setTeamPickerFor(null);
                    setTeamSearch("");
                  }}
                >
                  <TeamBadge team={team} size={30} />
                  <Text style={editionModalStyles.teamRowName}>
                    {team.name}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </>
        ) : form ? (
          <ScrollView
            contentContainerStyle={editionModalStyles.formScroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={editionModalStyles.label}>Edición N°</Text>
            <TextInput
              style={editionModalStyles.input}
              keyboardType="number-pad"
              value={form.editionNumber}
              onChangeText={(v) =>
                setForm((prev) => (prev ? { ...prev, editionNumber: v } : prev))
              }
              placeholder="1"
              placeholderTextColor={UCL.textMuted}
            />

            <Text style={editionModalStyles.label}>Campeón</Text>
            <TouchableOpacity
              style={editionModalStyles.teamSelectBtn}
              onPress={() => setTeamPickerFor("champion")}
            >
              {form.championTeamId ? (
                <View style={editionModalStyles.teamSelected}>
                  <TeamBadge
                    team={getTeamById(form.championTeamId)}
                    size={26}
                  />
                  <Text style={editionModalStyles.teamSelectedName}>
                    {getTeamById(form.championTeamId)?.name}
                  </Text>
                </View>
              ) : (
                <Text style={editionModalStyles.teamSelectPlaceholder}>
                  Elegir equipo
                </Text>
              )}
            </TouchableOpacity>

            <Text style={editionModalStyles.label}>Subcampeón</Text>
            <TouchableOpacity
              style={editionModalStyles.teamSelectBtn}
              onPress={() => setTeamPickerFor("runnerUp")}
            >
              {form.runnerUpTeamId ? (
                <View style={editionModalStyles.teamSelected}>
                  <TeamBadge
                    team={getTeamById(form.runnerUpTeamId)}
                    size={26}
                  />
                  <Text style={editionModalStyles.teamSelectedName}>
                    {getTeamById(form.runnerUpTeamId)?.name}
                  </Text>
                </View>
              ) : (
                <Text style={editionModalStyles.teamSelectPlaceholder}>
                  Elegir equipo
                </Text>
              )}
            </TouchableOpacity>

            <Text style={editionModalStyles.label}>
              👟 Bota de Oro (opcional)
            </Text>
            <TextInput
              style={editionModalStyles.input}
              value={form.goldenBootName}
              onChangeText={(v) =>
                setForm((prev) =>
                  prev ? { ...prev, goldenBootName: v } : prev,
                )
              }
              placeholder="Nombre del goleador"
              placeholderTextColor={UCL.textMuted}
            />

            <Text style={editionModalStyles.label}>
              🥅 Guante de Oro (opcional)
            </Text>
            <TextInput
              style={editionModalStyles.input}
              value={form.goldenGloveName}
              onChangeText={(v) =>
                setForm((prev) =>
                  prev ? { ...prev, goldenGloveName: v } : prev,
                )
              }
              placeholder="Nombre del portero"
              placeholderTextColor={UCL.textMuted}
            />

            <Text style={editionModalStyles.label}>
              🏆 Balón de Oro (opcional)
            </Text>
            <TextInput
              style={editionModalStyles.input}
              value={form.goldenBallManagerName}
              onChangeText={(v) =>
                setForm((prev) =>
                  prev ? { ...prev, goldenBallManagerName: v } : prev,
                )
              }
              placeholder="Nickname del jugador"
              placeholderTextColor={UCL.textMuted}
            />

            <TouchableOpacity
              style={editionModalStyles.saveBtn}
              onPress={handleSave}
            >
              <Text style={editionModalStyles.saveBtnText}>GUARDAR</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <>
            <FlatList
              data={editions}
              keyExtractor={(ed) => ed.id}
              contentContainerStyle={editionModalStyles.list}
              renderItem={({ item: ed }) => (
                <View style={editionModalStyles.editionRow}>
                  <View style={editionModalStyles.editionInfo}>
                    <Text
                      style={editionModalStyles.editionText}
                      numberOfLines={1}
                    >
                      #{ed.editionNumber} ·{" "}
                      {getTeamById(ed.championTeamId)?.shortName ??
                        ed.championTeamId}{" "}
                      campeón vs{" "}
                      {getTeamById(ed.runnerUpTeamId)?.shortName ??
                        ed.runnerUpTeamId}
                    </Text>
                  </View>
                  <TouchableOpacity onPress={() => startEdit(ed)}>
                    <Text style={editionModalStyles.editionAction}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDelete(ed.id)}>
                    <Text style={editionModalStyles.editionAction}>🗑️</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <Text style={editionModalStyles.emptyText}>
                  Sin ediciones registradas todavía.
                </Text>
              }
            />
            <TouchableOpacity
              style={editionModalStyles.addBtn}
              onPress={startCreate}
            >
              <Text style={editionModalStyles.addBtnText}>
                + AGREGAR EDICIÓN ANTIGUA
              </Text>
            </TouchableOpacity>
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UCL.bg },
  pageBg: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },

  // Header
  header: {
    alignItems: "center",
    marginTop: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: UCL.border,
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  headerLogo: { width: 78, height: 78, marginBottom: 8 },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: UCL.textPrimary,
    letterSpacing: 1,
    textAlign: "center",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#DDE8FF",
    marginTop: 4,
    textAlign: "center",
  },

  historyCard: {
    borderWidth: 1,
    borderColor: UCL.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 7,
  },
  historyTitle: {
    color: UCL.gold,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  historySubTitle: {
    color: UCL.textMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginTop: 10,
    marginBottom: 6,
  },
  historySubTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  editHistoryLink: {
    color: UCL.gold,
    fontSize: 11,
    fontWeight: "700",
  },
  championRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  championText: {
    color: UCL.textPrimary,
    fontWeight: "800",
    fontSize: 14,
    flex: 1,
  },
  championEdition: {
    color: UCL.textSecondary,
    fontSize: 11,
  },
  runnerText: {
    color: UCL.textSecondary,
    fontSize: 12,
    fontWeight: "600",
  },
  historyLine: {
    color: UCL.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  palmaresRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  palmaresTeam: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
    paddingRight: 8,
  },
  palmaresName: {
    color: UCL.textPrimary,
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  palmaresCount: {
    color: UCL.gold,
    fontSize: 12,
    fontWeight: "800",
  },

  // Active tournament
  activeCard: {
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: UCL.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 9,
  },
  activeBadge: {
    alignSelf: "flex-start",
    backgroundColor: UCL.gold,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 12,
  },
  activeBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#000",
    letterSpacing: 1,
  },
  activeFormat: {
    fontSize: 15,
    fontWeight: "600",
    color: UCL.textPrimary,
    marginBottom: 4,
  },
  activePhase: { fontSize: 14, color: UCL.textSecondary },
  divider: { height: 1, backgroundColor: UCL.border, marginVertical: 16 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: UCL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 12,
  },

  playerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  playerChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: UCL.bgCardAlt,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
    borderWidth: 1,
    borderColor: UCL.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 7,
    elevation: 4,
  },
  activeTournamentSelector: {
    borderColor: UCL.gold,
    backgroundColor: "rgba(255, 215, 0, 0.12)",
  },
  tournamentRow: {
    justifyContent: "space-between",
    marginBottom: 8,
  },
  tournamentRowInfo: { flex: 1 },
  tournamentDeleteBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tournamentDeleteBtnText: { fontSize: 15 },
  newTournamentBtn: {
    borderWidth: 1,
    borderColor: UCL.gold,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  newTournamentBtnText: {
    fontSize: 13,
    fontWeight: "800",
    color: UCL.gold,
    letterSpacing: 0.5,
  },
  teamDot: { width: 8, height: 8, borderRadius: 4 },
  playerChipName: {
    fontSize: 13,
    color: UCL.textPrimary,
    fontWeight: "600",
    maxWidth: 80,
  },
  playerChipTeam: { fontSize: 11, color: UCL.textSecondary },

  // Empty state
  trophyContainer: { alignItems: "center", marginBottom: 16 },
  trophyEmoji: { fontSize: 80 },
  emptyLogo: { width: 94, height: 94 },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: UCL.textPrimary,
    textAlign: "center",
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 14,
    color: UCL.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 32,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: UCL.gold,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 10,
    elevation: 5,
  },
  nextEditionBtn: {
    backgroundColor: UCL.blueLight,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#000",
    letterSpacing: 0.7,
  },
  ghostBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: UCL.border,
  },
  ghostBtnText: { fontSize: 14, color: UCL.textSecondary },
});

const editionModalStyles = StyleSheet.create({
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
  title: { fontSize: 16, fontWeight: "800", color: UCL.textPrimary },
  close: { fontSize: 14, color: UCL.textSecondary, fontWeight: "600" },
  search: {
    margin: 16,
    marginBottom: 8,
    backgroundColor: UCL.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UCL.border,
    color: UCL.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  teamRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: UCL.border,
  },
  teamRowName: { fontSize: 13, color: UCL.textPrimary, fontWeight: "600" },
  list: { paddingHorizontal: 16, paddingTop: 8 },
  editionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: UCL.bgCardAlt,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: UCL.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  editionInfo: { flex: 1 },
  editionText: { fontSize: 12, color: UCL.textPrimary, fontWeight: "600" },
  editionAction: { fontSize: 16, paddingHorizontal: 4 },
  emptyText: {
    fontSize: 12,
    color: UCL.textMuted,
    textAlign: "center",
    paddingVertical: 24,
  },
  addBtn: {
    margin: 16,
    backgroundColor: UCL.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  addBtnText: { fontSize: 13, fontWeight: "800", color: "#000" },
  formScroll: { padding: 16, paddingBottom: 40 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: UCL.textMuted,
    letterSpacing: 0.5,
    marginTop: 14,
    marginBottom: 6,
  },
  input: {
    backgroundColor: UCL.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UCL.border,
    color: UCL.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
  },
  teamSelectBtn: {
    backgroundColor: UCL.bgInput,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: UCL.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  teamSelectPlaceholder: { fontSize: 13, color: UCL.textMuted },
  teamSelected: { flexDirection: "row", alignItems: "center", gap: 8 },
  teamSelectedName: { fontSize: 13, color: UCL.textPrimary, fontWeight: "600" },
  saveBtn: {
    marginTop: 24,
    backgroundColor: UCL.gold,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveBtnText: { fontSize: 14, fontWeight: "800", color: "#000" },
});
