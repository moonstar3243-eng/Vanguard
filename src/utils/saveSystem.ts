import { createInitialUnitLevels, UNIT_ORDER } from '../data/techAndBuildings';
import { normalizeUnitComposition, sumAllUnits } from '../data/worldMap';
import { SCENARIOS } from '../data/scenarios';
import {
  GameState,
  GameVariant,
  Region,
  SaveSlot,
  SaveSlotMeta,
  UnitComposition,
} from '../types/game';

const SAVES_INDEX_KEY = 'vanguard_save_slots_v1';
const LEGACY_V4_KEY = 'vanguard_campaign_save_v4';

export const MANUAL_SLOT_IDS = [
  'slot_1',
  'slot_2',
  'slot_3',
  'slot_4',
  'slot_5',
] as const;

export const AUTOSAVE_SLOT_ID = 'autosave';

const readAllSlotsMap = (): Record<string, SaveSlot> => {
  try {
    const raw = localStorage.getItem(SAVES_INDEX_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, SaveSlot>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const writeAllSlotsMap = (slots: Record<string, SaveSlot>): boolean => {
  try {
    localStorage.setItem(SAVES_INDEX_KEY, JSON.stringify(slots));
    return true;
  } catch {
    // If quota is full, try removing oldest manual slot once or trimming logs
    try {
      const entries = Object.entries(slots);
      if (entries.length > 1) {
        const compact: Record<string, SaveSlot> = {};
        for (const [k, v] of entries) {
          compact[k] = {
            ...v,
            state: {
              ...v.state,
              logs: v.state.logs?.slice(0, 20) ?? [],
            },
          };
        }
        localStorage.setItem(SAVES_INDEX_KEY, JSON.stringify(compact));
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }
};

const normalizeUnitLevels = (
  rawLevels: Partial<UnitComposition> | undefined | null,
  variant: GameVariant,
  regions: Record<string, Region>,
  ownerId: string,
  undergroundUnits?: UnitComposition
): UnitComposition => {
  const base = createInitialUnitLevels(variant);
  if (rawLevels && typeof rawLevels === 'object') {
    for (const ut of UNIT_ORDER) {
      const val = rawLevels[ut];
      if (typeof val === 'number' && Number.isFinite(val)) {
        base[ut] = Math.max(0, Math.min(4, Math.round(val)));
      }
    }
  }
  for (const r of Object.values(regions)) {
    if (r.ownerId !== ownerId) continue;
    for (const ut of UNIT_ORDER) {
      if ((r.units[ut] ?? 0) > 0 && base[ut] < 1) {
        base[ut] = 1;
      }
    }
  }
  if (undergroundUnits) {
    for (const ut of UNIT_ORDER) {
      if ((undergroundUnits[ut] ?? 0) > 0 && base[ut] < 1) {
        base[ut] = 1;
      }
    }
  }
  return base;
};

export const normalizeLoadedGameState = (raw: GameState): GameState | null => {
  if (!raw || !raw.regions || !raw.nations || !raw.resources) return null;

  const gameVariant = raw.gameVariant ?? 'CLASSIC';
  const scenarioId = raw.scenarioId ?? 'modern_2026';
  const multiplayerType = raw.multiplayerType ?? 'SOLO';
  const aiWars = Array.isArray(raw.aiWars) ? raw.aiWars : [];

  const normalizedRegions: Record<string, Region> = {};
  for (const [rId, r] of Object.entries(raw.regions)) {
    const units = normalizeUnitComposition(
      r.units as unknown as Record<string, unknown>,
      {
        terrain: r.terrain,
        gdpTier: raw.nations[r.ownerId]?.gdpTier ?? 1,
        troopsHint: r.troops,
      }
    );
    normalizedRegions[rId] = {
      ...r,
      units,
      troops: sumAllUnits(units),
    };
  }

  const normalizedUnderground = normalizeUnitComposition(
    raw.undergroundUnits as unknown as Record<string, unknown>,
    { gdpTier: 1, troopsHint: raw.undergroundTroops }
  );

  const normalizedResources = {
    ...raw.resources,
    manpower: raw.resources.manpower ?? 120,
  };

  const normalizedBattle = raw.pendingBattle
    ? {
        ...raw.pendingBattle,
        committedUnits: normalizeUnitComposition(
          raw.pendingBattle.committedUnits as unknown as Record<string, unknown>,
          { gdpTier: 1 }
        ),
        defenderUnits: normalizeUnitComposition(
          raw.pendingBattle.defenderUnits as unknown as Record<string, unknown>,
          { terrain: raw.pendingBattle.terrain, gdpTier: 2 }
        ),
        tokens: raw.pendingBattle.tokens.map((t) => ({
          ...t,
          unitClass: t.unitClass ?? 'Infantry',
          branch: t.branch ?? 'Army',
        })),
      }
    : null;

  if (Array.isArray(raw.players) && raw.players.length > 0) {
    const normalizedPlayers = raw.players.map((p) => {
      const pUnits = normalizeUnitComposition(
        p.undergroundUnits as unknown as Record<string, unknown>,
        { gdpTier: 1, troopsHint: p.undergroundTroops }
      );
      const pLevels = normalizeUnitLevels(
        p.unitLevels,
        gameVariant,
        normalizedRegions,
        p.id,
        pUnits
      );
      return {
        ...p,
        undergroundUnits: pUnits,
        undergroundTroops: sumAllUnits(pUnits),
        unitLevels: pLevels,
        resources: {
          ...p.resources,
          manpower: p.resources?.manpower ?? 120,
        },
      };
    });

    const activeIdx = Math.min(
      Math.max(0, raw.activePlayerIndex ?? 0),
      normalizedPlayers.length - 1
    );
    const activePlayerLevels =
      normalizedPlayers[activeIdx]?.unitLevels ??
      normalizeUnitLevels(
        raw.unitLevels,
        gameVariant,
        normalizedRegions,
        normalizedPlayers[activeIdx]?.id ?? 'player',
        normalizedUnderground
      );

    return {
      ...raw,
      gameVariant,
      scenarioId,
      multiplayerType,
      aiWars,
      regions: normalizedRegions,
      undergroundUnits: normalizedUnderground,
      undergroundTroops: sumAllUnits(normalizedUnderground),
      unitLevels: activePlayerLevels,
      resources: normalizedResources,
      pendingBattle: normalizedBattle,
      awaitingHandoff: Boolean(raw.awaitingHandoff),
      activePlayerIndex: activeIdx,
      players: normalizedPlayers,
    };
  }

  // Upgrade legacy single-player v4 save cleanly
  const nationDiplomacy: Record<
    string,
    { relation: number; pactTurns: number; atWar: boolean; allied: boolean }
  > = {};
  for (const [nId, n] of Object.entries(raw.nations)) {
    nationDiplomacy[nId] = {
      relation: n.relation ?? 0,
      pactTurns: n.pactTurns ?? 0,
      atWar: Boolean(n.atWar),
      allied: Boolean(n.allied),
    };
  }

  const legacyLevels = normalizeUnitLevels(
    raw.unitLevels,
    gameVariant,
    normalizedRegions,
    'player',
    normalizedUnderground
  );

  return {
    ...raw,
    gameVariant,
    scenarioId,
    multiplayerType,
    aiWars,
    regions: normalizedRegions,
    undergroundUnits: normalizedUnderground,
    undergroundTroops: sumAllUnits(normalizedUnderground),
    unitLevels: legacyLevels,
    resources: normalizedResources,
    pendingBattle: normalizedBattle,
    activePlayerIndex: 0,
    awaitingHandoff: false,
    players: [
      {
        id: 'player',
        name: 'Commander 1',
        color: '#DC2626',
        phase: raw.phase,
        suspicion: raw.suspicion,
        originId: raw.originId,
        cellRegionId: raw.cellRegionId,
        undergroundTroops: sumAllUnits(normalizedUnderground),
        undergroundUnits: normalizedUnderground,
        capitalRegionId: raw.capitalRegionId,
        combatStyle: raw.combatStyle,
        doctrineUpgrades: raw.doctrineUpgrades ?? [],
        ideology: raw.ideology ?? 'peoples_republic',
        activePolicies: raw.activePolicies ?? [],
        factionLoyalty: raw.factionLoyalty,
        resources: normalizedResources,
        taxPolicy: raw.taxPolicy,
        debtTurns: raw.debtTurns,
        productionDebuffTurns: raw.productionDebuffTurns,
        activeLoans: raw.activeLoans ?? [],
        creditFreezeTurns: raw.creditFreezeTurns ?? 0,
        unlockedTechs: raw.unlockedTechs ?? [],
        unitLevels: legacyLevels,
        stats: raw.stats,
        attackCountsThisTurn: raw.attackCountsThisTurn ?? {},
        covertOpsUsedThisTurn: raw.covertOpsUsedThisTurn ?? {},
        loanCooldown: raw.loanCooldown ?? 0,
        eliminated: false,
        nationDiplomacy,
        humanAllies: [],
        humanWars: [],
      },
    ],
  };
};

const buildMeta = (id: string, state: GameState, name?: string): SaveSlotMeta => {
  const activePlayer = state.players?.[state.activePlayerIndex];
  const activeId = activePlayer?.id ?? 'player';
  const totalProvinces = Object.keys(state.regions).length;
  const provincesOwned = Object.values(state.regions).filter(
    (r) => r.ownerId === activeId
  ).length;
  const activeName = activePlayer?.name ?? 'Commander 1';
  const scenarioId = state.scenarioId ?? 'modern_2026';
  const scenarioLabel =
    state.gameVariant === 'BLITZ'
      ? `Blitz · ${SCENARIOS[scenarioId]?.yearLabel ?? '2026'}`
      : 'Classic';
  const mpLabel =
    state.players && state.players.length > 1
      ? `${state.players.length}P`
      : 'Solo';

  return {
    id,
    name:
      name && name.trim()
        ? name.trim()
        : `${scenarioLabel} (${mpLabel}) · Turn ${state.turn}`,
    savedAt: new Date().toISOString(),
    turn: state.turn,
    gameVariant: state.gameVariant ?? 'CLASSIC',
    scenarioId,
    difficulty: state.difficulty,
    multiplayerType: state.multiplayerType ?? 'SOLO',
    playerCount: state.players?.length ?? 1,
    activePlayerName: activeName,
    provincesOwned,
    totalProvinces,
  };
};

export const listSaveSlots = (): SaveSlotMeta[] => {
  const map = readAllSlotsMap();
  const list = Object.values(map).map((s) => ({
    id: s.id,
    name: s.name,
    savedAt: s.savedAt,
    turn: s.turn,
    gameVariant: s.gameVariant ?? 'CLASSIC',
    scenarioId: s.scenarioId ?? 'modern_2026',
    difficulty: s.difficulty,
    multiplayerType: s.multiplayerType ?? 'SOLO',
    playerCount: s.playerCount ?? 1,
    activePlayerName: s.activePlayerName ?? 'Commander 1',
    provincesOwned: s.provincesOwned ?? 0,
    totalProvinces: s.totalProvinces ?? 705,
  }));

  // Also check legacy v4 autosave if no autosave exists yet
  if (!map[AUTOSAVE_SLOT_ID]) {
    try {
      const legacyRaw = localStorage.getItem(LEGACY_V4_KEY);
      if (legacyRaw) {
        const parsed = normalizeLoadedGameState(JSON.parse(legacyRaw) as GameState);
        if (parsed && parsed.mode === 'PLAYING') {
          list.push(buildMeta(AUTOSAVE_SLOT_ID, parsed, 'Autosave (Recovered)'));
        }
      }
    } catch {
      // Ignore legacy parse errors
    }
  }

  return list.sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime()
  );
};

export const saveToSlot = (
  slotId: string,
  state: GameState,
  customName?: string
): { ok: boolean; slots: SaveSlotMeta[] } => {
  const map = readAllSlotsMap();
  const meta = buildMeta(slotId, state, customName);
  map[slotId] = { ...meta, state };
  const ok = writeAllSlotsMap(map);
  return { ok, slots: listSaveSlots() };
};

export const saveAutosave = (state: GameState): void => {
  if (state.mode !== 'PLAYING') return;
  saveToSlot(AUTOSAVE_SLOT_ID, state, 'Autosave');
  try {
    localStorage.setItem(LEGACY_V4_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage limit
  }
};

export const loadFromSlot = (slotId: string): GameState | null => {
  const map = readAllSlotsMap();
  if (map[slotId]?.state) {
    return normalizeLoadedGameState(map[slotId].state);
  }
  if (slotId === AUTOSAVE_SLOT_ID) {
    try {
      const legacyRaw = localStorage.getItem(LEGACY_V4_KEY);
      if (legacyRaw) {
        return normalizeLoadedGameState(JSON.parse(legacyRaw) as GameState);
      }
    } catch {
      return null;
    }
  }
  return null;
};

export const deleteSaveSlot = (slotId: string): SaveSlotMeta[] => {
  const map = readAllSlotsMap();
  delete map[slotId];
  writeAllSlotsMap(map);
  if (slotId === AUTOSAVE_SLOT_ID) {
    try {
      localStorage.removeItem(LEGACY_V4_KEY);
    } catch {
      // ignore
    }
  }
  return listSaveSlots();
};

export const getLatestSaveMeta = (): SaveSlotMeta | null => {
  const slots = listSaveSlots();
  return slots[0] ?? null;
};

export const exportSaveToJson = (state: GameState, label?: string): void => {
  const meta = buildMeta('export', state, label);
  const payload: SaveSlot = { ...meta, state };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeVariant = (state.gameVariant ?? 'classic').toLowerCase();
  a.download = `vanguard-${safeVariant}-turn-${state.turn}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const parseImportedSaveJson = (rawText: string): GameState | null => {
  try {
    const parsed = JSON.parse(rawText) as Partial<SaveSlot> & Partial<GameState>;
    const candidate = (parsed.state ? parsed.state : parsed) as GameState;
    return normalizeLoadedGameState(candidate);
  } catch {
    return null;
  }
};
