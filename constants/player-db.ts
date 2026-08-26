import { UCL_TEAMS } from "@/constants/teams";

const playersDb = require("@/data/players-db.json") as {
  teams?: Array<{
    teamId: number;
    teamName: string;
    teamCode: string;
    teamLogo: string;
    players: Array<{
      id: number;
      name: string;
      age: number;
      number: number | null;
      position: string;
      photo: string;
    }>;
  }>;
};

export type LocalDbPlayer = {
  id: number;
  name: string;
  age: number;
  number: number | null;
  position: string;
  photo: string;
};

const normalizeName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function isNameMatch(candidate: string, target: string): boolean {
  const a = normalizeName(candidate ?? "");
  const b = normalizeName(target ?? "");
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return true;

  const aParts = a.split(" ").filter(Boolean);
  const bParts = b.split(" ").filter(Boolean);
  if (aParts.length < 2 || bParts.length < 2) return false;

  const aLast = aParts[aParts.length - 1];
  const bLast = bParts[bParts.length - 1];
  if (aLast !== bLast) return false;

  const aInitials = aParts
    .slice(0, -1)
    .map((part) => part[0])
    .join("");
  const bInitials = bParts
    .slice(0, -1)
    .map((part) => part[0])
    .join("");
  if (!aInitials || !bInitials) return true;

  return (
    aInitials.startsWith(bInitials) ||
    bInitials.startsWith(aInitials) ||
    aInitials.includes(bInitials) ||
    bInitials.includes(aInitials)
  );
}

function resolveDbTeamId(teamId: string | number): number | undefined {
  if (teamId === null || teamId === undefined || teamId === "") {
    return undefined;
  }

  const raw = String(teamId).trim();
  if (/^\d+$/.test(raw)) {
    return Number(raw);
  }

  const appTeam = UCL_TEAMS.find((team) => {
    const teamKey = normalizeName(team.id ?? "");
    const teamName = normalizeName(team.name ?? "");
    const shortName = normalizeName(team.shortName ?? "");
    const sportsDbName = normalizeName(team.sportsDbName ?? "");
    const input = normalizeName(raw);
    return (
      input === teamKey ||
      input === teamName ||
      input === shortName ||
      input === sportsDbName
    );
  });

  if (appTeam) {
    const dbTeam = (playersDb.teams ?? []).find((item) => {
      const itemName = normalizeName(item.teamName ?? "");
      const itemCode = normalizeName(item.teamCode ?? "");
      const alias = normalizeName(appTeam.name ?? "");
      const sportsDb = normalizeName(appTeam.sportsDbName ?? "");
      const short = normalizeName(appTeam.shortName ?? "");
      return (
        itemName === alias ||
        itemName === sportsDb ||
        itemName === short ||
        itemCode === short ||
        itemName.includes(alias) ||
        alias.includes(itemName)
      );
    });

    if (dbTeam) return dbTeam.teamId;
  }

  const fallbackTeam = (playersDb.teams ?? []).find((item) => {
    const name = normalizeName(item.teamName ?? "");
    return name === normalizeName(raw) || name.includes(normalizeName(raw));
  });

  return fallbackTeam?.teamId;
}

export function getTeamPlayers(teamId: string | number): LocalDbPlayer[] {
  const resolvedTeamId = resolveDbTeamId(teamId);
  if (resolvedTeamId === undefined) return [];

  const team = (playersDb.teams ?? []).find(
    (item) => Number(item.teamId) === Number(resolvedTeamId),
  );
  return team?.players ?? [];
}

export function findPlayerByName(
  teamId: string | number,
  playerName: string,
): LocalDbPlayer | undefined {
  const target = normalizeName(playerName ?? "");
  if (!target) return undefined;

  const teamPlayers = getTeamPlayers(teamId);
  const matchInTeam = teamPlayers.find((player) =>
    isNameMatch(player.name ?? "", playerName ?? ""),
  );

  if (matchInTeam) return matchInTeam;

  const allPlayers = (playersDb.teams ?? []).flatMap(
    (team) => team.players ?? [],
  );
  return allPlayers.find((player) =>
    isNameMatch(player.name ?? "", playerName ?? ""),
  );
}

export function getPlayerCardByName(
  teamId: string | number,
  playerName: string,
): {
  id: string | number;
  name: string;
  position: string;
  photo?: string;
  number?: number | null;
} {
  const rawName = typeof playerName === "string" ? playerName.trim() : "";
  const hasIncompleteLookup =
    !teamId ||
    teamId === "" ||
    teamId === "null" ||
    teamId === "undefined" ||
    !rawName ||
    rawName.toLowerCase().includes("test") ||
    rawName.toLowerCase().includes("jugador") ||
    rawName.toLowerCase().includes("player");

  const dbPlayer = hasIncompleteLookup
    ? undefined
    : findPlayerByName(teamId, rawName);
  const fallbackName = rawName || "Jugador";

  return {
    id:
      dbPlayer?.id ??
      `${teamId}-${fallbackName.replace(/\s+/g, "-").toLowerCase()}`,
    name: dbPlayer?.name ?? fallbackName,
    position: dbPlayer?.position || "Jugador",
    photo: dbPlayer?.photo || undefined,
    number: dbPlayer?.number ?? null,
  };
}

export function enrichPlayerCard(
  teamId: string | number,
  player: {
    name?: string;
    position?: string;
    photo?: string;
    number?: number | null;
    id?: string | number;
  },
): {
  id: string | number;
  name: string;
  position: string;
  photo?: string;
  number?: number | null;
} {
  const dbPlayer = findPlayerByName(teamId, player.name ?? "");
  return {
    id:
      player.id ??
      dbPlayer?.id ??
      `${teamId}-${(player.name ?? "player").replace(/\s+/g, "-").toLowerCase()}`,
    name: dbPlayer?.name ?? player.name ?? "Jugador",
    position: dbPlayer?.position || player.position || "Jugador",
    photo: dbPlayer?.photo || player.photo,
    number: dbPlayer?.number ?? player.number ?? null,
  };
}
