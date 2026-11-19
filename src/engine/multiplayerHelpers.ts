import { createInitialUnitLevels } from '../data/techAndBuildings';
import {
  Bloc2026,
  GameState,
  HumanPlayer,
  IdeologyId,
  Nation,
  NationStance,
  Region,
} from '../types/game';

export const PLAYER_IDS = ['player', 'player_2', 'player_3', 'player_4'] as const;

export const PLAYER_COLORS = ['#DC2626', '#0284C7', '#059669', '#D97706'] as const;

export const getActivePlayerId = (state: GameState): string =>
  state.players?.[state.activePlayerIndex]?.id ?? 'player';

export const getActivePlayer = (state: GameState): HumanPlayer | null =>
  state.players?.[state.activePlayerIndex] ?? null;

export const isHumanOwner = (state: GameState, ownerId: string): boolean => {
  if (state.players && state.players.length > 0) {
    return state.players.some((p) => p.id === ownerId);
  }
  return ownerId === 'player' || ownerId.startsWith('player_');
};

export const getHumanPlayerById = (
  state: GameState,
  playerId: string
): HumanPlayer | undefined => state.players?.find((p) => p.id === playerId);

export const getOwnerDisplayName = (state: GameState, ownerId: string): string => {
  const hp = getHumanPlayerById(state, ownerId);
  if (hp) return hp.name;
  if (ownerId === 'player') return 'Your Regime';
  if (ownerId === 'rebels') return 'Separatist Rebels';
  return state.nations[ownerId]?.name ?? 'Independent';
};

export const getOwnerColor = (state: GameState, ownerId: string): string => {
  const hp = getHumanPlayerById(state, ownerId);
  if (hp) return hp.color;
  if (ownerId === 'player') return '#DC2626';
  if (ownerId === 'rebels') return '#EA580C';
  return state.nations[ownerId]?.color ?? '#334155';
};

export const computeExposedRelationForNation = (
  nation: Nation,
  ideology: IdeologyId,
  hostNationId: string | null,
  hostBloc: Bloc2026
): { relation: number; atWar: boolean } => {
  if (nation.id === hostNationId) {
    return { relation: -95, atWar: true };
  }
  if (nation.bloc2026 === hostBloc) {
    return { relation: -30, atWar: false };
  }
  if (ideology === 'peoples_republic' || ideology === 'junta') {
    if (nation.bloc2026 === 'brics_eurasian') return { relation: 38, atWar: false };
    if (nation.bloc2026 === 'global_south') return { relation: 24, atWar: false };
    if (nation.bloc2026 === 'arab_islamic') return { relation: 18, atWar: false };
    return { relation: -28, atWar: false };
  }
  if (nation.bloc2026 === 'western') return { relation: 36, atWar: false };
  if (nation.bloc2026 === 'global_south') return { relation: 24, atWar: false };
  if (nation.bloc2026 === 'arab_islamic') return { relation: 16, atWar: false };
  return { relation: -28, atWar: false };
};

export const buildInitialNationDiplomacy = (
  nations: Record<string, Nation>,
  exposed: boolean,
  ideology: IdeologyId,
  hostNationId: string | null,
  hostBloc: Bloc2026
): Record<string, NationStance> => {
  const out: Record<string, NationStance> = {};
  for (const [nId, n] of Object.entries(nations)) {
    if (!exposed || n.eliminated) {
      out[nId] = { relation: 0, pactTurns: 0, atWar: false, allied: false };
    } else {
      const st = computeExposedRelationForNation(n, ideology, hostNationId, hostBloc);
      out[nId] = {
        relation: st.relation,
        pactTurns: 0,
        atWar: st.atWar,
        allied: false,
      };
    }
  }
  return out;
};

export const buildBlitzDiplomacy = (
  nations: Record<string, Nation>,
  startingNation: Nation | undefined,
  regions: Record<string, Region>,
  ownedRegionIds: string[]
): Record<string, NationStance> => {
  const ownBloc: Bloc2026 = startingNation?.bloc2026 ?? 'global_south';
  const out: Record<string, NationStance> = {};

  for (const [nId, n] of Object.entries(nations)) {
    if (n.eliminated) {
      out[nId] = { relation: 0, pactTurns: 0, atWar: false, allied: false };
      continue;
    }
    let rel = 0;
    let allied = false;
    if (n.bloc2026 === ownBloc) {
      rel = 45;
      if (n.gdpTier >= 2 && Object.keys(out).length % 7 === 0) {
        allied = true;
      }
    } else if (
      (ownBloc === 'western' && n.bloc2026 === 'brics_eurasian') ||
      (ownBloc === 'brics_eurasian' && n.bloc2026 === 'western')
    ) {
      rel = -35;
    } else {
      rel = 15;
    }
    out[nId] = { relation: rel, pactTurns: 0, atWar: false, allied };
  }

  // Border friction in Blitz
  for (const rId of ownedRegionIds) {
    const r = regions[rId];
    if (!r) continue;
    for (const adjId of r.adjacentIds) {
      const adj = regions[adjId];
      if (adj && nations[adj.ownerId] && !nations[adj.ownerId].eliminated) {
        const cur = out[adj.ownerId];
        if (cur && nations[adj.ownerId].bloc2026 !== ownBloc) {
          cur.relation = Math.max(-100, cur.relation - 15);
        }
      }
    }
  }

  return out;
};

/**
 * Persists top-level convenience fields from GameState back into players[activePlayerIndex].
 */
export const snapshotActivePlayer = (state: GameState): GameState => {
  if (!state.players || state.players.length === 0) return state;
  const idx = state.activePlayerIndex;
  const cur = state.players[idx];
  if (!cur) return state;

  const nationDiplomacy: Record<string, NationStance> = { ...cur.nationDiplomacy };
  for (const [nId, n] of Object.entries(state.nations)) {
    nationDiplomacy[nId] = {
      relation: n.relation,
      pactTurns: n.pactTurns,
      atWar: n.atWar,
      allied: Boolean(n.allied),
    };
  }

  const updated: HumanPlayer = {
    ...cur,
    phase: state.phase,
    suspicion: state.suspicion,
    originId: state.originId,
    cellRegionId: state.cellRegionId,
    undergroundTroops: state.undergroundTroops,
    undergroundUnits: { ...state.undergroundUnits },
    capitalRegionId: state.capitalRegionId,
    combatStyle: state.combatStyle,
    doctrineUpgrades: [...state.doctrineUpgrades],
    ideology: state.ideology,
    activePolicies: [...state.activePolicies],
    factionLoyalty: { ...state.factionLoyalty },
    resources: { ...state.resources },
    taxPolicy: state.taxPolicy,
    debtTurns: state.debtTurns,
    productionDebuffTurns: state.productionDebuffTurns,
    activeLoans: [...state.activeLoans],
    creditFreezeTurns: state.creditFreezeTurns,
    unlockedTechs: [...state.unlockedTechs],
    unitLevels: { ...state.unitLevels },
    stats: { ...state.stats },
    attackCountsThisTurn: { ...state.attackCountsThisTurn },
    covertOpsUsedThisTurn: { ...state.covertOpsUsedThisTurn },
    loanCooldown: state.loanCooldown,
    nationDiplomacy,
  };

  const nextPlayers = [...state.players];
  nextPlayers[idx] = updated;
  return { ...state, players: nextPlayers };
};

/**
 * Loads players[nextIndex] into the top-level GameState convenience fields & overlays their nation stances.
 */
export const hydratePlayerIntoState = (
  state: GameState,
  nextIndex: number
): GameState => {
  const p = state.players[nextIndex];
  if (!p) return state;

  const nextNations: Record<string, Nation> = {};
  for (const [nId, n] of Object.entries(state.nations)) {
    const stance = p.nationDiplomacy[nId] ?? {
      relation: 0,
      pactTurns: 0,
      atWar: false,
      allied: false,
    };
    nextNations[nId] = {
      ...n,
      relation: stance.relation,
      pactTurns: stance.pactTurns,
      atWar: stance.atWar,
      allied: stance.allied,
    };
  }

  return {
    ...state,
    activePlayerIndex: nextIndex,
    phase: p.phase,
    suspicion: p.suspicion,
    originId: p.originId,
    cellRegionId: p.cellRegionId,
    undergroundTroops: p.undergroundTroops,
    undergroundUnits: { ...p.undergroundUnits },
    capitalRegionId: p.capitalRegionId,
    combatStyle: p.combatStyle,
    doctrineUpgrades: [...p.doctrineUpgrades],
    ideology: p.ideology,
    activePolicies: [...p.activePolicies],
    factionLoyalty: { ...p.factionLoyalty },
    resources: { ...p.resources },
    taxPolicy: p.taxPolicy,
    debtTurns: p.debtTurns,
    productionDebuffTurns: p.productionDebuffTurns,
    activeLoans: [...p.activeLoans],
    creditFreezeTurns: p.creditFreezeTurns,
    unlockedTechs: [...p.unlockedTechs],
    unitLevels: { ...(p.unitLevels ?? createInitialUnitLevels(state.gameVariant)) },
    stats: { ...p.stats },
    attackCountsThisTurn: { ...p.attackCountsThisTurn },
    covertOpsUsedThisTurn: { ...p.covertOpsUsedThisTurn },
    loanCooldown: p.loanCooldown,
    nations: nextNations,
  };
};
