import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import { UCL } from "@/constants/theme";
import { UCL_TEAMS, getTeamById } from "@/constants/teams";
import { TeamBadge } from "@/components/team-badge";
import { useTournamentStore, formatDescription } from "@/store/tournament";
import { Player, UCLTeam } from "@/constants/types";

const MAX_PLAYERS = 36;
const MIN_PLAYERS = 2;

type PlayerDraft = { id: string; nickname: string; teamId: string };

const uid = () => Math.random().toString(36).slice(2, 9);

export default function SetupScreen() {
  const createTournament = useTournamentStore((s) => s.createTournament);

  const [players, setPlayers] = useState<PlayerDraft[]>([
    { id: uid(), nickname: "", teamId: "" },
    { id: uid(), nickname: "", teamId: "" },
    { id: uid(), nickname: "", teamId: "" },
    { id: uid(), nickname: "", teamId: "" },
  ]);

  // Team picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const takenTeamIds = players.map((p) => p.teamId).filter(Boolean);
  const filteredTeams = UCL_TEAMS.filter(
    (t) =>
      (!takenTeamIds.includes(t.id) ||
        t.id === players.find((p) => p.id === pickerTargetId)?.teamId) &&
      (search === "" ||
        t.name.toLowerCase().includes(search.toLowerCase()) ||
        t.country.toLowerCase().includes(search.toLowerCase()) ||
        t.shortName.toLowerCase().includes(search.toLowerCase())),
  ).sort((a, b) => a.name.localeCompare(b.name));

  const count = players.length;
  const isValidCount = count >= MIN_PLAYERS && count <= MAX_PLAYERS;
  const allFilled = players.every((p) => p.nickname.trim() && p.teamId);
  const canStart = isValidCount && allFilled;

  const addPlayer = () => {
    if (count >= MAX_PLAYERS) return;
    setPlayers((prev) => [...prev, { id: uid(), nickname: "", teamId: "" }]);
  };

  const removePlayer = (id: string) => {
    if (players.length <= 2) return;
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const updateNickname = (id: string, nickname: string) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, nickname } : p)),
    );
  };

  const openPicker = (playerId: string) => {
    setPickerTargetId(playerId);
    setSearch("");
    setPickerOpen(true);
  };

  const selectTeam = (team: UCLTeam) => {
    if (!pickerTargetId) return;
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === pickerTargetId ? { ...p, teamId: team.id } : p,
      ),
    );
    setPickerOpen(false);
    setPickerTargetId(null);
  };

  const handleStart = useCallback(() => {
    // Validate unique nicknames
    const nicknames = players.map((p) => p.nickname.trim().toLowerCase());
    const uniqueNicknames = new Set(nicknames);
    if (uniqueNicknames.size !== nicknames.length) {
      Alert.alert(
        "Nicknames duplicados",
        "Cada jugador debe tener un nickname único.",
      );
      return;
    }

    const validPlayers: Player[] = players.map((p) => ({
      id: p.id,
      nickname: p.nickname.trim(),
      teamId: p.teamId,
    }));

    createTournament(validPlayers);
    router.replace("/draw");
  }, [players, createTournament]);

  const formatHint =
    count >= MIN_PLAYERS
      ? `🏆 ${formatDescription(count)}`
      : `Añade al menos ${MIN_PLAYERS - count} jugador${MIN_PLAYERS - count > 1 ? "es" : ""} más`;

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Volver</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Nuevo Torneo</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>PARTICIPANTES</Text>
        <Text style={styles.sectionSubtitle}>
          De 2 a 36 jugadores — el formato se calcula automáticamente.
        </Text>

        {/* ── Format hint ── */}
        <View
          style={[
            styles.hintBox,
            { borderColor: isValidCount ? UCL.gold : UCL.borderLight },
          ]}
        >
          <Text
            style={[
              styles.hintText,
              { color: isValidCount ? UCL.gold : UCL.textSecondary },
            ]}
          >
            {formatHint}
          </Text>
        </View>

        {/* ── Player rows ── */}
        {players.map((p, idx) => {
          const team = p.teamId ? getTeamById(p.teamId) : null;
          return (
            <View key={p.id} style={styles.playerRow}>
              <View style={styles.playerNumber}>
                <Text style={styles.playerNumberText}>{idx + 1}</Text>
              </View>

              <View style={styles.playerInputs}>
                <TextInput
                  style={styles.nicknameInput}
                  placeholder="Nickname..."
                  placeholderTextColor={UCL.textMuted}
                  value={p.nickname}
                  onChangeText={(v) => updateNickname(p.id, v)}
                  maxLength={16}
                  autoCapitalize="none"
                  returnKeyType="next"
                />

                <TouchableOpacity
                  style={[
                    styles.teamBtn,
                    team && {
                      borderColor: team.primaryColor + "80",
                      backgroundColor: team.primaryColor + "18",
                    },
                  ]}
                  onPress={() => openPicker(p.id)}
                >
                  {team ? (
                    <View style={styles.teamSelected}>
                      <TeamBadge team={team} size={28} />
                      <Text style={styles.teamSelectedName} numberOfLines={1}>
                        {team.shortName}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.teamBtnPlaceholder}>Elegir equipo</Text>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.removeBtn,
                  players.length <= 2 && styles.removeBtnDisabled,
                ]}
                onPress={() => removePlayer(p.id)}
                disabled={players.length <= 2}
              >
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* ── Add player ── */}
        {count < MAX_PLAYERS && (
          <TouchableOpacity style={styles.addBtn} onPress={addPlayer}>
            <Text style={styles.addBtnText}>+ Añadir jugador</Text>
          </TouchableOpacity>
        )}

        {/* ── CTA ── */}
        <TouchableOpacity
          style={[styles.startBtn, !canStart && styles.startBtnDisabled]}
          onPress={handleStart}
          disabled={!canStart}
        >
          <Text
            style={[
              styles.startBtnText,
              !canStart && styles.startBtnTextDisabled,
            ]}
          >
            🎲 REALIZAR SORTEO
          </Text>
        </TouchableOpacity>

        {!canStart && (
          <Text style={styles.startHint}>
            {!allFilled
              ? "Completa nickname y equipo de todos los jugadores"
              : count < MIN_PLAYERS
                ? `Mínimo ${MIN_PLAYERS} jugadores`
                : count > MAX_PLAYERS
                  ? `Máximo ${MAX_PLAYERS} jugadores`
                  : ""}
          </Text>
        )}
      </ScrollView>

      {/* ── Team Picker Modal ── */}
      <Modal
        visible={pickerOpen}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalSafe}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Elige un Equipo</Text>
            <TouchableOpacity onPress={() => setPickerOpen(false)}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="🔍  Buscar equipo o país..."
              placeholderTextColor={UCL.textMuted}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
            />
          </View>

          <FlatList
            data={filteredTeams}
            keyExtractor={(t) => t.id}
            contentContainerStyle={styles.teamList}
            renderItem={({ item: team }) => {
              const isSelected =
                players.find((p) => p.id === pickerTargetId)?.teamId ===
                team.id;
              const isTaken = takenTeamIds.includes(team.id) && !isSelected;
              return (
                <TouchableOpacity
                  style={[
                    styles.teamListItem,
                    isSelected && styles.teamListItemSelected,
                    isTaken && styles.teamListItemTaken,
                  ]}
                  onPress={() => !isTaken && selectTeam(team)}
                  disabled={isTaken}
                >
                  <View style={styles.teamListBadgeWrapper}>
                    <TeamBadge team={team} size={40} />
                  </View>
                  <View style={styles.teamListInfo}>
                    <Text
                      style={[
                        styles.teamListName,
                        isTaken && { color: UCL.textMuted },
                      ]}
                    >
                      {team.name}
                    </Text>
                    <Text style={styles.teamListCountry}>{team.country}</Text>
                  </View>
                  {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  {isTaken && <Text style={styles.takenLabel}>Tomado</Text>}
                </TouchableOpacity>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UCL.bg },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: UCL.border,
  },
  backBtn: { width: 80 },
  backBtnText: { fontSize: 14, color: UCL.gold, fontWeight: "600" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: UCL.textPrimary },

  scroll: { padding: 20, paddingBottom: 48 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: UCL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: UCL.textSecondary,
    marginBottom: 16,
    lineHeight: 20,
  },

  hintBox: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  hintText: { fontSize: 13, fontWeight: "600" },

  // Player row
  playerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  playerNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: UCL.bgCardAlt,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: UCL.border,
  },
  playerNumberText: {
    fontSize: 12,
    fontWeight: "700",
    color: UCL.textSecondary,
  },
  playerInputs: { flex: 1, gap: 6 },

  nicknameInput: {
    backgroundColor: UCL.bgInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: UCL.textPrimary,
    borderWidth: 1,
    borderColor: UCL.border,
  },
  teamBtn: {
    backgroundColor: UCL.bgInput,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: UCL.border,
  },
  teamBtnPlaceholder: { fontSize: 13, color: UCL.textMuted },
  teamSelected: { flexDirection: "row", alignItems: "center", gap: 6 },
  teamColorDot: { width: 10, height: 10, borderRadius: 5 },
  teamSelectedFlag: { fontSize: 14 },
  teamSelectedName: {
    fontSize: 13,
    color: UCL.textPrimary,
    fontWeight: "600",
    flex: 1,
  },

  removeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#3A1010",
    borderWidth: 1,
    borderColor: UCL.loss + "60",
  },
  removeBtnDisabled: { opacity: 0.25 },
  removeBtnText: { fontSize: 12, color: UCL.loss, fontWeight: "700" },

  addBtn: {
    borderWidth: 1,
    borderColor: UCL.borderLight,
    borderStyle: "dashed",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 24,
  },
  addBtnText: { fontSize: 14, color: UCL.textSecondary, fontWeight: "600" },

  startBtn: {
    backgroundColor: UCL.gold,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  startBtnDisabled: {
    backgroundColor: UCL.bgCardAlt,
    borderWidth: 1,
    borderColor: UCL.border,
  },
  startBtnText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#000",
    letterSpacing: 1,
  },
  startBtnTextDisabled: { color: UCL.textMuted },
  startHint: {
    fontSize: 12,
    color: UCL.textMuted,
    textAlign: "center",
    marginTop: 10,
  },

  // Modal
  modalSafe: { flex: 1, backgroundColor: UCL.bg },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: UCL.border,
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: UCL.textPrimary },
  modalClose: { fontSize: 18, color: UCL.textSecondary, fontWeight: "600" },
  searchContainer: { padding: 16, paddingBottom: 8 },
  searchInput: {
    backgroundColor: UCL.bgInput,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: UCL.textPrimary,
    borderWidth: 1,
    borderColor: UCL.border,
  },
  teamList: { paddingHorizontal: 16, paddingBottom: 32 },
  teamListItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UCL.border,
    gap: 12,
  },
  teamListItemSelected: {
    backgroundColor: UCL.bgCardAlt,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  teamListItemTaken: { opacity: 0.4 },
  teamListBadgeWrapper: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  teamListBadge: {
    width: 44,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  teamListBadgeText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  teamListInfo: { flex: 1 },
  teamListName: {
    fontSize: 14,
    fontWeight: "600",
    color: UCL.textPrimary,
    marginBottom: 1,
  },
  teamListCountry: { fontSize: 12, color: UCL.textSecondary },
  checkmark: { fontSize: 16, color: UCL.gold, fontWeight: "800" },
  takenLabel: { fontSize: 11, color: UCL.textMuted, fontStyle: "italic" },
});
