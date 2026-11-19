import {
  getUnitEffectiveStats,
  getUnitMatchupMultiplier,
  UNIT_ORDER,
  UNITS,
} from '../data/techAndBuildings';
import { emptyUnits, sumAllUnits } from '../data/worldMap';
import {
  BattleTile,
  BattleTileType,
  BattleToken,
  GameState,
  PendingBattle,
  Region,
  TerrainType,
  UnitComposition,
  UnitType,
} from '../types/game';

export const BATTLE_ROWS = 4;
export const BATTLE_COLS = 6;

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const sumUnits = (u: Partial<UnitComposition> | undefined | null): number =>
  sumAllUnits(u);

const hasDoctrine = (state: GameState, id: string) =>
  state.doctrineUpgrades.includes(id);

export const generateBattleGrid = (
  terrain: TerrainType,
  hasFortress: boolean,
  seedKey: string
): BattleTile[] => {
  let seed = 0;
  for (let i = 0; i < seedKey.length; i++) {
    seed = (seed * 31 + seedKey.charCodeAt(i)) >>> 0;
  }
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const tiles: BattleTile[] = [];
  for (let r = 0; r < BATTLE_ROWS; r++) {
    for (let c = 0; c < BATTLE_COLS; c++) {
      let type: BattleTileType = 'open';
      const roll = rand();

      if (c === 0) {
        type = roll < 0.3 ? 'cover' : 'open';
      } else if (c >= 4 && hasFortress && (r === 1 || r === 2 || roll < 0.45)) {
        type = c === 4 ? 'bunker' : roll < 0.5 ? 'ridge' : 'cover';
      } else if (terrain === 'Mountain') {
        if (roll < 0.45) type = 'ridge';
        else if (roll < 0.72) type = 'chokepoint';
        else if (roll < 0.9) type = 'cover';
      } else if (terrain === 'Urban') {
        if (c >= 3 && roll < 0.35) type = 'bunker';
        else if (roll < 0.7) type = 'cover';
        else if (roll < 0.85) type = 'open';
        else type = 'chokepoint';
      } else if (terrain === 'Coastal') {
        if (c === 1 || c === 2) {
          type = roll < 0.65 ? 'chokepoint' : 'open';
        } else {
          type = roll < 0.42 ? 'ridge' : roll < 0.75 ? 'cover' : 'open';
        }
      } else if (terrain === 'Desert') {
        if (roll < 0.22) type = 'ridge';
        else if (roll < 0.34) type = 'chokepoint';
        else type = 'open';
      } else {
        if (roll < 0.24) type = 'cover';
        else if (roll < 0.38) type = 'ridge';
        else if (roll < 0.48) type = 'chokepoint';
        else type = 'open';
      }

      tiles.push({ row: r, col: c, type });
    }
  }
  return tiles;
};

const getTileAt = (tiles: BattleTile[], row: number, col: number) =>
  tiles.find((t) => t.row === row && t.col === col);

interface SpawnSpec {
  unitType: UnitType;
  count: number;
}

const buildSquadSpecs = (units: UnitComposition): SpawnSpec[] => {
  const present: SpawnSpec[] = [];
  for (const ut of UNIT_ORDER) {
    const cnt = units[ut] ?? 0;
    if (cnt > 0) {
      present.push({ unitType: ut, count: cnt });
    }
  }

  // If fewer than 8 distinct types, allow large riflemen/mbt stacks to split into 2 squads
  const raw: SpawnSpec[] = [];
  for (const spec of present) {
    if (
      spec.count >= 12 &&
      present.length + raw.filter((x) => x.unitType === spec.unitType).length < 7 &&
      (spec.unitType === 'riflemen' || spec.unitType === 'mbt' || spec.unitType === 'mechanized')
    ) {
      const half = Math.ceil(spec.count / 2);
      raw.push({ unitType: spec.unitType, count: half });
      raw.push({ unitType: spec.unitType, count: spec.count - half });
    } else {
      raw.push(spec);
    }
  }

  // If >8 squads (rare, when >8 distinct unit types are committed), merge smallest squads into same branch leader
  while (raw.length > 8) {
    raw.sort((a, b) => a.count - b.count);
    const smallest = raw.shift()!;
    const sBranch = UNITS[smallest.unitType].branch;
    const target = raw.find((x) => UNITS[x.unitType].branch === sBranch) ?? raw[0];
    if (target) target.count += smallest.count;
  }

  return raw;
};

export const createInitialBattle = (
  state: GameState,
  fromRegionId: string | null,
  toRegion: Region,
  committedUnits: UnitComposition,
  defenderName: string,
  isUprising: boolean
): PendingBattle => {
  const hasFortress = toRegion.buildings.fortress > 0;
  const tiles = generateBattleGrid(
    toRegion.terrain,
    hasFortress,
    `${toRegion.id}_${state.turn}`
  );

  let playerAtkMult = 1.0;
  if (state.resources.funds < 0) {
    playerAtkMult -= state.resources.funds < -100 ? 0.25 : 0.15;
  }
  if (state.resources.materials <= 0) playerAtkMult -= 0.22;
  if (state.resources.energy <= 0) {
    playerAtkMult -= state.combatStyle === 'blitz' ? 0.35 : 0.15;
  }
  if (state.ideology === 'junta') playerAtkMult += 0.15;

  if (state.combatStyle === 'guerilla') {
    if (toRegion.terrain === 'Mountain' || toRegion.terrain === 'Coastal') {
      playerAtkMult += hasDoctrine(state, 'guerilla_tunnels') ? 0.4 : 0.22;
    } else if (!hasDoctrine(state, 'guerilla_swarm')) {
      playerAtkMult -= 0.16;
    }
    if (hasDoctrine(state, 'guerilla_swarm')) playerAtkMult += 0.18;
  } else if (state.combatStyle === 'blitz') {
    if (toRegion.terrain === 'Plains' || toRegion.terrain === 'Desert') {
      playerAtkMult += hasDoctrine(state, 'blitz_columns') ? 0.35 : 0.22;
    }
    if (hasDoctrine(state, 'blitz_spearhead')) playerAtkMult += 0.2;
  } else if (state.combatStyle === 'fortress') {
    if (!hasDoctrine(state, 'fortress_siege')) playerAtkMult -= 0.12;
    if (hasDoctrine(state, 'fortress_curtain')) playerAtkMult += 0.18;
  } else if (state.combatStyle === 'infiltration') {
    if (!hasDoctrine(state, 'infil_hijack')) playerAtkMult -= 0.15;
  }

  let enemyDefMult = 1.0;
  if (toRegion.unrest >= 45) {
    enemyDefMult -= toRegion.unrest >= 75 ? 0.28 : 0.14;
  }
  if (
    state.phase === 'EXPOSED' &&
    toRegion.ownerId !== 'rebels' &&
    state.turn <= 12 &&
    !hasDoctrine(state, 'infil_hijack')
  ) {
    enemyDefMult += 0.12;
  }
  if (hasFortress && !hasDoctrine(state, 'fortress_siege')) {
    const fortScale = hasDoctrine(state, 'blitz_spearhead') ? 0.5 : 1.0;
    enemyDefMult += toRegion.buildings.fortress * 0.15 * fortScale;
  }

  playerAtkMult = Math.max(0.45, playerAtkMult);
  enemyDefMult = Math.max(0.5, enemyDefMult);

  const playerSpecs = buildSquadSpecs(committedUnits);
  const enemySpecs = buildSquadSpecs(toRegion.units);

  const tokens: BattleToken[] = [];

  const pFrontSlots: Array<[number, number]> = [
    [1, 1],
    [2, 1],
    [0, 1],
    [3, 1],
    [1, 0],
    [2, 0],
    [0, 0],
    [3, 0],
  ];
  const pRearSlots: Array<[number, number]> = [
    [1, 0],
    [2, 0],
    [0, 0],
    [3, 0],
    [0, 1],
    [3, 1],
    [1, 1],
    [2, 1],
  ];
  const usedP = new Set<string>();
  const allocSlot = (
    preferred: Array<[number, number]>,
    used: Set<string>
  ): [number, number] => {
    for (const [r, c] of preferred) {
      const k = `${r}_${c}`;
      if (!used.has(k)) {
        used.add(k);
        return [r, c];
      }
    }
    return [0, 0];
  };

  const isRearPref = (ut: UnitType) => {
    const def = UNITS[ut];
    return def.range >= 2 || def.branch === 'Navy' || def.unitClass === 'Artillery';
  };

  playerSpecs.forEach((spec, idx) => {
    const def = UNITS[spec.unitType];
    const eff = getUnitEffectiveStats(
      spec.unitType,
      state.unitLevels?.[spec.unitType] ?? 1
    );
    const [row, col] = allocSlot(
      isRearPref(spec.unitType) ? pRearSlots : pFrontSlots,
      usedP
    );
    const scale = Math.max(1, spec.count);
    const maxHp = Math.round(eff.hp * scale * 0.55);
    const extraArmorMove =
      (def.unitClass === 'Armored' || def.unitClass === 'Vehicle') &&
      state.combatStyle === 'blitz'
        ? 1
        : 0;
    const artRange =
      def.unitClass === 'Artillery' && hasDoctrine(state, 'fortress_siege')
        ? Math.max(4, eff.range + 1)
        : eff.range;

    tokens.push({
      id: `p_${spec.unitType}_${idx}`,
      side: 'player',
      unitType: spec.unitType,
      unitClass: def.unitClass,
      branch: def.branch,
      label: eff.level >= 2 ? `${def.shortName} Lv.${eff.level}` : def.shortName,
      row,
      col,
      count: spec.count,
      maxHp,
      hp: maxHp,
      attack: Math.round(eff.attack * Math.sqrt(scale) * 2.1 * playerAtkMult),
      defense: Math.round(eff.defense * Math.sqrt(scale) * 1.6),
      move: eff.move + extraArmorMove,
      range: artRange,
      hasMoved: false,
      hasActed: false,
    });
  });

  const eFrontSlots: Array<[number, number]> = [
    [1, 4],
    [2, 4],
    [0, 4],
    [3, 4],
    [1, 5],
    [2, 5],
    [0, 5],
    [3, 5],
  ];
  const eRearSlots: Array<[number, number]> = [
    [1, 5],
    [2, 5],
    [0, 5],
    [3, 5],
    [0, 4],
    [3, 4],
    [1, 4],
    [2, 4],
  ];
  const usedE = new Set<string>();

  const defHuman = state.players?.find((p) => p.id === toRegion.ownerId);
  const defNation = state.nations[toRegion.ownerId];
  const aiLevel =
    defNation && defNation.gdpTier >= 3 && state.turn >= 18
      ? 3
      : defNation && defNation.gdpTier >= 2 && state.turn >= 10
      ? 2
      : 1;

  enemySpecs.forEach((spec, idx) => {
    const def = UNITS[spec.unitType];
    const defenderLevel =
      defHuman?.unitLevels?.[spec.unitType] !== undefined
        ? Math.max(1, defHuman.unitLevels[spec.unitType])
        : aiLevel;
    const eff = getUnitEffectiveStats(spec.unitType, defenderLevel);
    const [row, col] = allocSlot(
      isRearPref(spec.unitType) ? eRearSlots : eFrontSlots,
      usedE
    );
    const scale = Math.max(1, spec.count);
    const maxHp = Math.round(eff.hp * scale * 0.55 * enemyDefMult);
    tokens.push({
      id: `e_${spec.unitType}_${idx}`,
      side: 'enemy',
      unitType: spec.unitType,
      unitClass: def.unitClass,
      branch: def.branch,
      label: eff.level >= 2 ? `${def.shortName} Lv.${eff.level}` : def.shortName,
      row,
      col,
      count: spec.count,
      maxHp,
      hp: maxHp,
      attack: Math.round(eff.attack * Math.sqrt(scale) * 2.0 * enemyDefMult),
      defense: Math.round(eff.defense * Math.sqrt(scale) * 1.6 * enemyDefMult),
      move: eff.move,
      range: eff.range,
      hasMoved: false,
      hasActed: false,
    });
  });

  return {
    id: uid(),
    isUprising,
    fromRegionId,
    toRegionId: toRegion.id,
    toRegionName: toRegion.name,
    terrain: toRegion.terrain,
    defenderName,
    committedUnits: { ...committedUnits },
    defenderUnits: { ...toRegion.units },
    hasFortress,
    localUnrest: toRegion.unrest,
    tiles,
    tokens,
    phase: 'DEPLOY',
    round: 1,
    maxRounds: 5,
    winner: null,
    combatLog: [
      `Battle for ${toRegion.name} (${toRegion.terrain}). Position Army, Navy & Air wings in Cols 1–2, then Start Battle!`,
    ],
  };
};

export const getReachableTiles = (
  battle: PendingBattle,
  token: BattleToken
): Set<string> => {
  const occupied = new Set(
    battle.tokens
      .filter((t) => t.hp > 0 && t.id !== token.id)
      .map((t) => `${t.row}_${t.col}`)
  );

  const visitedCost: Record<string, number> = {
    [`${token.row}_${token.col}`]: 0,
  };
  const queue: Array<{ r: number; c: number; cost: number }> = [
    { r: token.row, c: token.col, cost: 0 },
  ];
  const reachable = new Set<string>();

  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  const def = UNITS[token.unitType];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dr, dc] of dirs) {
      const nr = cur.r + dr;
      const nc = cur.c + dc;
      if (nr < 0 || nr >= BATTLE_ROWS || nc < 0 || nc >= BATTLE_COLS) continue;
      const key = `${nr}_${nc}`;
      if (occupied.has(key)) continue;

      const tile = getTileAt(battle.tiles, nr, nc);
      let stepCost = 1;
      if (
        (def.unitClass === 'Armored' || def.unitClass === 'Vehicle') &&
        (tile?.type === 'ridge' || tile?.type === 'chokepoint')
      ) {
        stepCost = 2;
      }
      if (def.unitClass === 'Support' || def.branch === 'Air Force') {
        stepCost = 1;
      }

      const nextCost = cur.cost + stepCost;
      if (
        nextCost <= token.move &&
        (visitedCost[key] === undefined || nextCost < visitedCost[key])
      ) {
        visitedCost[key] = nextCost;
        reachable.add(key);
        queue.push({ r: nr, c: nc, cost: nextCost });
      }
    }
  }

  return reachable;
};

export const getAttackableTokens = (
  battle: PendingBattle,
  attacker: BattleToken
): BattleToken[] => {
  return battle.tokens.filter((t) => {
    if (t.hp <= 0 || t.side === attacker.side) return false;
    const dist = Math.abs(t.row - attacker.row) + Math.abs(t.col - attacker.col);
    return dist >= 1 && dist <= attacker.range;
  });
};

export interface TacticalDamagePreview {
  damageToTarget: number;
  retaliationDamage: number;
  notes: string[];
}

export const previewTacticalAttack = (
  battle: PendingBattle,
  attacker: BattleToken,
  defender: BattleToken,
  state?: GameState
): TacticalDamagePreview => {
  const atkTile = getTileAt(battle.tiles, attacker.row, attacker.col);
  const defTile = getTileAt(battle.tiles, defender.row, defender.col);
  const dist = Math.abs(attacker.row - defender.row) + Math.abs(attacker.col - defender.col);
  const notes: string[] = [];

  const atkDef = UNITS[attacker.unitType];
  const defDef = UNITS[defender.unitType];

  let atkMult = 1.0;
  let defMitigation = 1.0;

  // 1. Unit Type vs Unit Type Matrix
  const matchup = getUnitMatchupMultiplier(attacker.unitType, defender.unitType);
  atkMult *= matchup.mult;
  if (matchup.reason) {
    notes.push(matchup.reason);
  }

  // 2. Branch Terrain Bonuses
  if (atkDef.branch === 'Navy' && battle.terrain === 'Coastal') {
    atkMult += 0.2;
    notes.push('Coastal Naval Support (+20%)');
  }
  if (atkDef.unitClass === 'Armored' && atkTile?.type === 'open') {
    atkMult += 0.2;
    notes.push('Armor Open Field (+20%)');
  }

  // 3. High ground advantage
  if (atkTile?.type === 'ridge' && atkDef.branch !== 'Air Force') {
    atkMult += 0.2;
    notes.push('High Ground (+20% Atk)');
  }
  if (defTile?.type === 'ridge' && defDef.branch !== 'Air Force') {
    defMitigation *= 0.82;
    notes.push('Target High Ground (-18% Dmg)');
  }

  // 4. Flanking
  const alliesAdjacent = battle.tokens.some(
    (t) =>
      t.hp > 0 &&
      t.side === attacker.side &&
      t.id !== attacker.id &&
      Math.abs(t.row - defender.row) + Math.abs(t.col - defender.col) === 1
  );
  const rearFlank =
    attacker.side === 'player'
      ? attacker.col >= defender.col
      : attacker.col <= defender.col;

  if (alliesAdjacent || rearFlank) {
    const flankBonus = attacker.unitType === 'commandos' ? 0.45 : 0.28;
    atkMult += flankBonus;
    notes.push(`Flanking (+${Math.round(flankBonus * 100)}%)`);
  }

  // 5. Cover & Bunkers (Air Force Bombers & Gunships bypass ground cover!)
  const siegeIgnoresFort =
    attacker.side === 'player' && state && hasDoctrine(state, 'fortress_siege');
  const hijacked =
    attacker.side === 'player' && state && hasDoctrine(state, 'infil_hijack');
  const airBypass = atkDef.branch === 'Air Force';

  if (defTile?.type === 'cover' && !hijacked && !airBypass) {
    const coverSave = defDef.unitClass === 'Infantry' ? 0.68 : 0.78;
    defMitigation *= coverSave;
    notes.push('Cover (-22%/-32% Dmg)');
  } else if (defTile?.type === 'bunker' && !siegeIgnoresFort && !hijacked) {
    if (atkDef.unitClass === 'Artillery' || attacker.unitType === 'bomber') {
      atkMult += 0.35;
      notes.push('Bunker Buster (+35%)');
    } else {
      defMitigation *= 0.62;
      notes.push('Bunker (-38% Dmg)');
    }
  } else if (defTile?.type === 'chokepoint') {
    atkMult += 0.15;
    notes.push('Caught in Chokepoint (+15%)');
  }

  if (defDef.unitClass === 'Artillery' && dist === 1) {
    atkMult += 0.35;
    notes.push('Exposed Artillery in Melee (+35%)');
  }

  const hpFactor = 0.55 + 0.45 * (attacker.hp / Math.max(1, attacker.maxHp));
  const rawDamage =
    attacker.attack *
    hpFactor *
    atkMult *
    defMitigation *
    (12 / Math.max(8, defender.defense * 0.28 + 8));

  const damageToTarget = Math.max(4, Math.round(rawDamage));

  // Counter-fire scaled by defender's own type matchup against attacker
  let retaliationDamage = 0;
  if (defender.hp - damageToTarget > 0 && dist <= defender.range) {
    const retMatch = getUnitMatchupMultiplier(defender.unitType, attacker.unitType).mult;
    const retFactor = 0.38 + 0.28 * (defender.hp / Math.max(1, defender.maxHp));
    retaliationDamage = Math.max(
      2,
      Math.round(
        defender.attack *
          retFactor *
          retMatch *
          (defDef.unitClass === 'Artillery' && dist === 1 ? 0.28 : 0.45)
      )
    );
  }

  return { damageToTarget, retaliationDamage, notes };
};

export const checkBattleCompletion = (battle: PendingBattle): PendingBattle => {
  const pAlive = battle.tokens.filter((t) => t.side === 'player' && t.hp > 0);
  const eAlive = battle.tokens.filter((t) => t.side === 'enemy' && t.hp > 0);

  if (eAlive.length === 0) {
    return {
      ...battle,
      phase: 'COMPLETE',
      winner: 'player',
      combatLog: ['VICTORY! Enemy defenders routed from the province.', ...battle.combatLog],
    };
  }
  if (pAlive.length === 0) {
    return {
      ...battle,
      phase: 'COMPLETE',
      winner: 'enemy',
      combatLog: ['DEFEAT! Assault forces were destroyed.', ...battle.combatLog],
    };
  }
  if (battle.round > battle.maxRounds) {
    const pHp = pAlive.reduce((s, t) => s + t.hp, 0);
    const eHp = eAlive.reduce((s, t) => s + t.hp, 0);
    const pForward = pAlive.filter((t) => t.col >= 3).length;
    const playerWon = pHp + pForward * 12 > eHp;
    return {
      ...battle,
      phase: 'COMPLETE',
      winner: playerWon ? 'player' : 'enemy',
      combatLog: [
        playerWon
          ? 'TIME EXPIRED — Superior ground control & force secures the province!'
          : 'TIME EXPIRED — Defenders held their lines!',
        ...battle.combatLog,
      ],
    };
  }
  return battle;
};

export const executeTokenAttack = (
  battle: PendingBattle,
  attackerId: string,
  defenderId: string,
  state?: GameState
): PendingBattle => {
  const atk = battle.tokens.find((t) => t.id === attackerId);
  const def = battle.tokens.find((t) => t.id === defenderId);
  if (!atk || !def || atk.hp <= 0 || def.hp <= 0 || atk.hasActed) return battle;

  const preview = previewTacticalAttack(battle, atk, def, state);
  const newDefHp = Math.max(0, def.hp - preview.damageToTarget);
  const newAtkHp = Math.max(0, atk.hp - preview.retaliationDamage);

  const tokens = battle.tokens.map((t) => {
    if (t.id === def.id) return { ...t, hp: newDefHp };
    if (t.id === atk.id) return { ...t, hp: newAtkHp, hasActed: true, hasMoved: true };
    return t;
  });

  const bonusTag = preview.notes.length > 0 ? ` [${preview.notes[0]}]` : '';
  const line = `${atk.side === 'player' ? 'Your' : 'Enemy'} ${atk.label} hit ${def.label} for ${preview.damageToTarget} dmg${
    preview.retaliationDamage > 0 ? ` (took ${preview.retaliationDamage} return fire)` : ''
  }${bonusTag}.`;

  return checkBattleCompletion({
    ...battle,
    tokens,
    combatLog: [line, ...battle.combatLog].slice(0, 14),
  });
};

export const runAiSideTurn = (
  battle: PendingBattle,
  side: 'player' | 'enemy',
  state?: GameState
): PendingBattle => {
  let cur: PendingBattle = {
    ...battle,
    tokens: battle.tokens.map((t) =>
      t.side === side ? { ...t, hasMoved: false, hasActed: false } : t
    ),
  };

  const actingIds = cur.tokens
    .filter((t) => t.side === side && t.hp > 0)
    .map((t) => t.id);

  for (const tid of actingIds) {
    if (cur.phase === 'COMPLETE') break;
    const tok = cur.tokens.find((t) => t.id === tid);
    if (!tok || tok.hp <= 0) continue;

    const tokDef = UNITS[tok.unitType];
    const reach = getReachableTiles(cur, tok);
    const enemies = cur.tokens.filter((t) => t.side !== side && t.hp > 0);
    if (enemies.length === 0) break;

    let bestRow = tok.row;
    let bestCol = tok.col;
    let bestScore = -9999;

    const candidates: Array<[number, number]> = [[tok.row, tok.col]];
    for (const key of reach) {
      const [r, c] = key.split('_').map(Number);
      candidates.push([r, c]);
    }

    for (const [r, c] of candidates) {
      const tile = getTileAt(cur.tiles, r, c);
      let score = 0;
      if (tile?.type === 'ridge') score += 14;
      else if (tile?.type === 'bunker') score += 16;
      else if (tile?.type === 'cover') score += 10;
      else if (tile?.type === 'open' && tokDef.unitClass === 'Armored') score += 12;

      let minDist = 99;
      let canHit = false;
      let bestTargetBonus = 0;
      for (const e of enemies) {
        const d = Math.abs(r - e.row) + Math.abs(c - e.col);
        if (d < minDist) minDist = d;
        if (d <= tok.range) {
          canHit = true;
          const m = getUnitMatchupMultiplier(tok.unitType, e.unitType).mult;
          bestTargetBonus = Math.max(bestTargetBonus, Math.round((m - 1) * 30));
        }
      }

      if (tokDef.range >= 2) {
        if (canHit && minDist >= 2) score += 35 + bestTargetBonus;
        else if (canHit) score += 12 + bestTargetBonus;
        else score -= minDist * 6;
      } else {
        if (canHit) score += 28 + bestTargetBonus;
        score -= minDist * 8;
      }

      if (score > bestScore) {
        bestScore = score;
        bestRow = r;
        bestCol = c;
      }
    }

    if (bestRow !== tok.row || bestCol !== tok.col) {
      cur = {
        ...cur,
        tokens: cur.tokens.map((t) =>
          t.id === tok.id ? { ...t, row: bestRow, col: bestCol, hasMoved: true } : t
        ),
      };
    }

    const movedTok = cur.tokens.find((t) => t.id === tok.id)!;
    const targets = getAttackableTokens(cur, movedTok);
    if (targets.length > 0) {
      targets.sort((a, b) => {
        const pa = previewTacticalAttack(cur, movedTok, a, state).damageToTarget;
        const pb = previewTacticalAttack(cur, movedTok, b, state).damageToTarget;
        const scoreA =
          pa + (a.hp <= pa ? 25 : 0) + (UNITS[a.unitType].unitClass === 'Artillery' ? 12 : 0);
        const scoreB =
          pb + (b.hp <= pb ? 25 : 0) + (UNITS[b.unitType].unitClass === 'Artillery' ? 12 : 0);
        return scoreB - scoreA;
      });
      cur = executeTokenAttack(cur, movedTok.id, targets[0].id, state);
    }
  }

  return cur;
};

export const advanceTacticalRound = (
  battle: PendingBattle,
  state?: GameState
): PendingBattle => {
  if (battle.phase !== 'COMBAT') return battle;
  let cur = runAiSideTurn(battle, 'enemy', state);
  if (cur.phase === 'COMPLETE') return cur;

  const nextRound = cur.round + 1;
  cur = {
    ...cur,
    round: nextRound,
    tokens: cur.tokens.map((t) =>
      t.side === 'player' ? { ...t, hasMoved: false, hasActed: false } : t
    ),
  };
  return checkBattleCompletion(cur);
};

export const autoResolveTacticalBattle = (
  battle: PendingBattle,
  state?: GameState
): PendingBattle => {
  let cur: PendingBattle = { ...battle, phase: 'COMBAT' };
  let guard = 0;
  while (cur.phase !== 'COMPLETE' && guard < 8) {
    guard++;
    cur = runAiSideTurn(cur, 'player', state);
    if (cur.phase === 'COMPLETE') break;
    cur = advanceTacticalRound(cur, state);
  }
  return cur;
};

export const extractSurvivingUnits = (
  initialUnits: UnitComposition,
  tokens: BattleToken[],
  side: 'player' | 'enemy',
  guaranteeMinimumOnWin = false
): UnitComposition => {
  const result: UnitComposition = emptyUnits();
  const sideTokens = tokens.filter((t) => t.side === side);

  for (const ut of UNIT_ORDER) {
    const unitTokens = sideTokens.filter((t) => t.unitType === ut);
    const maxHp = unitTokens.reduce((s, t) => s + t.maxHp, 0);
    const curHp = unitTokens.reduce((s, t) => s + Math.max(0, t.hp), 0);
    const initCount = initialUnits[ut] ?? 0;
    if (initCount > 0) {
      if (maxHp > 0) {
        const surv = Math.round(initCount * (curHp / maxHp));
        result[ut] = Math.max(curHp > 0 ? 1 : 0, Math.min(initCount, surv));
      } else {
        // Units left in reserve off-grid survive
        result[ut] = initCount;
      }
    }
  }

  if (guaranteeMinimumOnWin && sumUnits(result) === 0) {
    result.riflemen = 1;
  }
  return result;
};
