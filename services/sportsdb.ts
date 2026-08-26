import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = "https://www.thesportsdb.com/api/v1/json/3";
const PREFIX = "sportsdb_";
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

interface CacheEntry<T> {
  data: T;
  ts: number;
}

async function getCached<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    if (Date.now() - entry.ts > TTL) return null;
    return entry.data;
  } catch {
    return null;
  }
}

async function setCached<T>(key: string, data: T): Promise<void> {
  try {
    await AsyncStorage.setItem(
      PREFIX + key,
      JSON.stringify({ data, ts: Date.now() }),
    );
  } catch {
    // ignore storage errors
  }
}

// ── Public types ───────────────────────────────────────────────────────────────

export interface TeamInfo {
  id: string;
  name: string;
  badge: string | null;
  jersey: string | null;
}

export interface SquadPlayer {
  id: string;
  name: string;
  position: string;
  number?: number | null;
  photo?: string | null;
  thumb?: string;
}

// ── API functions ──────────────────────────────────────────────────────────────

/**
 * Search for a team by name and return its TheSportsDB info (badge URL, etc.)
 * Results are cached for 7 days.
 */
export async function fetchTeamInfo(
  searchName: string,
): Promise<TeamInfo | null> {
  const cacheKey = `team_${searchName.toLowerCase().replace(/\s+/g, "_")}`;
  const cached = await getCached<TeamInfo>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${BASE}/searchteams.php?t=${encodeURIComponent(searchName)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const t = json.teams?.[0];
    if (!t) return null;

    const info: TeamInfo = {
      id: t.idTeam ?? "",
      name: t.strTeam ?? searchName,
      badge: t.strTeamBadge || null,
      jersey: t.strTeamJersey || null,
    };

    await setCached(cacheKey, info);
    return info;
  } catch {
    return null;
  }
}

/**
 * Fetch full squad for a team (by TheSportsDB team ID).
 * Results are cached for 7 days.
 */
export async function fetchSquad(
  theSportsDbTeamId: string,
): Promise<SquadPlayer[]> {
  const cacheKey = `squad_${theSportsDbTeamId}`;
  const cached = await getCached<SquadPlayer[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${BASE}/lookup_all_players.php?id=${theSportsDbTeamId}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const players: SquadPlayer[] = (json.player ?? []).map(
      (p: Record<string, string>) => ({
        id: p.idPlayer ?? "",
        name: p.strPlayer ?? "",
        position: p.strPosition ?? "",
        thumb: p.strThumb || undefined,
      }),
    );

    await setCached(cacheKey, players);
    return players;
  } catch {
    return [];
  }
}

/** Convenience: fetch badge URL only (most common use-case in UI) */
export async function fetchTeamBadge(
  searchName: string,
): Promise<string | null> {
  const info = await fetchTeamInfo(searchName);
  return info?.badge ?? null;
}
