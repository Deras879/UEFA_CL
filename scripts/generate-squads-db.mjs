import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const sourcePath = path.resolve(rootDir, "../texto.txt");
const outputPath = path.resolve(rootDir, "data", "players-db.json");

const API_BASE = "https://v3.football.api-sports.io";
const API_KEY =
  process.env.API_FOOTBALL_KEY || "b019eb5e65e676a5ba13e2c344f30f21";

const REQUIRED_MISSING_TEAMS = [49, 529, 541];

function normalizePlayer(player) {
  return {
    id: Number(player?.id ?? 0),
    name: String(player?.name ?? "").trim(),
    age: Number(player?.age ?? 0),
    number: player?.number ?? null,
    position: String(player?.position ?? "").trim(),
    photo: String(player?.photo ?? "").trim(),
  };
}

async function readTeamsFromText() {
  const raw = await fs.readFile(sourcePath, "utf8");
  const data = JSON.parse(raw);

  if (!Array.isArray(data?.response)) {
    throw new Error(
      "El archivo texto.txt no tiene la estructura esperada con response[].",
    );
  }

  const teams = data.response
    .map((entry) => entry?.team)
    .filter(Boolean)
    .map((team) => ({
      id: Number(team.id),
      name: String(team.name ?? "").trim(),
      code: String(team.code ?? "").trim(),
      logo: String(team.logo ?? "").trim(),
    }));

  const required = REQUIRED_MISSING_TEAMS.map((id) => ({
    id,
    name: id === 49 ? "Chelsea" : id === 529 ? "Barcelona" : "Real Madrid",
    code: id === 49 ? "CHE" : id === 529 ? "BAR" : "REA",
    logo: `https://media.api-sports.io/football/teams/${id}.png`,
  }));

  const deduped = new Map();
  for (const team of [...teams, ...required]) {
    if (!team?.id) continue;
    const key = String(team.id);
    if (!deduped.has(key)) deduped.set(key, team);
  }

  return Array.from(deduped.values());
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSquadByTeam(teamId) {
  const url = `${API_BASE}/players/squads?team=${teamId}`;
  let attempt = 0;

  while (attempt < 5) {
    attempt += 1;

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": API_KEY,
        Accept: "application/json",
      },
    });

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after") || 0);
      const waitMs = Math.max(retryAfter * 1000, 2000 * attempt);
      console.warn(
        `⏳ Rate limit para equipo ${teamId}. Reintentando en ${waitMs / 1000}s... (${attempt}/5)`,
      );
      await sleep(waitMs);
      continue;
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Fallo al consultar el equipo ${teamId}: ${response.status} ${text}`,
      );
    }

    const data = await response.json();
    const payload = Array.isArray(data?.response) ? data.response : [];

    const players = payload.flatMap((entry) => {
      if (!Array.isArray(entry?.players)) return [];
      return entry.players.map(normalizePlayer);
    });

    return players;
  }

  throw new Error(`Se excedieron los reintentos para el equipo ${teamId}`);
}

async function main() {
  const allTeams = await readTeamsFromText();
  const teams = allTeams.filter((team) =>
    REQUIRED_MISSING_TEAMS.includes(team.id),
  );

  const existingJson = await fs
    .readFile(outputPath, "utf8")
    .then((content) => JSON.parse(content))
    .catch(() => null);

  const existingMap = new Map(
    (existingJson?.teams ?? []).map((team) => [String(team.teamId), team]),
  );

  const results = [];
  let totalPlayers = 0;

  for (const team of teams) {
    const existingTeam = existingMap.get(String(team.id));
    const shouldFetchRequiredTeam = REQUIRED_MISSING_TEAMS.includes(team.id);

    let players = existingTeam?.players ?? [];

    if ((!players || players.length === 0) && shouldFetchRequiredTeam) {
      players = await fetchSquadByTeam(team.id).catch(() => []);
    }

    const teamRecord = {
      teamId: team.id,
      teamName: team.name,
      teamCode: team.code,
      teamLogo: team.logo,
      players,
    };

    results.push(teamRecord);
    totalPlayers += players.length;
    console.log(`✅ ${team.name} (${team.id}) -> ${players.length} jugadores`);

    if (
      shouldFetchRequiredTeam &&
      (!existingTeam || existingTeam.players?.length === 0)
    ) {
      await sleep(250);
    }
  }

  const db = {
    generatedAt: new Date().toISOString(),
    source: "texto.txt",
    totalTeams: results.length,
    totalPlayers,
    teams: results,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(db, null, 2)}\n`, "utf8");

  console.log(`\n📦 Base local creada en: ${outputPath}`);
  console.log(`📊 Total equipos: ${results.length}`);
  console.log(`📊 Total jugadores: ${totalPlayers}`);
}

main().catch((error) => {
  console.error("\n❌ Error al generar la base local:", error.message);
  process.exit(1);
});
