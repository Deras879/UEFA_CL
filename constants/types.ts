export interface UCLTeam {
  id: string;
  name: string;
  shortName: string;
  country: string;
  flag: string;
  primaryColor: string;
  secondaryColor: string;
  sportsDbName: string;
  badgeUrl?: string;
}

export interface GoalEntry {
  playerId?: string;
  teamId?: string;
  playerName: string;
}

export interface Player {
  id: string;
  nickname: string;
  teamId: string;
}

export type TournamentFormat = "knockout" | "groups-knockout";
export type TournamentPhase = "knockout" | "groups" | "finished";
export type KnockoutRound =
  | "round_of_16"
  | "quarterfinal"
  | "semifinal"
  | "final"
  | "third_place";

export interface Match {
  id: string;
  homePlayerId: string;
  awayPlayerId: string;
  homeScore: number | null;
  awayScore: number | null;
  homeGoalScorers: GoalEntry[];
  awayGoalScorers: GoalEntry[];
  homeGoalkeeperName?: string | null;
  awayGoalkeeperName?: string | null;
  status: "scheduled" | "completed";
  phase:
    | "group"
    | "round_of_16"
    | "quarterfinal"
    | "semifinal"
    | "final"
    | "third_place";
  groupId?: string;
  tieId?: string;
  leg?: 1 | 2;
  /** When the result was recorded — used to break award ties chronologically. */
  playedAt?: string;
  /** Administrative 3-0 result; it affects standings but not player statistics. */
  isForfeit?: boolean;
}

export interface Standing {
  playerId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
}

export interface Group {
  id: string;
  name: string;
  playerIds: string[];
  matchIds: string[];
}

export interface KnockoutTie {
  id: string;
  round: KnockoutRound;
  player1Id: string | null;
  player2Id: string | null;
  leg1MatchId: string | null;
  leg2MatchId: string | null;
  winnerId: string | null;
  isSingleLeg: boolean;
  penaltyWinnerId: string | null;
}

export interface TournamentConfig {
  numGroups: number;
  bracketSize: number;
  qualifiersPerGroup: number;
  wildCardCount: number;
}

export interface Tournament {
  id: string;
  format: TournamentFormat;
  phase: TournamentPhase;
  config: TournamentConfig;
  players: Player[];
  groups: Group[];
  matches: Match[];
  ties: KnockoutTie[];
  createdAt: string;
}

export interface TournamentAwards {
  goldenBootName: string | null;
  goldenBootTeamId: string | null;
  goldenGloveName: string | null;
  goldenGloveTeamId: string | null;
  goldenBallManagerId: string | null;
  goldenBallManagerName: string | null;
  goldenBallTeamId: string | null;
}

export interface TournamentEdition {
  id: string;
  tournamentId: string;
  editionNumber: number;
  finishedAt: string;
  championPlayerId: string;
  championTeamId: string;
  runnerUpPlayerId: string;
  runnerUpTeamId: string;
  awards: TournamentAwards;
  snapshot?: Tournament;
}
