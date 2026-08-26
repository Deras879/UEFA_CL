import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  Tournament,
  Player,
  Match,
  Group,
  KnockoutTie,
  TournamentConfig,
  KnockoutRound,
  Standing,
  TournamentEdition,
  TournamentAwards,
} from "@/constants/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

const uid = () =>
  Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function nextPow2(n: number): number {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

type QualifiedPlayer = { playerId: string; groupIndex: number };

// Pairs each item in `a` with one from `b`, preferring different groupIndex to avoid immediate rematches.
function pairPreferDifferentGroups(
  a: QualifiedPlayer[],
  b: QualifiedPlayer[],
): Array<[string, string]> {
  const usedB = new Array(b.length).fill(false);
  const pairs: Array<[string, string]> = [];
  for (const item of a) {
    let idx = b.findIndex(
      (c, i) => !usedB[i] && c.groupIndex !== item.groupIndex,
    );
    if (idx === -1) idx = b.findIndex((c, i) => !usedB[i]);
    if (idx === -1) continue;
    usedB[idx] = true;
    pairs.push([item.playerId, b[idx].playerId]);
  }
  return pairs;
}

// Pairs entries within a single pool, swapping to avoid same-group matchups when possible.
function selfPairAvoidingSameGroup(
  pool: QualifiedPlayer[],
): Array<[string, string]> {
  const shuffled = shuffle(pool);
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i + 1 < shuffled.length; i += 2) {
    let p2 = shuffled[i + 1];
    if (shuffled[i].groupIndex === p2.groupIndex) {
      for (let k = i + 2; k < shuffled.length; k++) {
        if (shuffled[k].groupIndex !== shuffled[i].groupIndex) {
          [shuffled[i + 1], shuffled[k]] = [shuffled[k], shuffled[i + 1]];
          p2 = shuffled[i + 1];
          break;
        }
      }
    }
    pairs.push([shuffled[i].playerId, p2.playerId]);
  }
  return pairs;
}

/**
 * Draws first-round knockout pairs from group winners ("seeds") against the
 * rest of the qualifiers (runners-up + wildcards), so a group winner never
 * faces another group winner (and likewise for runners-up) unless there is
 * literally no other option (e.g. only winners qualify).
 */
function buildFirstRoundPairs(
  seeds: QualifiedPlayer[],
  rest: QualifiedPlayer[],
): Array<[string, string]> {
  const shuffledSeeds = shuffle(seeds);
  const shuffledRest = shuffle(rest);

  if (shuffledRest.length === 0) {
    return selfPairAvoidingSameGroup(shuffledSeeds);
  }

  const crossPairs = pairPreferDifferentGroups(shuffledSeeds, shuffledRest);
  const pairedSeedIds = new Set(crossPairs.map((p) => p[0]));
  const pairedRestIds = new Set(crossPairs.map((p) => p[1]));

  const leftover = [
    ...shuffledSeeds.filter((p) => !pairedSeedIds.has(p.playerId)),
    ...shuffledRest.filter((p) => !pairedRestIds.has(p.playerId)),
  ];

  return [...crossPairs, ...selfPairAvoidingSameGroup(leftover)];
}

// Group letter names: A, B, C...
const GROUP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

// ── Format Config ──────────────────────────────────────────────────────────────

/**
 * Compute the tournament config for n players.
 *
 * n=2  → pure knockout, bracket=2 (Final only)
 * n=3  → 1 group (round-robin) + Final
 * n=4  → pure knockout, bracket=4 (SF + Final + 3rd)
 * n≥5  → groups (ceil(n/4) groups, min 2) + knockout bracket
 */
export function computeConfig(n: number): TournamentConfig {
  if (n < 2) throw new Error("Min 2 players");
  if (n === 2)
    return {
      numGroups: 0,
      bracketSize: 2,
      qualifiersPerGroup: 0,
      wildCardCount: 0,
    };
  if (n === 3)
    return {
      numGroups: 1,
      bracketSize: 2,
      qualifiersPerGroup: 2,
      wildCardCount: 0,
    };
  if (n === 4)
    return {
      numGroups: 0,
      bracketSize: 4,
      qualifiersPerGroup: 0,
      wildCardCount: 0,
    };

  // n >= 5: groups + knockout
  let numGroups = Math.max(2, Math.ceil(n / 4));

  let qualifiersPerGroup = 2;
  let directQ = numGroups * qualifiersPerGroup;
  let bracketSize = nextPow2(directQ);
  let wildCardCount = bracketSize - directQ;

  // If wildCards > numGroups we can't supply them → switch to top-1 per group
  if (wildCardCount > numGroups) {
    qualifiersPerGroup = 1;
    directQ = numGroups;
    bracketSize = nextPow2(directQ);
    wildCardCount = bracketSize - directQ;
  }

  return { numGroups, bracketSize, qualifiersPerGroup, wildCardCount };
}

/** Human-readable description of the format */
export function formatDescription(n: number): string {
  const cfg = computeConfig(n);
  if (n === 2) return "Final directa";
  if (n === 3) return "Liga de 3 · Final";
  if (n === 4) return "2 Semifinales (ida & vuelta) · Final · 3er Puesto";

  const koLabel =
    cfg.bracketSize === 4
      ? "Semifinales"
      : cfg.bracketSize === 8
        ? "Cuartos + Semis"
        : "Round-16 + Cuartos + Semis";

  const wc =
    cfg.wildCardCount > 0 ? ` + ${cfg.wildCardCount} mejor(es) 3°` : "";
  return `${cfg.numGroups} grupos (top ${cfg.qualifiersPerGroup}${wc}) · ${koLabel} · Final`;
}

// ── Match & Tie builders ───────────────────────────────────────────────────────

function makeMatch(
  homeId: string,
  awayId: string,
  phase: Match["phase"],
  tieId: string,
  leg: 1 | 2,
): Match {
  return {
    id: uid(),
    homePlayerId: homeId,
    awayPlayerId: awayId,
    homeScore: null,
    awayScore: null,
    homeGoalScorers: [],
    awayGoalScorers: [],
    homeGoalkeeperName: null,
    awayGoalkeeperName: null,
    status: "scheduled",
    phase,
    tieId,
    leg,
  };
}

function phaseFromRound(round: KnockoutRound): Match["phase"] {
  if (round === "final") return "final";
  if (round === "third_place") return "third_place";
  if (round === "semifinal") return "semifinal";
  if (round === "quarterfinal") return "quarterfinal";
  return "round_of_16";
}

function makeTie(
  round: KnockoutRound,
  p1: string | null,
  p2: string | null,
  isSingleLeg: boolean,
): { tie: KnockoutTie; matches: Match[] } {
  const tieId = uid();
  const ph = phaseFromRound(round);
  const leg1 = makeMatch(p1 ?? "", p2 ?? "", ph, tieId, 1);
  const mList: Match[] = [leg1];
  let leg2MatchId: string | null = null;

  if (!isSingleLeg) {
    const leg2 = makeMatch(p2 ?? "", p1 ?? "", ph, tieId, 2);
    mList.push(leg2);
    leg2MatchId = leg2.id;
  }

  const tie: KnockoutTie = {
    id: tieId,
    round,
    player1Id: p1,
    player2Id: p2,
    leg1MatchId: leg1.id,
    leg2MatchId,
    winnerId: null,
    isSingleLeg,
    penaltyWinnerId: null,
  };
  return { tie, matches: mList };
}

function makeGroupMatches(playerIds: string[], groupId: string): Match[] {
  const matches: Match[] = [];
  for (let i = 0; i < playerIds.length; i++) {
    for (let j = i + 1; j < playerIds.length; j++) {
      matches.push({
        id: uid(),
        homePlayerId: playerIds[i],
        awayPlayerId: playerIds[j],
        homeScore: null,
        awayScore: null,
        homeGoalScorers: [],
        awayGoalScorers: [],
        homeGoalkeeperName: null,
        awayGoalkeeperName: null,
        status: "scheduled",
        phase: "group",
        groupId,
      });
    }
  }
  return matches;
}

/** Build an empty knockout bracket (TBD players) for a given bracketSize */
function buildKnockoutBracket(bracketSize: number): {
  ties: KnockoutTie[];
  matches: Match[];
} {
  const ties: KnockoutTie[] = [];
  const matches: Match[] = [];

  if (bracketSize === 2) {
    // Just a Final (single leg)
    const { tie, matches: m } = makeTie("final", null, null, true);
    ties.push(tie);
    matches.push(...m);
    return { ties, matches };
  }

  const numRounds = Math.log2(bracketSize); // rounds before the Final
  const roundNames: KnockoutRound[] = [
    "round_of_16",
    "quarterfinal",
    "semifinal",
  ];

  let currentSize = bracketSize;
  for (let r = 0; r < numRounds - 1; r++) {
    const numTies = currentSize / 2;
    // r=0 = outermost round (R16 for 16, QF for 8, SF for 4)
    // r=numRounds-2 = always SF (closest to Final)
    const roundIndex = Math.max(0, r + 4 - numRounds);
    const round: KnockoutRound = roundNames[roundIndex] ?? "round_of_16";
    for (let i = 0; i < numTies; i++) {
      const { tie, matches: m } = makeTie(round, null, null, false); // 2 legs
      ties.push(tie);
      matches.push(...m);
    }
    currentSize /= 2;
  }

  // Final + 3rd (single leg)
  const { tie: ft, matches: fm } = makeTie("final", null, null, true);
  const { tie: tt, matches: tm } = makeTie("third_place", null, null, true);
  ties.push(ft, tt);
  matches.push(...fm, ...tm);

  return { ties, matches };
}

function expectedRoundsForBracket(bracketSize: number): KnockoutRound[] {
  if (bracketSize <= 2) return [];
  if (bracketSize === 4) return ["semifinal"];
  if (bracketSize === 8) return ["quarterfinal", "semifinal"];
  return ["round_of_16", "quarterfinal", "semifinal"];
}

function normalizeKnockoutTies(
  ties: KnockoutTie[],
  bracketSize: number,
): KnockoutTie[] {
  const expected = expectedRoundsForBracket(bracketSize);
  if (expected.length === 0) return ties;

  const nonFinal = ties.filter(
    (t) => t.round !== "final" && t.round !== "third_place",
  );
  if (nonFinal.length === 0) return ties;

  const expectedById = new Map<string, KnockoutRound>();
  let cursor = 0;
  let tiesInRound = bracketSize / 2;
  for (const round of expected) {
    for (let i = 0; i < tiesInRound; i++) {
      const tie = nonFinal[cursor++];
      if (!tie) break;
      expectedById.set(tie.id, round);
    }
    tiesInRound /= 2;
  }

  return ties.map((t) => {
    const expectedRound = expectedById.get(t.id);
    if (!expectedRound || t.round === expectedRound) return t;
    return { ...t, round: expectedRound };
  });
}

// ── Tournament builders ────────────────────────────────────────────────────────

function buildPureKnockout(players: Player[], bracketSize: number): Tournament {
  const s = shuffle(players);
  const ties: KnockoutTie[] = [];
  const matches: Match[] = [];

  if (bracketSize === 2) {
    const { tie, matches: m } = makeTie("final", s[0].id, s[1].id, true);
    ties.push(tie);
    matches.push(...m);
  } else {
    // bracketSize = 4: 2 SFs (2 legs) + Final + 3rd
    for (let i = 0; i < 2; i++) {
      const { tie, matches: m } = makeTie(
        "semifinal",
        s[i * 2].id,
        s[i * 2 + 1].id,
        false,
      );
      ties.push(tie);
      matches.push(...m);
    }
    const { tie: ft, matches: fm } = makeTie("final", null, null, true);
    const { tie: tt, matches: tm } = makeTie("third_place", null, null, true);
    ties.push(ft, tt);
    matches.push(...fm, ...tm);
  }

  const config = computeConfig(players.length);
  return {
    id: uid(),
    format: "knockout",
    phase: "knockout",
    config,
    players,
    groups: [],
    matches,
    ties,
    createdAt: new Date().toISOString(),
  };
}

function buildGroupsKnockout(
  players: Player[],
  config: TournamentConfig,
): Tournament {
  const s = shuffle(players);
  const groups: Group[] = [];
  const allMatches: Match[] = [];

  // Distribute players into groups as evenly as possible
  const base = Math.floor(s.length / config.numGroups);
  const extra = s.length % config.numGroups;
  let cursor = 0;

  for (let g = 0; g < config.numGroups; g++) {
    const size = base + (g < extra ? 1 : 0);
    const pIds = s.slice(cursor, cursor + size).map((p) => p.id);
    cursor += size;
    const groupId = uid();
    const gMatches = makeGroupMatches(pIds, groupId);
    allMatches.push(...gMatches);
    groups.push({
      id: groupId,
      name: `Grupo ${GROUP_LETTERS[g]}`,
      playerIds: pIds,
      matchIds: gMatches.map((m) => m.id),
    });
  }

  // Knockout bracket (TBD players, filled after group phase)
  const { ties, matches: koMatches } = buildKnockoutBracket(config.bracketSize);
  allMatches.push(...koMatches);

  return {
    id: uid(),
    format: "groups-knockout",
    phase: "groups",
    config,
    players,
    groups,
    matches: allMatches,
    ties,
    createdAt: new Date().toISOString(),
  };
}

// ── Standings ──────────────────────────────────────────────────────────────────

export function computeStandings(group: Group, matches: Match[]): Standing[] {
  const st: Record<string, Standing> = {};
  for (const pid of group.playerIds) {
    st[pid] = {
      playerId: pid,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDiff: 0,
      points: 0,
    };
  }
  for (const m of matches) {
    if (m.groupId !== group.id || m.status !== "completed") continue;
    if (m.homeScore === null || m.awayScore === null) continue;
    const h = st[m.homePlayerId];
    const a = st[m.awayPlayerId];
    if (!h || !a) continue;
    h.played++;
    a.played++;
    h.goalsFor += m.homeScore;
    h.goalsAgainst += m.awayScore;
    a.goalsFor += m.awayScore;
    a.goalsAgainst += m.homeScore;
    if (m.homeScore > m.awayScore) {
      h.won++;
      h.points += 3;
      a.lost++;
    } else if (m.homeScore < m.awayScore) {
      a.won++;
      a.points += 3;
      h.lost++;
    } else {
      h.drawn++;
      h.points++;
      a.drawn++;
      a.points++;
    }
    h.goalDiff = h.goalsFor - h.goalsAgainst;
    a.goalDiff = a.goalsFor - a.goalsAgainst;
  }
  return Object.values(st).sort(
    (a, b) =>
      b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor,
  );
}

// ── Knockout advancement helpers ──────────────────────────────────────────────

/**
 * Returns winner/loser for a tie once it is fully resolved, or null if still undecided.
 * Two-leg ties: decided by aggregate; if tied, requires penaltyWinnerId.
 * Single-leg ties: decided by direct score; draw = null (unresolved).
 */
function determineTieWinner(
  tie: KnockoutTie,
  matches: Match[],
): { winnerId: string; loserId: string } | null {
  const p1 = tie.player1Id;
  const p2 = tie.player2Id;
  if (!p1 || !p2) return null;

  const leg1 = matches.find((m) => m.id === tie.leg1MatchId);
  if (!leg1 || leg1.status !== "completed") return null;

  if (tie.isSingleLeg) {
    if (leg1.homeScore === null || leg1.awayScore === null) return null;
    if (leg1.homeScore > leg1.awayScore) return { winnerId: p1, loserId: p2 };
    if (leg1.awayScore > leg1.homeScore) return { winnerId: p2, loserId: p1 };
    return null; // draw in single leg — unresolved
  }

  // Two legs
  const leg2 = matches.find((m) => m.id === tie.leg2MatchId);
  if (!leg2 || leg2.status !== "completed") return null;

  const agg1 = (leg1.homeScore ?? 0) + (leg2.awayScore ?? 0);
  const agg2 = (leg1.awayScore ?? 0) + (leg2.homeScore ?? 0);
  if (agg1 > agg2) return { winnerId: p1, loserId: p2 };
  if (agg2 > agg1) return { winnerId: p2, loserId: p1 };

  // Aggregate draw — resolved via penalties
  if (tie.penaltyWinnerId) {
    const loser = tie.penaltyWinnerId === p1 ? p2 : p1;
    return { winnerId: tie.penaltyWinnerId, loserId: loser };
  }
  return null;
}

/**
 * Given a completed tie, returns the next-round tie and which player slot (1 or 2)
 * the winner should occupy. Returns null for Final / 3rd-place ties.
 */
function findNextTie(
  currentTie: KnockoutTie,
  allTies: KnockoutTie[],
): { nextTie: KnockoutTie; position: 1 | 2 } | null {
  if (currentTie.round === "final" || currentTie.round === "third_place")
    return null;

  const roundProgression: KnockoutRound[] = [
    "round_of_16",
    "quarterfinal",
    "semifinal",
    "final",
  ];
  const currIdx = roundProgression.indexOf(currentTie.round);
  if (currIdx === -1) return null;

  const sameRound = allTies.filter((t) => t.round === currentTie.round);
  const posInRound = sameRound.findIndex((t) => t.id === currentTie.id);
  if (posInRound === -1) return null;

  const nextRoundName: KnockoutRound = roundProgression[currIdx + 1];
  const nextRoundTies = allTies.filter((t) => t.round === nextRoundName);

  const nextTieIdx = Math.floor(posInRound / 2);
  if (nextTieIdx >= nextRoundTies.length) return null;

  return {
    nextTie: nextRoundTies[nextTieIdx],
    position: (posInRound % 2 === 0 ? 1 : 2) as 1 | 2,
  };
}

/** Sync match player IDs from their parent tie's player slots. */
function syncTieMatches(tie: KnockoutTie, matches: Match[]): Match[] {
  return matches.map((m) => {
    if (m.id === tie.leg1MatchId) {
      return {
        ...m,
        homePlayerId: tie.player1Id ?? "",
        awayPlayerId: tie.player2Id ?? "",
      };
    }
    if (tie.leg2MatchId && m.id === tie.leg2MatchId) {
      return {
        ...m,
        homePlayerId: tie.player2Id ?? "",
        awayPlayerId: tie.player1Id ?? "",
      };
    }
    return m;
  });
}

/**
 * Propagate a winner/loser to the appropriate next-round slots and sync match IDs.
 * Also handles 3rd-place slot for semifinal losers.
 */
function applyAdvancement(
  result: { winnerId: string; loserId: string },
  currentTie: KnockoutTie,
  ties: KnockoutTie[],
  matches: Match[],
): { ties: KnockoutTie[]; matches: Match[] } {
  let updatedTies = ties.map((t) =>
    t.id === currentTie.id ? { ...t, winnerId: result.winnerId } : t,
  );
  let updatedMatches = [...matches];

  // Advance winner to next round
  const nextInfo = findNextTie(currentTie, updatedTies);
  if (nextInfo) {
    updatedTies = updatedTies.map((t) => {
      if (t.id !== nextInfo.nextTie.id) return t;
      return nextInfo.position === 1
        ? { ...t, player1Id: result.winnerId }
        : { ...t, player2Id: result.winnerId };
    });
    const nextTie = updatedTies.find((t) => t.id === nextInfo.nextTie.id)!;
    updatedMatches = syncTieMatches(nextTie, updatedMatches);
  }

  // SF loser → 3rd-place slot
  if (currentTie.round === "semifinal") {
    const thirdTie = updatedTies.find((t) => t.round === "third_place");
    if (thirdTie) {
      const sfTies = updatedTies.filter((t) => t.round === "semifinal");
      const sfPos = sfTies.findIndex((t) => t.id === currentTie.id);
      const loserSlot: 1 | 2 = sfPos === 0 ? 1 : 2;
      updatedTies = updatedTies.map((t) => {
        if (t.id !== thirdTie.id) return t;
        return loserSlot === 1
          ? { ...t, player1Id: result.loserId }
          : { ...t, player2Id: result.loserId };
      });
      const updatedThird = updatedTies.find((t) => t.round === "third_place")!;
      updatedMatches = syncTieMatches(updatedThird, updatedMatches);
    }
  }

  return { ties: updatedTies, matches: updatedMatches };
}

function computeTournamentAwards(tournament: Tournament): TournamentAwards {
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
  const managerWins: Record<string, { wins: number; lastWinAt: string }> = {};

  for (const p of tournament.players)
    managerWins[p.id] = { wins: 0, lastWinAt: "" };

  // Sort matches chronologically so goal/tie milestones reflect real recording order.
  const chronological = [...tournament.matches].sort((a, b) =>
    (a.playedAt ?? "").localeCompare(b.playedAt ?? ""),
  );

  for (const m of chronological) {
    if (
      m.status !== "completed" ||
      m.homeScore === null ||
      m.awayScore === null
    )
      continue;

    const playedAt = m.playedAt ?? "";

    if (m.homeScore > m.awayScore) {
      const entry = managerWins[m.homePlayerId] ?? { wins: 0, lastWinAt: "" };
      managerWins[m.homePlayerId] = {
        wins: entry.wins + 1,
        lastWinAt: playedAt,
      };
    }
    if (m.awayScore > m.homeScore) {
      const entry = managerWins[m.awayPlayerId] ?? { wins: 0, lastWinAt: "" };
      managerWins[m.awayPlayerId] = {
        wins: entry.wins + 1,
        lastWinAt: playedAt,
      };
    }

    if (m.isForfeit) continue;

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

  // On a tie, whoever reached the mark last (most recently) ranks first.
  const topScorer = Object.entries(scorerStats)
    .map(([name, s]) => ({ name, ...s }))
    .sort(
      (a, b) => b.goals - a.goals || b.lastGoalAt.localeCompare(a.lastGoalAt),
    )[0];

  const topKeeper = Object.entries(goalkeeperStats)
    .map(([name, s]) => ({ name, ...s }))
    .sort(
      (a, b) =>
        b.cleanSheets - a.cleanSheets ||
        a.conceded - b.conceded ||
        a.matches - b.matches ||
        b.lastMatchAt.localeCompare(a.lastMatchAt),
    )[0];

  const goldenBallManagerId =
    Object.entries(managerWins).sort(
      (a, b) =>
        b[1].wins - a[1].wins || b[1].lastWinAt.localeCompare(a[1].lastWinAt),
    )[0]?.[0] ?? null;
  const goldenBallManager = goldenBallManagerId
    ? tournament.players.find((p) => p.id === goldenBallManagerId)
    : null;

  return {
    goldenBootName: topScorer?.name ?? null,
    goldenBootTeamId: topScorer?.teamId ?? null,
    goldenGloveName: topKeeper?.name ?? null,
    goldenGloveTeamId: topKeeper?.teamId ?? null,
    goldenBallManagerId,
    goldenBallManagerName: goldenBallManager?.nickname ?? null,
    goldenBallTeamId: goldenBallManager?.teamId ?? null,
  };
}

function finalizeIfNeeded(
  tournament: Tournament,
  editions: TournamentEdition[],
): { tournament: Tournament; editions: TournamentEdition[] } {
  const finalTie = tournament.ties.find((t) => t.round === "final");
  if (!finalTie?.winnerId || !finalTie.player1Id || !finalTie.player2Id) {
    return { tournament, editions };
  }

  const runnerUpPlayerId =
    finalTie.winnerId === finalTie.player1Id
      ? finalTie.player2Id
      : finalTie.player1Id;
  const champion = tournament.players.find((p) => p.id === finalTie.winnerId);
  const runnerUp = tournament.players.find((p) => p.id === runnerUpPlayerId);
  if (!champion || !runnerUp) return { tournament, editions };

  const awards = computeTournamentAwards(tournament);
  const existingIdx = editions.findIndex(
    (e) => e.tournamentId === tournament.id,
  );
  const editionNumber =
    existingIdx >= 0
      ? editions[existingIdx].editionNumber
      : editions.length + 1;

  const edition: TournamentEdition = {
    id: existingIdx >= 0 ? editions[existingIdx].id : uid(),
    tournamentId: tournament.id,
    editionNumber,
    finishedAt: new Date().toISOString(),
    championPlayerId: champion.id,
    championTeamId: champion.teamId,
    runnerUpPlayerId: runnerUp.id,
    runnerUpTeamId: runnerUp.teamId,
    awards,
    snapshot: {
      ...tournament,
      phase: "finished",
    },
  };

  const nextEditions =
    existingIdx >= 0
      ? editions.map((e, i) => (i === existingIdx ? edition : e))
      : [...editions, edition];

  return {
    tournament: { ...tournament, phase: "finished" },
    editions: nextEditions,
  };
}

// ── Store ──────────────────────────────────────────────────────────────────────

type TournamentStore = {
  tournament: Tournament | null;
  tournaments: Tournament[];
  activeTournamentId: string | null;
  editions: TournamentEdition[];
  setActiveTournament: (id: string | null) => void;
  createTournament: (players: Player[]) => void;
  startNextEdition: () => void;
  resetTournament: () => void;
  recordResult: (
    matchId: string,
    homeScore: number,
    awayScore: number,
    homeScorers?: string[],
    awayScorers?: string[],
    homeGoalkeeperName?: string | null,
    awayGoalkeeperName?: string | null,
    isForfeit?: boolean,
  ) => void;
  recordPenalties: (tieId: string, winnerId: string) => void;
  advanceToKnockout: () => void;
  repairKnockout: () => void;
  deleteTournament: (id: string) => void;
  swapGroupPlayers: (playerAId: string, playerBId: string) => boolean;
  swapKnockoutPlayers: (playerAId: string, playerBId: string) => boolean;
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
};

export const useTournamentStore = create<TournamentStore>()(
  persist(
    (set, get) => ({
      tournament: null,
      tournaments: [],
      activeTournamentId: null,
      editions: [],

      setActiveTournament: (id) => {
        set((state) => {
          const target = id
            ? (state.tournaments.find((t) => t.id === id) ?? null)
            : null;
          return {
            activeTournamentId: target?.id ?? null,
            tournament: target,
          };
        });
      },

      createTournament: (players: Player[]) => {
        const n = players.length;
        if (n < 2) return;
        const config = computeConfig(n);

        let tournament: Tournament;
        if (config.numGroups === 0) {
          tournament = buildPureKnockout(players, config.bracketSize);
        } else {
          tournament = buildGroupsKnockout(players, config);
        }

        set((state) => ({
          tournaments: [...state.tournaments, tournament],
          activeTournamentId: tournament.id,
          tournament,
        }));
      },

      startNextEdition: () => {
        // Keep editions history and active tournaments list intact while the current selection is reset.
        set({ tournament: null, activeTournamentId: null });
      },

      resetTournament: () =>
        set((state) => {
          const currentId = state.activeTournamentId ?? state.tournament?.id;
          if (!currentId) {
            return { tournament: null, activeTournamentId: null };
          }

          const remaining = state.tournaments.filter((t) => t.id !== currentId);
          const nextActive = remaining[remaining.length - 1] ?? null;
          return {
            tournaments: remaining,
            activeTournamentId: nextActive?.id ?? null,
            tournament: nextActive,
          };
        }),

      recordResult: (
        matchId,
        homeScore,
        awayScore,
        homeScorers = [],
        awayScorers = [],
        homeGoalkeeperName = null,
        awayGoalkeeperName = null,
        isForfeit = false,
      ) => {
        const { tournament, editions } = get();
        if (!tournament) return;

        const normalizedTies = normalizeKnockoutTies(
          tournament.ties,
          tournament.config.bracketSize,
        );

        const updatedMatches = tournament.matches.map((m) =>
          m.id === matchId
            ? {
                ...m,
                homeScore,
                awayScore,
                status: "completed" as const,
                homeGoalScorers: homeScorers.map((n) => ({ playerName: n })),
                awayGoalScorers: awayScorers.map((n) => ({ playerName: n })),
                homeGoalkeeperName,
                awayGoalkeeperName,
                isForfeit,
                playedAt: new Date().toISOString(),
              }
            : m,
        );

        // Find which tie owns this match
        const match = updatedMatches.find((m) => m.id === matchId);
        const tie = match?.tieId
          ? normalizedTies.find((t) => t.id === match.tieId)
          : undefined;

        if (!tie) {
          const finalized = finalizeIfNeeded(
            { ...tournament, ties: normalizedTies, matches: updatedMatches },
            editions,
          );
          set({
            tournament: finalized.tournament,
            editions: finalized.editions,
          });
          return;
        }

        // Check if tie is now fully resolved
        const result = determineTieWinner(tie, updatedMatches);
        if (!result) {
          // Not yet decided (waiting for 2nd leg or penalties)
          const finalized = finalizeIfNeeded(
            { ...tournament, ties: normalizedTies, matches: updatedMatches },
            editions,
          );
          set((state) => ({
            tournament: finalized.tournament,
            editions: finalized.editions,
            activeTournamentId:
              state.activeTournamentId ?? state.tournament?.id ?? null,
            tournaments: state.tournaments.map((t) =>
              t.id === tournament.id ? finalized.tournament : t,
            ),
          }));
          return;
        }

        if (tie.round === "final" || tie.round === "third_place") {
          // Just stamp the winner, no further advancement
          const newTies = normalizedTies.map((t) =>
            t.id === tie.id ? { ...t, winnerId: result.winnerId } : t,
          );
          const finalized = finalizeIfNeeded(
            { ...tournament, ties: newTies, matches: updatedMatches },
            editions,
          );
          set((state) => ({
            tournament: finalized.tournament,
            editions: finalized.editions,
            activeTournamentId:
              state.activeTournamentId ?? state.tournament?.id ?? null,
            tournaments: state.tournaments.map((t) =>
              t.id === tournament.id ? finalized.tournament : t,
            ),
          }));
          return;
        }

        const { ties: newTies, matches: newMatches } = applyAdvancement(
          result,
          tie,
          normalizedTies,
          updatedMatches,
        );
        const finalized = finalizeIfNeeded(
          { ...tournament, ties: newTies, matches: newMatches },
          editions,
        );
        set((state) => ({
          tournament: finalized.tournament,
          editions: finalized.editions,
          activeTournamentId:
            state.activeTournamentId ?? state.tournament?.id ?? null,
          tournaments: state.tournaments.map((t) =>
            t.id === tournament.id ? finalized.tournament : t,
          ),
        }));
      },

      recordPenalties: (tieId, winnerId) => {
        const { tournament, editions } = get();
        if (!tournament) return;

        const normalizedTies = normalizeKnockoutTies(
          tournament.ties,
          tournament.config.bracketSize,
        );

        const tie = normalizedTies.find((t) => t.id === tieId);
        if (!tie) return;

        // Apply penalty winner to the tie
        const tiesWithPenalty = normalizedTies.map((t) =>
          t.id === tieId ? { ...t, penaltyWinnerId: winnerId, winnerId } : t,
        );

        if (tie.round === "final" || tie.round === "third_place") {
          const finalized = finalizeIfNeeded(
            { ...tournament, ties: tiesWithPenalty },
            editions,
          );
          set((state) => ({
            tournament: finalized.tournament,
            editions: finalized.editions,
            activeTournamentId:
              state.activeTournamentId ?? state.tournament?.id ?? null,
            tournaments: state.tournaments.map((t) =>
              t.id === tournament.id ? finalized.tournament : t,
            ),
          }));
          return;
        }

        const loserId =
          tie.player1Id === winnerId
            ? (tie.player2Id ?? "")
            : (tie.player1Id ?? "");

        const { ties: newTies, matches: newMatches } = applyAdvancement(
          { winnerId, loserId },
          tie,
          tiesWithPenalty,
          tournament.matches,
        );
        const finalized = finalizeIfNeeded(
          { ...tournament, ties: newTies, matches: newMatches },
          editions,
        );
        set((state) => ({
          tournament: finalized.tournament,
          editions: finalized.editions,
          activeTournamentId:
            state.activeTournamentId ?? state.tournament?.id ?? null,
          tournaments: state.tournaments.map((t) =>
            t.id === tournament.id ? finalized.tournament : t,
          ),
        }));
      },

      repairKnockout: () => {
        const { tournament, editions } = get();
        if (!tournament || tournament.phase !== "knockout") return;

        let updatedTies = normalizeKnockoutTies(
          tournament.ties,
          tournament.config.bracketSize,
        );
        let updatedMatches = tournament.matches;
        let changed = updatedTies !== tournament.ties;

        const tieIds = updatedTies.map((t) => t.id);
        for (const tieId of tieIds) {
          const tie = updatedTies.find((t) => t.id === tieId);
          if (!tie) continue;
          const result = determineTieWinner(tie, updatedMatches);
          if (!result) continue;

          if (tie.round === "final" || tie.round === "third_place") {
            if (tie.winnerId !== result.winnerId) {
              updatedTies = updatedTies.map((t) =>
                t.id === tie.id ? { ...t, winnerId: result.winnerId } : t,
              );
              changed = true;
            }
            continue;
          }

          const next = applyAdvancement(
            result,
            tie,
            updatedTies,
            updatedMatches,
          );
          if (next.ties !== updatedTies || next.matches !== updatedMatches) {
            updatedTies = next.ties;
            updatedMatches = next.matches;
            changed = true;
          }
        }

        if (changed) {
          const finalized = finalizeIfNeeded(
            {
              ...tournament,
              ties: updatedTies,
              matches: updatedMatches,
            },
            editions,
          );
          set((state) => ({
            tournament: finalized.tournament,
            editions: finalized.editions,
            activeTournamentId:
              state.activeTournamentId ?? state.tournament?.id ?? null,
            tournaments: state.tournaments.map((t) =>
              t.id === tournament.id ? finalized.tournament : t,
            ),
          }));
        }
      },

      advanceToKnockout: () => {
        const { tournament } = get();
        if (!tournament || tournament.phase !== "groups") return;

        const groupStandings = tournament.groups.map((g) =>
          computeStandings(g, tournament.matches),
        );

        // Collect direct qualifiers, split into seeds (group winners) vs the
        // rest (runners-up), so the draw never pits winner-vs-winner or
        // runner-up-vs-runner-up when a cross matchup is available.
        const seeds: QualifiedPlayer[] = [];
        const rest: QualifiedPlayer[] = [];
        const wildcardCandidates: {
          playerId: string;
          groupIndex: number;
          st: Standing;
        }[] = [];

        for (let i = 0; i < tournament.groups.length; i++) {
          const st = groupStandings[i];
          const { qualifiersPerGroup } = tournament.config;
          for (let j = 0; j < qualifiersPerGroup && j < st.length; j++) {
            const entry: QualifiedPlayer = {
              playerId: st[j].playerId,
              groupIndex: i,
            };
            if (j === 0) seeds.push(entry);
            else rest.push(entry);
          }
          // Next player = wildcard candidate
          if (tournament.config.wildCardCount > 0 && st[qualifiersPerGroup]) {
            wildcardCandidates.push({
              playerId: st[qualifiersPerGroup].playerId,
              groupIndex: i,
              st: st[qualifiersPerGroup],
            });
          }
        }

        // Auto-select best wildcard candidates by points → GD → GF
        wildcardCandidates.sort(
          (a, b) =>
            b.st.points - a.st.points ||
            b.st.goalDiff - a.st.goalDiff ||
            b.st.goalsFor - a.st.goalsFor,
        );
        const wildcardQ = wildcardCandidates
          .slice(0, tournament.config.wildCardCount)
          .map((c) => ({ playerId: c.playerId, groupIndex: c.groupIndex }));

        const pairs = buildFirstRoundPairs(seeds, [...rest, ...wildcardQ]);
        const shuffledPairs = shuffle(pairs);

        // Assign qualifiers to first-round knockout ties
        // First-round ties = the first bracketSize/2 ties (before Final + 3rd)
        const firstRoundCount = tournament.config.bracketSize / 2;
        let qIdx = 0;

        const updatedTies = tournament.ties.map((tie, idx) => {
          if (tie.round === "final" || tie.round === "third_place") return tie;
          if (idx >= firstRoundCount) return tie; // later rounds stay TBD
          const pair = shuffledPairs[qIdx];
          qIdx++;
          return {
            ...tie,
            player1Id: pair?.[0] ?? null,
            player2Id: pair?.[1] ?? null,
          };
        });

        // Update match homePlayerId/awayPlayerId for first-round ties
        const updatedMatches = tournament.matches.map((m) => {
          const tie = updatedTies.find(
            (t) => t.leg1MatchId === m.id || t.leg2MatchId === m.id,
          );
          if (!tie || tie.round === "final" || tie.round === "third_place")
            return m;
          const tIdx = updatedTies.indexOf(tie);
          if (tIdx >= firstRoundCount) return m;
          const isLeg1 = tie.leg1MatchId === m.id;
          return {
            ...m,
            homePlayerId: isLeg1
              ? (tie.player1Id ?? "")
              : (tie.player2Id ?? ""),
            awayPlayerId: isLeg1
              ? (tie.player2Id ?? "")
              : (tie.player1Id ?? ""),
          };
        });

        const nextTournament: Tournament = {
          ...tournament,
          phase: "knockout",
          ties: updatedTies,
          matches: updatedMatches,
        };

        set((state) => ({
          tournament: nextTournament,
          activeTournamentId:
            state.activeTournamentId ?? state.tournament?.id ?? null,
          tournaments: state.tournaments.map((t) =>
            t.id === tournament.id ? nextTournament : t,
          ),
        }));
      },

      deleteTournament: (id: string) => {
        set((state) => {
          const remaining = state.tournaments.filter((t) => t.id !== id);
          const remainingEditions = state.editions.filter(
            (e) => e.tournamentId !== id,
          );
          const currentId = state.activeTournamentId ?? state.tournament?.id;
          if (currentId !== id) {
            return {
              tournaments: remaining,
              editions: remainingEditions,
            };
          }

          const nextActive = remaining[remaining.length - 1] ?? null;
          return {
            tournaments: remaining,
            editions: remainingEditions,
            activeTournamentId: nextActive?.id ?? null,
            tournament: nextActive,
          };
        });
      },

      swapGroupPlayers: (playerAId: string, playerBId: string) => {
        const { tournament } = get();
        if (!tournament || tournament.phase !== "groups") return false;
        if (playerAId === playerBId) return false;

        const groupA = tournament.groups.find((g) =>
          g.playerIds.includes(playerAId),
        );
        const groupB = tournament.groups.find((g) =>
          g.playerIds.includes(playerBId),
        );
        if (!groupA || !groupB || groupA.id === groupB.id) return false;

        // Refuse once either group has already played a match, to avoid corrupting recorded results.
        const affectedGroupIds = new Set([groupA.id, groupB.id]);
        const hasPlayedMatches = tournament.matches.some(
          (m) =>
            m.groupId &&
            affectedGroupIds.has(m.groupId) &&
            m.status === "completed",
        );
        if (hasPlayedMatches) return false;

        const swappedGroups = tournament.groups.map((g) => {
          if (g.id === groupA.id) {
            return {
              ...g,
              playerIds: g.playerIds.map((id) =>
                id === playerAId ? playerBId : id,
              ),
            };
          }
          if (g.id === groupB.id) {
            return {
              ...g,
              playerIds: g.playerIds.map((id) =>
                id === playerBId ? playerAId : id,
              ),
            };
          }
          return g;
        });

        const untouchedMatches = tournament.matches.filter(
          (m) => !m.groupId || !affectedGroupIds.has(m.groupId),
        );
        const newGroupMatches = swappedGroups
          .filter((g) => affectedGroupIds.has(g.id))
          .flatMap((g) => makeGroupMatches(g.playerIds, g.id));

        const updatedGroups = swappedGroups.map((g) =>
          affectedGroupIds.has(g.id)
            ? {
                ...g,
                matchIds: newGroupMatches
                  .filter((m) => m.groupId === g.id)
                  .map((m) => m.id),
              }
            : g,
        );

        const nextTournament: Tournament = {
          ...tournament,
          groups: updatedGroups,
          matches: [...untouchedMatches, ...newGroupMatches],
        };

        set((state) => ({
          tournament: nextTournament,
          tournaments: state.tournaments.map((t) =>
            t.id === tournament.id ? nextTournament : t,
          ),
        }));
        return true;
      },

      swapKnockoutPlayers: (playerAId: string, playerBId: string) => {
        const { tournament } = get();
        if (!tournament || tournament.phase !== "knockout") return false;
        if (playerAId === playerBId) return false;

        const firstRoundCount = tournament.config.bracketSize / 2;
        const firstRoundTies = tournament.ties
          .filter((t) => t.round !== "final" && t.round !== "third_place")
          .slice(0, firstRoundCount);

        const tieA = firstRoundTies.find(
          (t) => t.player1Id === playerAId || t.player2Id === playerAId,
        );
        const tieB = firstRoundTies.find(
          (t) => t.player1Id === playerBId || t.player2Id === playerBId,
        );
        if (!tieA || !tieB || tieA.id === tieB.id) return false;

        // Refuse once either tie has already played a leg, to avoid corrupting recorded results.
        const tieIds = new Set([tieA.id, tieB.id]);
        const hasPlayedLeg = tournament.matches.some(
          (m) => m.tieId && tieIds.has(m.tieId) && m.status === "completed",
        );
        if (hasPlayedLeg) return false;

        const updatedTies = tournament.ties.map((t) => {
          if (t.id === tieA.id) {
            return {
              ...t,
              player1Id: t.player1Id === playerAId ? playerBId : t.player1Id,
              player2Id: t.player2Id === playerAId ? playerBId : t.player2Id,
            };
          }
          if (t.id === tieB.id) {
            return {
              ...t,
              player1Id: t.player1Id === playerBId ? playerAId : t.player1Id,
              player2Id: t.player2Id === playerBId ? playerAId : t.player2Id,
            };
          }
          return t;
        });

        const updatedMatches = tournament.matches.map((m) => {
          if (!m.tieId || !tieIds.has(m.tieId)) return m;
          return {
            ...m,
            homePlayerId:
              m.homePlayerId === playerAId
                ? playerBId
                : m.homePlayerId === playerBId
                  ? playerAId
                  : m.homePlayerId,
            awayPlayerId:
              m.awayPlayerId === playerAId
                ? playerBId
                : m.awayPlayerId === playerBId
                  ? playerAId
                  : m.awayPlayerId,
          };
        });

        const nextTournament: Tournament = {
          ...tournament,
          ties: updatedTies,
          matches: updatedMatches,
        };

        set((state) => ({
          tournament: nextTournament,
          tournaments: state.tournaments.map((t) =>
            t.id === tournament.id ? nextTournament : t,
          ),
        }));
        return true;
      },

      addManualEdition: (input) => {
        const edition: TournamentEdition = {
          id: uid(),
          tournamentId: `manual-${uid()}`,
          editionNumber: input.editionNumber,
          finishedAt: new Date().toISOString(),
          championPlayerId: uid(),
          championTeamId: input.championTeamId,
          runnerUpPlayerId: uid(),
          runnerUpTeamId: input.runnerUpTeamId,
          awards: {
            goldenBootName: input.goldenBootName ?? null,
            goldenBootTeamId: null,
            goldenGloveName: input.goldenGloveName ?? null,
            goldenGloveTeamId: null,
            goldenBallManagerId: null,
            goldenBallManagerName: input.goldenBallManagerName ?? null,
            goldenBallTeamId: null,
          },
        };
        set((state) => ({ editions: [...state.editions, edition] }));
      },

      updateEdition: (id, patch) => {
        set((state) => ({
          editions: state.editions.map((e) => {
            if (e.id !== id) return e;
            return {
              ...e,
              editionNumber: patch.editionNumber ?? e.editionNumber,
              championTeamId: patch.championTeamId ?? e.championTeamId,
              runnerUpTeamId: patch.runnerUpTeamId ?? e.runnerUpTeamId,
              awards: {
                ...e.awards,
                goldenBootName:
                  patch.goldenBootName !== undefined
                    ? patch.goldenBootName
                    : e.awards.goldenBootName,
                goldenGloveName:
                  patch.goldenGloveName !== undefined
                    ? patch.goldenGloveName
                    : e.awards.goldenGloveName,
                goldenBallManagerName:
                  patch.goldenBallManagerName !== undefined
                    ? patch.goldenBallManagerName
                    : e.awards.goldenBallManagerName,
              },
            };
          }),
        }));
      },

      deleteEdition: (id) => {
        set((state) => ({
          editions: state.editions.filter((e) => e.id !== id),
        }));
      },
    }),
    {
      name: "ucl-fc26-v4",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
