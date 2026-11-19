import { UNIT_ORDER } from '../data/techAndBuildings';
import { emptyUnits } from '../data/worldMap';
import {
  HumanPlayer,
  LogEntry,
  Nation,
  Region,
  UnitComposition,
} from '../types/game';
import { sumUnits } from './battleEngine';

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const scaleUnits = (
  units: UnitComposition,
  targetTotal: number
): UnitComposition => {
  const safeTarget = Math.max(0, Math.round(targetTotal));
  const cur = sumUnits(units);
  if (safeTarget === 0) return emptyUnits();
  if (cur <= 0) {
    const out = emptyUnits();
    out.riflemen = safeTarget;
    return out;
  }
  const ratio = safeTarget / cur;
  const out = emptyUnits();
  let assigned = 0;
  for (const ut of UNIT_ORDER) {
    const scaled = Math.round((units[ut] ?? 0) * ratio);
    out[ut] = Math.max(0, scaled);
    assigned += out[ut];
  }
  const diff = safeTarget - assigned;
  if (diff !== 0) {
    const anchor = UNIT_ORDER.find((u) => out[u] > 0) ?? 'riflemen';
    out[anchor] = Math.max(0, out[anchor] + diff);
  }
  return out;
};

export const canonicalPair = (a: string, b: string): [string, string] =>
  a < b ? [a, b] : [b, a];

export const hasAiWar = (
  aiWars: Array<[string, string]>,
  a: string,
  b: string
): boolean => {
  if (a === b) return false;
  const [x, y] = canonicalPair(a, b);
  return aiWars.some(([p, q]) => p === x && q === y);
};

export const addAiWarPair = (
  aiWars: Array<[string, string]>,
  a: string,
  b: string
): Array<[string, string]> => {
  if (a === b || hasAiWar(aiWars, a, b)) return aiWars;
  return [...aiWars, canonicalPair(a, b)];
};

export const removeAiWarPair = (
  aiWars: Array<[string, string]>,
  a: string,
  b: string
): Array<[string, string]> => {
  const [x, y] = canonicalPair(a, b);
  return aiWars.filter(([p, q]) => !(p === x && q === y));
};

export const callAlliesToWarAgainstNation = (
  activePlayer: HumanPlayer,
  allPlayers: HumanPlayer[],
  nations: Record<string, Nation>,
  regions: Record<string, Region>,
  aiWars: Array<[string, string]>,
  targetNationId: string,
  turn: number,
  logs: LogEntry[]
): {
  aiWars: Array<[string, string]>;
  joinedAllyNames: string[];
  declinedAllyNames: string[];
} => {
  const targetNation = nations[targetNationId];
  if (!targetNation || targetNation.eliminated) {
    return { aiWars, joinedAllyNames: [], declinedAllyNames: [] };
  }

  let nextAiWars = [...aiWars];
  const joinedAllyNames: string[] = [];
  const declinedAllyNames: string[] = [];

  // Precompute which AI nations border the target nation
  const bordersTarget = new Set<string>();
  for (const r of Object.values(regions)) {
    if (r.ownerId !== targetNationId) continue;
    for (const adjId of r.adjacentIds) {
      const adj = regions[adjId];
      if (adj && nations[adj.ownerId] && adj.ownerId !== targetNationId) {
        bordersTarget.add(adj.ownerId);
      }
    }
  }

  // 1. Evaluate AI Military Allies
  for (const [allyId, stance] of Object.entries(activePlayer.nationDiplomacy)) {
    if (!stance.allied || allyId === targetNationId) continue;
    const ally = nations[allyId];
    if (!ally || ally.eliminated || stance.atWar) continue;
    if (hasAiWar(nextAiWars, allyId, targetNationId)) {
      joinedAllyNames.push(ally.name);
      continue;
    }

    let joinChance = 0.68 + (stance.relation - 40) / 140;
    if (bordersTarget.has(allyId)) joinChance += 0.2;
    if (ally.bloc2026 === targetNation.bloc2026) joinChance -= 0.35;
    if (
      (ally.bloc2026 === 'western' && targetNation.bloc2026 === 'brics_eurasian') ||
      (ally.bloc2026 === 'brics_eurasian' && targetNation.bloc2026 === 'western')
    ) {
      joinChance += 0.18;
    }

    if (Math.random() < Math.max(0.2, Math.min(0.96, joinChance))) {
      nextAiWars = addAiWarPair(nextAiWars, allyId, targetNationId);
      joinedAllyNames.push(ally.name);
      logs.unshift({
        id: uid(),
        turn,
        type: 'diplomacy',
        message: `ALLIED WAR CALL: ${ally.name} honored their alliance with ${activePlayer.name} and declared WAR on ${targetNation.name}!`,
      });
    } else {
      stance.allied = false;
      stance.relation = Math.max(-100, stance.relation - 25);
      if (nations[allyId]) {
        nations[allyId] = {
          ...nations[allyId],
          allied: false,
          relation: stance.relation,
        };
      }
      declinedAllyNames.push(ally.name);
      logs.unshift({
        id: uid(),
        turn,
        type: 'diplomacy',
        message: `${ally.name} refused ${activePlayer.name}'s call to arms against ${targetNation.name} and dissolved the alliance.`,
      });
    }
  }

  // 2. Call Human Allies (multiplayer)
  for (const allyHumanId of activePlayer.humanAllies) {
    const allyHuman = allPlayers.find((p) => p.id === allyHumanId);
    if (!allyHuman || allyHuman.eliminated) continue;
    const cur = allyHuman.nationDiplomacy[targetNationId] ?? {
      relation: 0,
      pactTurns: 0,
      atWar: false,
      allied: false,
    };
    if (!cur.atWar) {
      allyHuman.nationDiplomacy[targetNationId] = {
        ...cur,
        atWar: true,
        allied: false,
        pactTurns: 0,
        relation: Math.min(-60, cur.relation - 50),
      };
      joinedAllyNames.push(allyHuman.name);
      logs.unshift({
        id: uid(),
        turn,
        type: 'diplomacy',
        message: `COALITION PACT: ${allyHuman.name} joined ${activePlayer.name}'s war against ${targetNation.name}!`,
      });
    }
  }

  return { aiWars: nextAiWars, joinedAllyNames, declinedAllyNames };
};

export const resolveInterAiConflict = (
  regions: Record<string, Region>,
  nations: Record<string, Nation>,
  aiWars: Array<[string, string]>,
  turn: number,
  logs: LogEntry[]
): Array<[string, string]> => {
  let nextWars = aiWars.filter(
    ([a, b]) =>
      nations[a] && !nations[a].eliminated && nations[b] && !nations[b].eliminated
  );

  // Build ownership lookup
  const regionsByNation: Record<string, Region[]> = {};
  for (const r of Object.values(regions)) {
    if (nations[r.ownerId] && !nations[r.ownerId].eliminated) {
      if (!regionsByNation[r.ownerId]) regionsByNation[r.ownerId] = [];
      regionsByNation[r.ownerId].push(r);
    }
  }

  // 1. Trigger 1-2 new Inter-AI wars per turn after turn 1
  if (turn >= 2 && nextWars.length < 10) {
    const candidates: Array<{ a: Nation; b: Nation; weight: number }> = [];
    const checked = new Set<string>();

    for (const r of Object.values(regions)) {
      const nA = nations[r.ownerId];
      if (!nA || nA.eliminated) continue;
      for (const adjId of r.adjacentIds) {
        const adj = regions[adjId];
        if (!adj) continue;
        const nB = nations[adj.ownerId];
        if (!nB || nB.eliminated || nA.id === nB.id) continue;
        const [x, y] = canonicalPair(nA.id, nB.id);
        const key = `${x}|${y}`;
        if (checked.has(key) || hasAiWar(nextWars, x, y)) continue;
        checked.add(key);

        let weight = 0.08;
        if (nA.bloc2026 !== nB.bloc2026) weight += 0.28;
        if (
          (nA.bloc2026 === 'western' && nB.bloc2026 === 'brics_eurasian') ||
          (nA.bloc2026 === 'brics_eurasian' && nB.bloc2026 === 'western')
        ) {
          weight += 0.35;
        }
        if (Math.abs(nA.gdpTier - nB.gdpTier) >= 2) weight += 0.14;
        candidates.push({ a: nA, b: nB, weight });
      }
    }

    if (candidates.length > 0 && Math.random() < 0.65) {
      candidates.sort((c1, c2) => c2.weight - c1.weight);
      const topSlice = candidates.slice(0, Math.min(18, candidates.length));
      const pick = topSlice[Math.floor(Math.random() * topSlice.length)];
      if (pick) {
        const attacker =
          pick.a.gdpTier >= pick.b.gdpTier ? pick.a : pick.b;
        const defender = attacker.id === pick.a.id ? pick.b : pick.a;
        nextWars = addAiWarPair(nextWars, attacker.id, defender.id);
        logs.unshift({
          id: uid(),
          turn,
          type: 'diplomacy',
          message: `GLOBAL FLASHPOINT: ${attacker.name} declared WAR on ${defender.name}!`,
        });
      }
    }
  }

  // 2. Resolve border skirmishes across active AI wars (capped at 5 per turn for pacing)
  const shuffledWars = [...nextWars].sort(() => Math.random() - 0.5);
  let battlesResolved = 0;

  for (const [nAId, nBId] of shuffledWars) {
    if (battlesResolved >= 5) break;
    const nA = nations[nAId];
    const nB = nations[nBId];
    if (!nA || !nB || nA.eliminated || nB.eliminated) continue;

    // Chance of battle on a border this turn
    if (Math.random() > 0.72) continue;

    const aRegs = regionsByNation[nAId] ?? [];
    const bRegs = regionsByNation[nBId] ?? [];
    if (aRegs.length === 0 || bRegs.length === 0) continue;

    // Find border crossings between nA and nB
    const crossings: Array<{ from: Region; to: Region }> = [];
    for (const rA of aRegs) {
      for (const adjId of rA.adjacentIds) {
        const adj = regions[adjId];
        if (!adj) continue;
        if (adj.ownerId === nBId) {
          if (rA.troops > adj.troops * 0.85 && rA.troops >= 6) {
            crossings.push({ from: rA, to: adj });
          }
          if (adj.troops > rA.troops * 0.85 && adj.troops >= 6) {
            crossings.push({ from: adj, to: rA });
          }
        }
      }
    }

    if (crossings.length === 0) continue;

    crossings.sort(
      (c1, c2) => c2.from.troops - c2.to.troops - (c1.from.troops - c1.to.troops)
    );
    const battle = crossings[0];
    const atkNation = nations[battle.from.ownerId];
    const defNation = nations[battle.to.ownerId];
    if (!atkNation || !defNation) continue;

    const sendTroops = Math.max(3, Math.round(battle.from.troops * 0.6));
    const terrainMult =
      battle.to.terrain === 'Mountain'
        ? 1.25
        : battle.to.terrain === 'Urban'
        ? 1.15
        : 1.0;
    const fortMult = 1 + (battle.to.buildings.fortress ?? 0) * 0.22;

    const atkPower = sendTroops * (0.9 + Math.random() * 0.25);
    const defPower =
      battle.to.troops * terrainMult * fortMult * (0.9 + Math.random() * 0.2);

    const atkWon = atkPower > defPower;
    const atkLosses = atkWon
      ? Math.max(1, Math.round(sendTroops * 0.35))
      : Math.max(2, Math.round(sendTroops * 0.62));
    const defLosses = atkWon
      ? battle.to.troops
      : Math.min(battle.to.troops - 1, Math.max(1, Math.round(battle.to.troops * 0.35)));

    const remFrom = Math.max(2, battle.from.troops - atkLosses);
    battle.from.units = scaleUnits(battle.from.units, remFrom);
    battle.from.troops = sumUnits(battle.from.units);

    if (atkWon) {
      const survivors = Math.max(4, sendTroops - atkLosses);
      battle.to.ownerId = atkNation.id;
      battle.to.units = scaleUnits(battle.from.units, survivors);
      battle.to.troops = sumUnits(battle.to.units);
      battle.to.unrest = 22;

      // Refresh cached ownership lists
      regionsByNation[defNation.id] = (regionsByNation[defNation.id] ?? []).filter(
        (r) => r.id !== battle.to.id
      );
      if (!regionsByNation[atkNation.id]) regionsByNation[atkNation.id] = [];
      regionsByNation[atkNation.id].push(battle.to);

      logs.unshift({
        id: uid(),
        turn,
        type: 'war',
        message: `${atkNation.name} captured ${battle.to.name} from ${defNation.name}!`,
      });

      if ((regionsByNation[defNation.id] ?? []).length === 0) {
        nations[defNation.id] = {
          ...defNation,
          eliminated: true,
          atWar: false,
        };
        nextWars = nextWars.filter(
          ([x, y]) => x !== defNation.id && y !== defNation.id
        );
        logs.unshift({
          id: uid(),
          turn,
          type: 'diplomacy',
          message: `NATION COLLAPSE: ${defNation.name} was conquered by ${atkNation.name}!`,
        });
      }
    } else {
      const remTo = Math.max(2, battle.to.troops - defLosses);
      battle.to.units = scaleUnits(battle.to.units, remTo);
      battle.to.troops = sumUnits(battle.to.units);
    }

    battlesResolved += 1;
  }

  // 3. Occasional peace treaty for stale AI wars
  if (nextWars.length > 2 && Math.random() < 0.08) {
    const idx = Math.floor(Math.random() * nextWars.length);
    const [aId, bId] = nextWars[idx];
    const nA = nations[aId];
    const nB = nations[bId];
    nextWars = removeAiWarPair(nextWars, aId, bId);
    if (nA && nB) {
      logs.unshift({
        id: uid(),
        turn,
        type: 'diplomacy',
        message: `CEASEFIRE: ${nA.name} and ${nB.name} signed a white peace.`,
      });
    }
  }

  return nextWars;
};
