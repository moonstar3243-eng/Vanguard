import { pickRandomWorldEvent } from '../data/events';
import { applyScenarioToWorld, SCENARIOS } from '../data/scenarios';
import {
  BUILDINGS,
  COMBAT_STYLES,
  createInitialUnitLevels,
  getUnitEffectiveStats,
  getUnitMatchupMultiplier,
  IDEOLOGIES,
  POLICIES,
  TECH_TREE,
  UNIT_ORDER,
  UNIT_TECH_TREE,
  UNITS,
} from '../data/techAndBuildings';
import {
  CAMPAIGN_ORIGINS,
  createInitialNations,
  createInitialRegions,
  emptyUnits,
} from '../data/worldMap';
import {
  BattleReport,
  BilateralLoan,
  BuildingType,
  CombatModifier,
  CombatStyleId,
  Difficulty,
  EventChoice,
  FactionLoyalty,
  GameAction,
  GameMode,
  GameState,
  GameVariant,
  HumanPlayer,
  IdeologyId,
  LogEntry,
  MultiplayerType,
  Nation,
  NetIncome,
  PendingBattle,
  PlayerSetupConfig,
  PolicyId,
  Region,
  ScenarioId,
  TaxPolicy,
  UnitComposition,
  UnitType,
  WorldEvent,
} from '../types/game';
import {
  createInitialBattle,
  extractSurvivingUnits,
  sumUnits,
} from './battleEngine';
import {
  callAlliesToWarAgainstNation,
  hasAiWar,
  resolveInterAiConflict,
} from './conflictEngine';
import {
  buildBlitzDiplomacy,
  buildInitialNationDiplomacy,
  getActivePlayerId,
  hydratePlayerIntoState,
  isHumanOwner,
  PLAYER_COLORS,
  PLAYER_IDS,
  snapshotActivePlayer,
} from './multiplayerHelpers';

export {
  getActivePlayerId,
  getOwnerColor,
  getOwnerDisplayName,
  isHumanOwner,
  PLAYER_COLORS,
  PLAYER_IDS,
} from './multiplayerHelpers';

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const hasTech = (state: GameState, techId: string): boolean =>
  state.unlockedTechs.includes(techId);

export const hasDoctrine = (state: GameState, upgradeId: string): boolean =>
  state.doctrineUpgrades.includes(upgradeId);

export const hasPolicy = (state: GameState, policyId: PolicyId): boolean =>
  state.activePolicies.includes(policyId);

export const getPlayerRegions = (
  state: GameState,
  playerId?: string
): Region[] => {
  const id = playerId ?? getActivePlayerId(state);
  return Object.values(state.regions).filter((r) => r.ownerId === id);
};

const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));

export const scaleUnitsToTotal = (
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
    const val = Math.max(0, Math.round((units[ut] ?? 0) * ratio));
    out[ut] = val;
    assigned += val;
  }
  const diff = safeTarget - assigned;
  if (diff !== 0) {
    const anchor = UNIT_ORDER.find((u) => out[u] > 0) ?? 'riflemen';
    out[anchor] = Math.max(0, out[anchor] + diff);
  }
  return out;
};

export const addUnitCompositions = (
  a: UnitComposition,
  b: UnitComposition
): UnitComposition => {
  const out = emptyUnits();
  for (const ut of UNIT_ORDER) {
    out[ut] = (a[ut] ?? 0) + (b[ut] ?? 0);
  }
  return out;
};

export const subtractUnitCompositions = (
  a: UnitComposition,
  b: UnitComposition
): UnitComposition => {
  const out = emptyUnits();
  for (const ut of UNIT_ORDER) {
    out[ut] = Math.max(0, (a[ut] ?? 0) - (b[ut] ?? 0));
  }
  return out;
};

export const splitUnitsByFraction = (
  available: UnitComposition,
  fraction: number
): UnitComposition => {
  const total = sumUnits(available);
  if (total <= 1) return emptyUnits();
  const maxSend = total - 1;
  const target = clamp(Math.round(maxSend * fraction), 1, maxSend);

  const out = emptyUnits();
  for (const ut of UNIT_ORDER) {
    const cnt = available[ut] ?? 0;
    out[ut] = Math.min(cnt, Math.max(0, Math.round((cnt / total) * target)));
  }

  while (sumUnits(out) > maxSend) {
    const pick = UNIT_ORDER.find((u) => out[u] > 0);
    if (!pick) break;
    out[pick] -= 1;
  }

  if (sumUnits(out) === 0) {
    const pick = UNIT_ORDER.find((u) => (available[u] ?? 0) > 0);
    if (pick) out[pick] = 1;
  }

  return out;
};

export const createMultiplayerGame = (
  playerConfigs: PlayerSetupConfig[],
  gameVariant: GameVariant,
  difficulty: Difficulty,
  multiplayerType: MultiplayerType,
  roomCode?: string,
  scenarioId: ScenarioId = 'modern_2026'
): GameState => {
  const effectiveScenario: ScenarioId =
    gameVariant === 'BLITZ' ? scenarioId : 'modern_2026';
  const regions = createInitialRegions();
  const nations = createInitialNations();
  const initialAiWars = applyScenarioToWorld(effectiveScenario, regions, nations);

  const diffMult = difficulty === 'Brutal' ? 1.2 : 1.0;
  for (const r of Object.values(regions)) {
    const targetTroops = Math.max(4, Math.round(r.troops * diffMult));
    r.units = scaleUnitsToTotal(r.units, targetTroops);
    r.troops = sumUnits(r.units);
  }

  const safeConfigs =
    playerConfigs.length > 0
      ? playerConfigs.slice(0, 4)
      : [
          {
            name: 'Commander 1',
            originId: CAMPAIGN_ORIGINS[0].id,
            combatStyle: 'guerilla' as CombatStyleId,
          },
        ];

  const players: HumanPlayer[] = [];
  const logs: LogEntry[] = [];

  if (effectiveScenario !== 'modern_2026') {
    logs.unshift({
      id: uid(),
      turn: 1,
      type: 'diplomacy',
      message: `SCENARIO ACTIVE: ${SCENARIOS[effectiveScenario].name} — Historical alliances, fleets, and conflicts mobilized!`,
    });
  }

  // Fallback list of unclaimed nations for Blitz collisions
  const allNationIds = Object.keys(nations);

  safeConfigs.forEach((cfg, idx) => {
    const pId = cfg.id ?? PLAYER_IDS[idx] ?? `player_${idx + 1}`;
    const pColor = PLAYER_COLORS[idx] ?? '#DC2626';
    const origin =
      CAMPAIGN_ORIGINS.find((o) => o.id === cfg.originId) ??
      CAMPAIGN_ORIGINS[idx % CAMPAIGN_ORIGINS.length];

    if (gameVariant === 'BLITZ') {
      let chosenNationId =
        cfg.startingNationId && nations[cfg.startingNationId] && !nations[cfg.startingNationId].eliminated
          ? cfg.startingNationId
          : regions[origin.startRegionId]?.hostNationId;

      if (!chosenNationId || nations[chosenNationId]?.eliminated) {
        chosenNationId =
          allNationIds.find((nId) => !nations[nId].eliminated) ?? allNationIds[0];
      }

      const chosenNation = nations[chosenNationId];
      const nationRegions = Object.values(regions).filter(
        (r) => r.ownerId === chosenNationId
      );

      for (const nr of nationRegions) {
        nr.ownerId = pId;
        nr.unrest = 12;
        nr.troops = Math.max(nr.troops, 16);
        nr.units = scaleUnitsToTotal(nr.units, nr.troops);
        nr.troops = sumUnits(nr.units);
      }

      if (chosenNation) {
        nations[chosenNationId] = {
          ...chosenNation,
          eliminated: true,
          atWar: false,
        };
      }

      const capRegion =
        nationRegions.find((r) => r.id === chosenNation?.capitalRegionId) ??
        nationRegions[0] ??
        Object.values(regions)[0];

      const nationDiplomacy = buildBlitzDiplomacy(
        nations,
        chosenNation,
        regions,
        nationRegions.map((r) => r.id)
      );

      // Carry over scenario starting wars if chosen nation was already at war in WW2/Cold War
      for (const [wA, wB] of initialAiWars) {
        if (wA === chosenNationId && nationDiplomacy[wB]) {
          nationDiplomacy[wB].atWar = true;
          nationDiplomacy[wB].allied = false;
          nationDiplomacy[wB].relation = -90;
        } else if (wB === chosenNationId && nationDiplomacy[wA]) {
          nationDiplomacy[wA].atWar = true;
          nationDiplomacy[wA].allied = false;
          nationDiplomacy[wA].relation = -90;
        }
      }

      const initialFunds = difficulty === 'Brutal' ? 280 : 380;
      const initialManpower = Math.min(
        850,
        Math.max(140, 120 + nationRegions.length * 22 + (chosenNation?.gdpTier ?? 2) * 35)
      );

      players.push({
        id: pId,
        name: cfg.name.trim() || `Commander ${idx + 1}`,
        color: pColor,
        phase: 'EXPOSED',
        suspicion: 100,
        originId: origin.id,
        startingNationId: chosenNationId,
        cellRegionId: capRegion.id,
        undergroundTroops: 0,
        undergroundUnits: emptyUnits(),
        capitalRegionId: capRegion.id,
        combatStyle: cfg.combatStyle,
        doctrineUpgrades: [],
        ideology: 'peoples_republic',
        activePolicies: [],
        factionLoyalty: { military: 72, industry: 72, civic: 72 },
        resources: {
          funds: initialFunds,
          materials: 90,
          energy: 65,
          manpower: initialManpower,
          influence: 45,
          science: 22,
        },
        taxPolicy: 'Standard',
        debtTurns: 0,
        productionDebuffTurns: 0,
        activeLoans: [],
        creditFreezeTurns: 0,
        unlockedTechs: [],
        unitLevels: createInitialUnitLevels(gameVariant),
        stats: {
          battlesWon: 0,
          battlesLost: 0,
          revoltsFaced: 0,
          backstabsSurvived: 0,
          disastersEndured: 0,
          peakDebt: 0,
          factoriesBuilt: 0,
          techsUnlocked: 0,
        },
        attackCountsThisTurn: {},
        covertOpsUsedThisTurn: {},
        loanCooldown: 0,
        eliminated: false,
        nationDiplomacy,
        humanAllies: [],
        humanWars: [],
      });

      logs.unshift({
        id: uid(),
        turn: 1,
        type: 'event',
        message: `BLITZ COMMAND: ${cfg.name.trim() || `Commander ${idx + 1}`} assumed full command of ${chosenNation?.name ?? 'Territory'} (${nationRegions.length} provinces, 2x Resources & 2x Attacks).`,
      });
    } else {
      // CLASSIC MODE: 1 underground cell
      const startReg = regions[origin.startRegionId] ?? Object.values(regions)[0];
      const startUnits: UnitComposition = { ...origin.startingUnits };
      const initialFunds =
        difficulty === 'Brutal'
          ? Math.round(origin.startingFunds * 0.75)
          : origin.startingFunds;

      const hostNation = nations[startReg.hostNationId];
      const nationDiplomacy = buildInitialNationDiplomacy(
        nations,
        false,
        'peoples_republic',
        startReg.hostNationId,
        hostNation?.bloc2026 ?? 'global_south'
      );

      players.push({
        id: pId,
        name: cfg.name.trim() || `Commander ${idx + 1}`,
        color: pColor,
        phase: 'UNDERGROUND',
        suspicion: 0,
        originId: origin.id,
        cellRegionId: startReg.id,
        undergroundTroops: sumUnits(startUnits),
        undergroundUnits: startUnits,
        capitalRegionId: startReg.id,
        combatStyle: cfg.combatStyle,
        doctrineUpgrades: [],
        ideology: 'peoples_republic',
        activePolicies: [],
        factionLoyalty: { military: 65, industry: 65, civic: 65 },
        resources: {
          funds: initialFunds,
          materials: origin.startingMaterials,
          energy: origin.startingEnergy,
          manpower: origin.startingManpower,
          influence: origin.startingInfluence,
          science: 8,
        },
        taxPolicy: 'Standard',
        debtTurns: 0,
        productionDebuffTurns: 0,
        activeLoans: [],
        creditFreezeTurns: 0,
        unlockedTechs: [],
        unitLevels: createInitialUnitLevels(gameVariant),
        stats: {
          battlesWon: 0,
          battlesLost: 0,
          revoltsFaced: 0,
          backstabsSurvived: 0,
          disastersEndured: 0,
          peakDebt: 0,
          factoriesBuilt: 0,
          techsUnlocked: 0,
        },
        attackCountsThisTurn: {},
        covertOpsUsedThisTurn: {},
        loanCooldown: 0,
        eliminated: false,
        nationDiplomacy,
        humanAllies: [],
        humanWars: [],
      });

      logs.unshift({
        id: uid(),
        turn: 1,
        type: 'event',
        message: `${cfg.name.trim() || origin.name} established a hidden cell in ${startReg.name} (${origin.hostCountryName}).`,
      });
    }
  });

  // Remove scenario AI wars involving nations now piloted by humans
  const takenNationIds = new Set(players.map((p) => p.startingNationId).filter(Boolean));
  const filteredAiWars = initialAiWars.filter(
    ([a, b]) => !takenNationIds.has(a) && !takenNationIds.has(b)
  );

  const p0 = players[0];
  const initialState: GameState = {
    mode: 'PLAYING',
    gameVariant,
    scenarioId: effectiveScenario,
    multiplayerType,
    roomCode,
    players,
    activePlayerIndex: 0,
    awaitingHandoff: false,
    winnerPlayerId: null,
    phase: p0.phase,
    suspicion: p0.suspicion,
    turn: 1,
    difficulty,
    originId: p0.originId,
    cellRegionId: p0.cellRegionId,
    undergroundTroops: p0.undergroundTroops,
    undergroundUnits: { ...p0.undergroundUnits },
    capitalRegionId: p0.capitalRegionId,
    combatStyle: p0.combatStyle,
    doctrineUpgrades: [],
    ideology: p0.ideology,
    activePolicies: [],
    factionLoyalty: { ...p0.factionLoyalty },
    resources: { ...p0.resources },
    taxPolicy: p0.taxPolicy,
    debtTurns: 0,
    productionDebuffTurns: 0,
    regions,
    nations,
    aiWars: filteredAiWars,
    activeLoans: [],
    creditFreezeTurns: 0,
    unlockedTechs: [],
    unitLevels: { ...p0.unitLevels },
    activeEvent: null,
    pendingBattle: null,
    lastBattle: null,
    logs: logs.slice(0, 50),
    stats: { ...p0.stats },
    attackCountsThisTurn: {},
    covertOpsUsedThisTurn: {},
    loanCooldown: 0,
  };

  return hydratePlayerIntoState(initialState, 0);
};

export const createNewGame = (
  originId: string,
  combatStyle: CombatStyleId,
  difficulty: Difficulty,
  gameVariant: GameVariant = 'CLASSIC',
  startingNationId?: string,
  scenarioId: ScenarioId = 'modern_2026'
): GameState =>
  createMultiplayerGame(
    [
      {
        id: 'player',
        name: 'Commander 1',
        originId,
        startingNationId,
        combatStyle,
      },
    ],
    gameVariant,
    difficulty,
    'SOLO',
    undefined,
    scenarioId
  );

export const confirmHandoff = (state: GameState): GameState => ({
  ...state,
  awaitingHandoff: false,
});

export const getLoanServiceCost = (loans: BilateralLoan[]): number => {
  let total = 0;
  for (const loan of loans) {
    const interest = Math.round(loan.remaining * loan.interestRate);
    const principalStep = Math.min(
      loan.remaining,
      Math.ceil(loan.remaining / Math.max(1, loan.turnsLeft))
    );
    total += interest + principalStep;
  }
  return total;
};

export const calculateNetIncome = (state: GameState): NetIncome => {
  const activeId = getActivePlayerId(state);
  const playerRegions = getPlayerRegions(state, activeId);
  const taxMult =
    state.taxPolicy === 'Low' ? 0.8 : state.taxPolicy === 'War' ? 1.35 : 1.0;
  const prodPenalty = state.productionDebuffTurns > 0 ? 0.75 : 1.0;

  let grossFunds = 0;
  let grossMaterials = 0;
  let grossEnergy = 0;
  let grossManpower = 0;
  let grossScience = 3;
  let grossInfluence = 3;
  let buildingUpkeepFunds = 0;
  let buildingUpkeepEnergy = 0;

  const totalUnits: UnitComposition =
    state.phase === 'UNDERGROUND' || playerRegions.length === 0
      ? { ...state.undergroundUnits }
      : emptyUnits();

  const activeEconomyRegions =
    playerRegions.length > 0
      ? playerRegions
      : state.regions[state.cellRegionId]
      ? [state.regions[state.cellRegionId]]
      : [];

  for (const r of activeEconomyRegions) {
    const isCellOnly = r.ownerId !== activeId;
    const baseShare = isCellOnly ? 0.6 : 1.0;
    const unrestEff = r.unrest >= 75 ? 0.55 : r.unrest >= 50 ? 0.8 : 1.0;

    grossFunds += r.baseFunds * baseShare * taxMult * unrestEff;
    grossMaterials += r.baseMaterials * baseShare * unrestEff * prodPenalty;
    grossEnergy += r.baseEnergy * baseShare * unrestEff * prodPenalty;
    grossScience += r.baseScience * baseShare;

    const baseRegionMp =
      r.terrain === 'Urban'
        ? 8
        : r.terrain === 'Plains'
        ? 6
        : r.terrain === 'Coastal'
        ? 5
        : 3;
    grossManpower += (isCellOnly ? 4 : baseRegionMp) * unrestEff;

    if (!isCellOnly && r.units) {
      for (const ut of UNIT_ORDER) {
        totalUnits[ut] += r.units[ut] ?? 0;
      }
    }

    (Object.keys(r.buildings) as BuildingType[]).forEach((bType) => {
      const count = r.buildings[bType];
      if (!count) return;
      const def = BUILDINGS[bType];
      grossFunds += def.deltaFunds * count * unrestEff * taxMult;
      grossMaterials += def.deltaMaterials * count * unrestEff * prodPenalty;
      grossEnergy += def.deltaEnergy * count * unrestEff * prodPenalty;
      grossScience += def.deltaScience * count;
      grossInfluence += def.deltaInfluence * count;
      buildingUpkeepFunds += def.upkeepFunds * count;
      buildingUpkeepEnergy += def.upkeepEnergy * count;
    });
  }

  if (state.ideology === 'peoples_republic') {
    grossMaterials *= 1.25;
    grossFunds *= 0.85;
  } else if (state.ideology === 'syndicalist') {
    grossFunds *= 1.25;
  } else if (state.ideology === 'technocracy') {
    grossScience *= 1.3;
    grossEnergy *= 1.15;
    grossInfluence *= 0.85;
  } else if (state.ideology === 'junta') {
    grossScience *= 0.8;
    grossManpower *= 1.2;
  }

  if (state.combatStyle === 'infiltration') {
    grossInfluence *= 1.4;
  }

  if (hasTech(state, 'central_banking')) grossFunds *= 1.2;
  if (hasTech(state, 'synthetic_fuel')) {
    grossEnergy *= 1.35;
    buildingUpkeepEnergy *= 0.75;
  }
  if (hasTech(state, 'automated_logistics')) grossMaterials *= 1.3;
  if (hasTech(state, 'hearts_and_minds')) grossManpower *= 1.15;
  if (hasTech(state, 'global_hegemony')) grossInfluence *= 1.5;

  if (hasPolicy(state, 'conscription')) grossManpower *= 1.6;
  if (hasPolicy(state, 'welfare_charter')) grossManpower *= 1.2;

  // BLITZ MODE: Double all resource gain!
  if (state.gameVariant === 'BLITZ') {
    grossFunds *= 2;
    grossMaterials *= 2;
    grossEnergy *= 2;
    grossManpower *= 2;
    grossScience *= 2;
    grossInfluence *= 2;
  }

  let policyFundsUpkeep = 0;
  let policyInfluenceUpkeep = 0;
  for (const pId of state.activePolicies) {
    const p = POLICIES[pId];
    if (!p) continue;
    policyFundsUpkeep += p.upkeepFunds;
    policyInfluenceUpkeep += p.upkeepInfluence;
  }
  if (hasPolicy(state, 'press_censorship')) grossScience *= 0.88;
  if (hasPolicy(state, 'martial_law')) grossFunds *= 0.8;

  let armyUpkeepMult = hasTech(state, 'automated_logistics') ? 0.7 : 1.0;
  if (state.combatStyle === 'guerilla') armyUpkeepMult *= 0.7;

  let rawArmyFunds = 0;
  let rawArmyMats = 0;
  let rawArmyEnergy = 0;
  UNIT_ORDER.forEach((ut) => {
    const cnt = totalUnits[ut] ?? 0;
    const def = UNITS[ut];
    const eff = getUnitEffectiveStats(ut, state.unitLevels?.[ut] ?? 1);
    const uDisc = 1 - eff.upkeepDiscount;
    rawArmyFunds += cnt * def.upkeepFunds * uDisc;
    rawArmyMats += cnt * def.upkeepMaterials * uDisc;
    rawArmyEnergy += cnt * def.upkeepEnergy * uDisc;
  });

  const totalTroops = sumUnits(totalUnits);
  const blitzFuelDrain =
    state.combatStyle === 'blitz'
      ? Math.round(totalTroops * (hasDoctrine(state, 'blitz_columns') ? 0.04 : 0.08))
      : 0;

  const armyUpkeepFunds = Math.round(rawArmyFunds * armyUpkeepMult);
  const armyUpkeepMaterials = Math.round(rawArmyMats * armyUpkeepMult);
  const armyUpkeepEnergy = Math.round(rawArmyEnergy * armyUpkeepMult + blitzFuelDrain);

  let debtInterest = 0;
  if (state.resources.funds < 0) {
    let rate = hasTech(state, 'central_banking') ? 0.06 : 0.14;
    if (state.ideology === 'syndicalist') rate *= 0.7;
    debtInterest = Math.max(10, Math.round(Math.abs(state.resources.funds) * rate));
  }

  const loanService = getLoanServiceCost(state.activeLoans);

  if (state.resources.energy < 0) {
    grossMaterials *= 0.75;
  }

  let suspicionDelta = 0;
  if (state.phase === 'UNDERGROUND') {
    let weightedSusp = 0;
    for (const ut of UNIT_ORDER) {
      weightedSusp += (totalUnits[ut] ?? 0) * UNITS[ut].suspicionFactor;
    }
    suspicionDelta = Math.round(weightedSusp / 12);
    if (hasPolicy(state, 'underground_cells')) suspicionDelta -= 3;
    if (hasPolicy(state, 'press_censorship')) suspicionDelta -= 2;
    if (state.combatStyle === 'guerilla') suspicionDelta -= 1;
    if (state.combatStyle === 'infiltration') suspicionDelta -= 1;
  }

  return {
    funds: Math.round(
      grossFunds -
        buildingUpkeepFunds -
        armyUpkeepFunds -
        policyFundsUpkeep -
        debtInterest -
        loanService
    ),
    materials: Math.round(grossMaterials - armyUpkeepMaterials),
    energy: Math.round(grossEnergy - buildingUpkeepEnergy - armyUpkeepEnergy),
    manpower: Math.max(2, Math.round(grossManpower)),
    influence: Math.round(grossInfluence - policyInfluenceUpkeep),
    science: Math.round(grossScience),
    debtInterest,
    loanService,
    armyUpkeepFunds,
    armyUpkeepMaterials,
    armyUpkeepEnergy,
    buildingUpkeepFunds: Math.round(buildingUpkeepFunds),
    buildingUpkeepEnergy: Math.round(buildingUpkeepEnergy),
    suspicionDelta,
  };
};

const addSuspicion = (state: GameState, baseAmount: number): number => {
  if (state.phase !== 'UNDERGROUND') return 0;
  let mult = 1.0;
  if (state.combatStyle === 'guerilla') mult *= 0.6;
  if (state.combatStyle === 'infiltration') mult *= 0.65;
  if (hasTech(state, 'underground_networks')) mult *= 0.7;
  if (hasPolicy(state, 'underground_cells')) mult *= 0.5;
  return clamp(state.suspicion + Math.max(1, Math.round(baseAmount * mult)), 0, 100);
};

export const getBuildingCost = (
  state: GameState,
  buildingType: BuildingType,
  region: Region
): { funds: number; materials: number } => {
  const def = BUILDINGS[buildingType];
  const existing = region.buildings[buildingType] ?? 0;
  const scale = 1 + existing * 0.25;
  let discount = hasTech(state, 'mechanized_assembly') ? 0.8 : 1.0;
  if (buildingType === 'fortress' && state.combatStyle === 'fortress') {
    discount *= 0.75;
  }
  return {
    funds: Math.round(def.costFunds * scale * discount),
    materials: Math.round(def.costMaterials * scale * discount),
  };
};

export const buildStructure = (
  state: GameState,
  regionId: string,
  buildingType: BuildingType
): GameState => {
  const activeId = getActivePlayerId(state);
  const region = state.regions[regionId];
  const canBuildInCell =
    state.phase === 'UNDERGROUND' && regionId === state.cellRegionId;
  if (!region || (region.ownerId !== activeId && !canBuildInCell)) return state;
  if (canBuildInCell && buildingType === 'fortress') return state;

  const cost = getBuildingCost(state, buildingType, region);
  if (state.resources.materials < cost.materials) return state;
  if (state.resources.funds - cost.funds < -200) return state;

  const def = BUILDINGS[buildingType];
  const updatedRegion: Region = {
    ...region,
    buildings: {
      ...region.buildings,
      [buildingType]: (region.buildings[buildingType] ?? 0) + 1,
    },
  };

  return snapshotActivePlayer({
    ...state,
    suspicion: addSuspicion(state, 5),
    resources: {
      ...state.resources,
      funds: state.resources.funds - cost.funds,
      materials: state.resources.materials - cost.materials,
    },
    regions: {
      ...state.regions,
      [regionId]: updatedRegion,
    },
    stats: {
      ...state.stats,
      factoriesBuilt: state.stats.factoriesBuilt + 1,
      peakDebt: Math.min(state.stats.peakDebt, state.resources.funds - cost.funds),
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'economy',
        message: `${canBuildInCell ? 'Secretly built' : 'Constructed'} ${def.name} in ${region.name}.`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const getUnitRecruitCost = (
  state: GameState,
  unitType: UnitType,
  amount?: number
) => {
  const def = UNITS[unitType];
  const count = amount ?? def.batchSize;
  const eff = getUnitEffectiveStats(unitType, state.unitLevels?.[unitType] ?? 1);
  const techDiscount = 1 - eff.costDiscount;
  let fundsMult = techDiscount;
  let matMult = techDiscount;
  if (state.ideology === 'junta') fundsMult *= 0.9;
  if (state.ideology === 'technocracy') fundsMult *= 1.15;
  if (hasPolicy(state, 'conscription')) fundsMult *= 0.75;
  if (state.combatStyle === 'fortress') matMult *= 1.15;

  return {
    count,
    manpower: Math.round(count * def.manpowerCost),
    funds: Math.round(count * def.costFunds * fundsMult),
    materials: Math.round(count * def.costMaterials * matMult),
    energy: Math.round(count * def.costEnergy),
  };
};

export const recruitUnit = (
  state: GameState,
  regionId: string,
  unitType: UnitType,
  amount?: number
): GameState => {
  const activeId = getActivePlayerId(state);
  const region = state.regions[regionId];
  const isUndergroundCell =
    (state.phase === 'UNDERGROUND' || getPlayerRegions(state, activeId).length === 0) &&
    regionId === state.cellRegionId;

  if (!region || (region.ownerId !== activeId && !isUndergroundCell)) return state;

  const def = UNITS[unitType];
  const unitLevel = state.unitLevels?.[unitType] ?? 1;
  if (unitLevel < 1) return state;
  if (def.requiresExposed && state.phase === 'UNDERGROUND') return state;
  if (def.requiresCoastal && region.terrain !== 'Coastal') return state;

  const cost = getUnitRecruitCost(state, unitType, amount);
  if ((state.resources.manpower ?? 0) < cost.manpower) return state;
  if (state.resources.materials < cost.materials) return state;
  if (state.resources.energy < cost.energy) return state;
  if (state.resources.funds - cost.funds < -150) return state;

  const suspBase = Math.max(2, Math.round(cost.count * def.suspicionFactor));
  const nextSuspicion = addSuspicion(state, suspBase);

  if (isUndergroundCell && region.ownerId !== activeId) {
    const nextUnits: UnitComposition = {
      ...state.undergroundUnits,
      [unitType]: (state.undergroundUnits[unitType] ?? 0) + cost.count,
    };
    return snapshotActivePlayer({
      ...state,
      suspicion: nextSuspicion,
      undergroundUnits: nextUnits,
      undergroundTroops: sumUnits(nextUnits),
      resources: {
        ...state.resources,
        manpower: Math.max(0, state.resources.manpower - cost.manpower),
        funds: state.resources.funds - cost.funds,
        materials: state.resources.materials - cost.materials,
        energy: state.resources.energy - cost.energy,
      },
      stats: {
        ...state.stats,
        peakDebt: Math.min(state.stats.peakDebt, state.resources.funds - cost.funds),
      },
      logs: [
        {
          id: uid(),
          turn: state.turn,
          type: 'war',
          message: `Smuggled +${cost.count} ${def.shortName} into ${region.name}.`,
        },
        ...state.logs.slice(0, 49),
      ],
    });
  }

  const nextUnits: UnitComposition = {
    ...region.units,
    [unitType]: (region.units[unitType] ?? 0) + cost.count,
  };

  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      manpower: Math.max(0, state.resources.manpower - cost.manpower),
      funds: state.resources.funds - cost.funds,
      materials: state.resources.materials - cost.materials,
      energy: state.resources.energy - cost.energy,
    },
    regions: {
      ...state.regions,
      [regionId]: {
        ...region,
        units: nextUnits,
        troops: sumUnits(nextUnits),
      },
    },
    stats: {
      ...state.stats,
      peakDebt: Math.min(state.stats.peakDebt, state.resources.funds - cost.funds),
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'war',
        message: `Recruited +${cost.count} ${def.shortName} in ${region.name}.`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const pacifyRegion = (state: GameState, regionId: string): GameState => {
  const activeId = getActivePlayerId(state);
  const region = state.regions[regionId];
  if (!region || region.ownerId !== activeId || region.unrest <= 0) return state;

  const influenceCost = hasTech(state, 'hearts_and_minds') ? 8 : 12;
  const fundsCost = hasTech(state, 'hearts_and_minds') ? 25 : 40;
  if (state.resources.influence < influenceCost) return state;
  if (state.resources.funds - fundsCost < -150) return state;

  const drop = hasTech(state, 'hearts_and_minds') ? 32 : 24;
  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      influence: state.resources.influence - influenceCost,
      funds: state.resources.funds - fundsCost,
    },
    regions: {
      ...state.regions,
      [regionId]: {
        ...region,
        unrest: Math.max(0, region.unrest - drop),
      },
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'revolt',
        message: `Pacified unrest in ${region.name} (-${drop}% Unrest).`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const transferTroops = (
  state: GameState,
  fromId: string,
  toId: string,
  fraction = 0.5
): GameState => {
  const activeId = getActivePlayerId(state);
  const from = state.regions[fromId];
  const to = state.regions[toId];
  if (
    !from ||
    !to ||
    from.ownerId !== activeId ||
    to.ownerId !== activeId ||
    !from.adjacentIds.includes(toId) ||
    from.troops <= 1
  ) {
    return state;
  }

  const movedUnits = splitUnitsByFraction(from.units, fraction);
  const movedTotal = sumUnits(movedUnits);
  if (movedTotal <= 0) return state;

  const fromUnits = subtractUnitCompositions(from.units, movedUnits);
  const toUnits = addUnitCompositions(to.units, movedUnits);

  return snapshotActivePlayer({
    ...state,
    regions: {
      ...state.regions,
      [fromId]: { ...from, units: fromUnits, troops: sumUnits(fromUnits) },
      [toId]: { ...to, units: toUnits, troops: sumUnits(toUnits) },
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'war',
        message: `Redeployed ${movedTotal} forces from ${from.name} to ${to.name}.`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const unlockTechnology = (state: GameState, techId: string): GameState => {
  const node = TECH_TREE.find((t) => t.id === techId);
  if (!node || hasTech(state, techId)) return state;
  const prereqsMet = node.prerequisites.every((p) => hasTech(state, p));
  if (!prereqsMet || state.resources.science < node.cost) return state;

  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      science: state.resources.science - node.cost,
    },
    unlockedTechs: [...state.unlockedTechs, techId],
    stats: {
      ...state.stats,
      techsUnlocked: state.stats.techsUnlocked + 1,
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'tech',
        message: `Researched ${node.name}: ${node.effectSummary}.`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const unlockDoctrineUpgrade = (
  state: GameState,
  upgradeId: string
): GameState => {
  const style = COMBAT_STYLES[state.combatStyle];
  const upg = style.upgrades.find((u) => u.id === upgradeId);
  if (!upg || hasDoctrine(state, upgradeId)) return state;
  if (state.resources.science < upg.costScience) return state;

  if (upg.tier > 1) {
    const prev = style.upgrades.find((u) => u.tier === upg.tier - 1);
    if (prev && !hasDoctrine(state, prev.id)) return state;
  }

  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      science: state.resources.science - upg.costScience,
    },
    doctrineUpgrades: [...state.doctrineUpgrades, upgradeId],
    stats: {
      ...state.stats,
      techsUnlocked: state.stats.techsUnlocked + 1,
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'tech',
        message: `Doctrine Upgraded — ${upg.name}: ${upg.proEffect}.`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const researchUnitLevel = (
  state: GameState,
  unitType: UnitType
): GameState => {
  const tree = UNIT_TECH_TREE[unitType];
  const curLevel = state.unitLevels?.[unitType] ?? 0;
  if (!tree || curLevel >= 4) return state;

  if (curLevel === 0 && tree.prerequisite) {
    const prereqLevel = state.unitLevels?.[tree.prerequisite.unitType] ?? 0;
    if (prereqLevel < tree.prerequisite.minLevel) return state;
  }

  const nextLevel = curLevel + 1;
  const nextSpec = tree.levels.find((l) => l.level === nextLevel);
  if (!nextSpec || state.resources.science < nextSpec.costScience) return state;

  const nextUnitLevels: UnitComposition = {
    ...(state.unitLevels ?? createInitialUnitLevels(state.gameVariant)),
    [unitType]: nextLevel,
  };

  const def = UNITS[unitType];

  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      science: state.resources.science - nextSpec.costScience,
    },
    unitLevels: nextUnitLevels,
    stats: {
      ...state.stats,
      techsUnlocked: state.stats.techsUnlocked + 1,
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'tech',
        message: `${curLevel === 0 ? 'Unlocked' : 'Upgraded'} ${def.name} Lv.${nextLevel} (${nextSpec.designation}): ${nextSpec.perkSummary}.`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const switchIdeology = (
  state: GameState,
  ideologyId: IdeologyId
): GameState => {
  if (state.ideology === ideologyId) return state;
  const def = IDEOLOGIES[ideologyId];
  if (state.resources.influence < def.switchInfluenceCost) return state;

  const nations = { ...state.nations };
  if (state.phase === 'EXPOSED') {
    for (const [nId, n] of Object.entries(nations)) {
      if (n.eliminated) continue;
      let shift = 0;
      if (ideologyId === 'peoples_republic' || ideologyId === 'junta') {
        if (n.bloc2026 === 'brics_eurasian') shift = 15;
        if (n.bloc2026 === 'western') shift = -15;
      } else {
        if (n.bloc2026 === 'western') shift = 15;
        if (n.bloc2026 === 'brics_eurasian') shift = -15;
      }
      if (shift !== 0) {
        nations[nId] = { ...n, relation: clamp(n.relation + shift, -100, 100) };
      }
    }
  }

  return snapshotActivePlayer({
    ...state,
    ideology: ideologyId,
    nations,
    resources: {
      ...state.resources,
      influence: state.resources.influence - def.switchInfluenceCost,
    },
    factionLoyalty: {
      military: clamp(
        state.factionLoyalty.military + (ideologyId === 'junta' ? 12 : -6),
        0,
        100
      ),
      industry: clamp(
        state.factionLoyalty.industry +
          (ideologyId === 'syndicalist' || ideologyId === 'peoples_republic' ? 10 : -5),
        0,
        100
      ),
      civic: clamp(
        state.factionLoyalty.civic + (ideologyId === 'peoples_republic' ? 10 : -5),
        0,
        100
      ),
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'politics',
        message: `Adopted ${def.name} governance doctrine (shifted global 2026 bloc alignments).`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const togglePolicy = (state: GameState, policyId: PolicyId): GameState => {
  const def = POLICIES[policyId];
  if (def.minPhase && def.minPhase !== state.phase) return state;

  const active = hasPolicy(state, policyId);
  const next = active
    ? state.activePolicies.filter((p) => p !== policyId)
    : [...state.activePolicies, policyId];

  return snapshotActivePlayer({
    ...state,
    activePolicies: next,
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'politics',
        message: `${active ? 'Repealed' : 'Enacted'} edict: ${def.name}.`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const appeaseFaction = (
  state: GameState,
  pillar: keyof FactionLoyalty
): GameState => {
  if (state.resources.funds < 45 || state.resources.influence < 8) return state;
  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      funds: state.resources.funds - 45,
      influence: state.resources.influence - 8,
    },
    factionLoyalty: {
      ...state.factionLoyalty,
      [pillar]: clamp(state.factionLoyalty[pillar] + 18, 0, 100),
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'politics',
        message: `Allocated concessions to ${pillar} leadership (+18% Loyalty).`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

// 2026 Bilateral Borrowing System
export const getLenderOffer = (state: GameState, nation: Nation) => {
  const maxAmount = nation.gdpTier * 70;
  const baseRate =
    nation.gdpTier >= 4
      ? 0.05
      : nation.gdpTier === 3
      ? 0.065
      : nation.gdpTier === 2
      ? 0.08
      : 0.1;
  const trustDiscount = nation.relation >= 50 ? 0.015 : 0;
  const interestRate = Number(Math.max(0.035, baseRate - trustDiscount).toFixed(3));
  const alreadyBorrowing = state.activeLoans.some(
    (l) => l.lenderNationId === nation.id
  );
  const eligible =
    state.phase === 'EXPOSED' &&
    !nation.eliminated &&
    !nation.atWar &&
    nation.relation >= 15 &&
    !alreadyBorrowing &&
    state.creditFreezeTurns === 0 &&
    state.activeLoans.length < 4;

  return { maxAmount, interestRate, eligible, alreadyBorrowing };
};

export const borrowFromNation = (
  state: GameState,
  nationId: string,
  amount?: number
): GameState => {
  const nation = state.nations[nationId];
  if (!nation) return state;
  const offer = getLenderOffer(state, nation);
  if (!offer.eligible) return state;

  const principal = Math.min(offer.maxAmount, amount ?? offer.maxAmount);
  const newLoan: BilateralLoan = {
    id: uid(),
    lenderNationId: nation.id,
    lenderName: nation.name,
    bloc2026: nation.bloc2026,
    principal,
    remaining: principal,
    interestRate: offer.interestRate,
    turnsLeft: 8,
  };

  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      funds: state.resources.funds + principal,
    },
    activeLoans: [...state.activeLoans, newLoan],
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'economy',
        message: `Borrowed $${principal} from ${nation.name} at ${(
          offer.interestRate * 100
        ).toFixed(1)}% interest/turn.`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const repayLoan = (state: GameState, loanId: string): GameState => {
  const loan = state.activeLoans.find((l) => l.id === loanId);
  if (!loan || state.resources.funds < loan.remaining) return state;

  const nations = { ...state.nations };
  if (nations[loan.lenderNationId]) {
    nations[loan.lenderNationId] = {
      ...nations[loan.lenderNationId],
      relation: clamp(nations[loan.lenderNationId].relation + 12, -100, 100),
    };
  }

  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      funds: state.resources.funds - loan.remaining,
    },
    nations,
    activeLoans: state.activeLoans.filter((l) => l.id !== loanId),
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'economy',
        message: `Repaid $${loan.remaining} bilateral loan to ${loan.lenderName} (+12 Relation).`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const defaultOnLoan = (state: GameState, loanId: string): GameState => {
  const loan = state.activeLoans.find((l) => l.id === loanId);
  if (!loan) return state;

  const nations = { ...state.nations };
  for (const [nId, n] of Object.entries(nations)) {
    if (n.bloc2026 === loan.bloc2026 && !n.eliminated) {
      nations[nId] = {
        ...n,
        relation: clamp(n.relation - 45, -100, 100),
        atWar: n.id === loan.lenderNationId ? true : n.atWar,
        allied: n.id === loan.lenderNationId ? false : n.allied,
      };
    }
  }

  return snapshotActivePlayer({
    ...state,
    nations,
    activeLoans: state.activeLoans.filter((l) => l.id !== loanId),
    creditFreezeTurns: 5,
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'diplomacy',
        message: `SOVEREIGN DEFAULT! Refused repayment to ${loan.lenderName}. Their 2026 bloc froze credit for 5 turns!`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const courtNation = (state: GameState, nationId: string): GameState => {
  if (state.phase === 'UNDERGROUND') return state;
  const nation = state.nations[nationId];
  if (!nation || nation.eliminated || nation.atWar) return state;
  if (state.resources.influence < 10) return state;

  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      influence: state.resources.influence - 10,
    },
    nations: {
      ...state.nations,
      [nationId]: {
        ...nation,
        relation: clamp(nation.relation + 22, -100, 100),
      },
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'diplomacy',
        message: `Dispatched diplomatic envoy to ${nation.name} (+22 Relation).`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const formAlliance = (state: GameState, nationId: string): GameState => {
  if (state.phase === 'UNDERGROUND') return state;
  const nation = state.nations[nationId];
  if (!nation || nation.eliminated || nation.atWar || nation.allied) return state;
  if (nation.relation < 40) return state;
  if (state.resources.influence < 24 || state.resources.funds - 70 < -120) {
    return state;
  }

  const nextRel = clamp(nation.relation + 15, -100, 100);
  const nextNations = {
    ...state.nations,
    [nationId]: {
      ...nation,
      allied: true,
      pactTurns: Math.max(nation.pactTurns, 8),
      relation: nextRel,
    },
  };

  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      influence: state.resources.influence - 24,
      funds: state.resources.funds - 70,
    },
    nations: nextNations,
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'diplomacy',
        message: `MILITARY ALLIANCE SIGNED: ${nation.name} pledged mutual war support!`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const declareWarOnNation = (
  state: GameState,
  nationId: string
): GameState => {
  if (state.phase === 'UNDERGROUND') return state;
  const nation = state.nations[nationId];
  if (!nation || nation.eliminated || nation.atWar) return state;

  const snap = snapshotActivePlayer(state);
  const nations = { ...snap.nations };
  const logs = [...snap.logs];
  let activeLoans = [...snap.activeLoans];
  let creditFreezeTurns = snap.creditFreezeTurns;

  if (activeLoans.some((l) => l.lenderNationId === nationId)) {
    const attackedBloc = nation.bloc2026;
    activeLoans = activeLoans.filter((l) => l.lenderNationId !== nationId);
    creditFreezeTurns = Math.max(creditFreezeTurns, 5);
    for (const [nId, n] of Object.entries(nations)) {
      if (n.bloc2026 === attackedBloc && !n.eliminated) {
        nations[nId] = { ...n, relation: clamp(n.relation - 45, -100, 100) };
      }
    }
    logs.unshift({
      id: uid(),
      turn: snap.turn,
      type: 'diplomacy',
      message: `Declared war on creditor ${nation.name}! Loan defaulted and credit frozen for 5 turns.`,
    });
  }

  nations[nationId] = {
    ...nation,
    atWar: true,
    allied: false,
    pactTurns: 0,
    relation: -100,
  };

  const activePlayer = snap.players[snap.activePlayerIndex];
  const playersCopy = snap.players.map((p) => ({
    ...p,
    nationDiplomacy: { ...p.nationDiplomacy },
    humanAllies: [...p.humanAllies],
    humanWars: [...p.humanWars],
  }));
  const curP = playersCopy[snap.activePlayerIndex];
  if (curP) {
    curP.nationDiplomacy[nationId] = {
      relation: -100,
      pactTurns: 0,
      atWar: true,
      allied: false,
    };
  }

  logs.unshift({
    id: uid(),
    turn: snap.turn,
    type: 'war',
    message: `WAR DECLARED: ${activePlayer?.name ?? 'Your Regime'} declared WAR on ${nation.name}!`,
  });

  const callRes = curP
    ? callAlliesToWarAgainstNation(
        curP,
        playersCopy,
        nations,
        snap.regions,
        snap.aiWars,
        nationId,
        snap.turn,
        logs
      )
    : { aiWars: snap.aiWars, joinedAllyNames: [], declinedAllyNames: [] };

  const updatedState = snapshotActivePlayer({
    ...snap,
    players: playersCopy,
    nations,
    aiWars: callRes.aiWars,
    activeLoans,
    creditFreezeTurns,
    logs: logs.slice(0, 50),
  });

  return hydratePlayerIntoState(updatedState, updatedState.activePlayerIndex);
};

export const toggleHumanAlliance = (
  state: GameState,
  targetPlayerId: string
): GameState => {
  const activeId = getActivePlayerId(state);
  if (activeId === targetPlayerId) return state;
  const players = state.players.map((p) => ({
    ...p,
    humanAllies: [...p.humanAllies],
    humanWars: [...p.humanWars],
  }));
  const me = players.find((p) => p.id === activeId);
  const them = players.find((p) => p.id === targetPlayerId);
  if (!me || !them || them.eliminated) return state;

  const alreadyAllied = me.humanAllies.includes(targetPlayerId);
  if (alreadyAllied) {
    me.humanAllies = me.humanAllies.filter((id) => id !== targetPlayerId);
    them.humanAllies = them.humanAllies.filter((id) => id !== activeId);
    return {
      ...state,
      players,
      logs: [
        {
          id: uid(),
          turn: state.turn,
          type: 'diplomacy',
          message: `${me.name} ended their coalition alliance with ${them.name}.`,
        },
        ...state.logs.slice(0, 49),
      ],
    };
  }

  if (state.resources.influence < 15) return state;
  me.humanWars = me.humanWars.filter((id) => id !== targetPlayerId);
  them.humanWars = them.humanWars.filter((id) => id !== activeId);
  me.humanAllies.push(targetPlayerId);
  them.humanAllies.push(activeId);

  return snapshotActivePlayer({
    ...state,
    players,
    resources: {
      ...state.resources,
      influence: state.resources.influence - 15,
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'diplomacy',
        message: `HUMAN COALITION: ${me.name} and ${them.name} forged a Military Alliance!`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const declareWarOnHuman = (
  state: GameState,
  targetPlayerId: string
): GameState => {
  const activeId = getActivePlayerId(state);
  if (activeId === targetPlayerId) return state;
  const players = state.players.map((p) => ({
    ...p,
    humanAllies: [...p.humanAllies],
    humanWars: [...p.humanWars],
  }));
  const me = players.find((p) => p.id === activeId);
  const them = players.find((p) => p.id === targetPlayerId);
  if (!me || !them || them.eliminated) return state;

  me.humanAllies = me.humanAllies.filter((id) => id !== targetPlayerId);
  them.humanAllies = them.humanAllies.filter((id) => id !== activeId);
  if (!me.humanWars.includes(targetPlayerId)) me.humanWars.push(targetPlayerId);
  if (!them.humanWars.includes(activeId)) them.humanWars.push(activeId);

  return snapshotActivePlayer({
    ...state,
    players,
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'war',
        message: `COMMANDER WAR: ${me.name} declared WAR on ${them.name}!`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const getCovertOpCost = (
  state: GameState,
  opType: 'sabotage' | 'incite'
): number => {
  const baseCost = opType === 'sabotage' ? 14 : 18;
  let costMult = hasTech(state, 'underground_networks') ? 0.7 : 1.0;
  if (state.combatStyle === 'infiltration') costMult *= 0.6;
  if (opType === 'sabotage' && hasDoctrine(state, 'guerilla_phantom')) {
    costMult *= 0.5;
  }
  return Math.max(4, Math.round(baseCost * costMult));
};

export const runCovertOp = (
  state: GameState,
  targetRegionId: string,
  opType: 'sabotage' | 'incite'
): GameState => {
  const activeId = getActivePlayerId(state);
  const target = state.regions[targetRegionId];
  if (!target || target.ownerId === activeId) return state;
  if (state.covertOpsUsedThisTurn[targetRegionId]) return state;

  const isCellTarget =
    (state.phase === 'UNDERGROUND' || getPlayerRegions(state, activeId).length === 0) &&
    targetRegionId === state.cellRegionId;

  const bordersPlayer = target.adjacentIds.some(
    (adjId) => state.regions[adjId]?.ownerId === activeId
  );
  if (!bordersPlayer && !isCellTarget) return state;

  const cost = getCovertOpCost(state, opType);
  if (state.resources.influence < cost) return state;

  const updatedTarget: Region = { ...target, units: { ...target.units } };
  let msg = '';
  let flippedPeacefully = false;

  if (opType === 'sabotage') {
    const pct = hasDoctrine(state, 'guerilla_phantom') ? 0.38 : 0.22;
    const troopsHit = Math.max(3, Math.round(target.troops * pct));
    const nextTroops = Math.max(2, target.troops - troopsHit);
    updatedTarget.units = scaleUnitsToTotal(target.units, nextTroops);
    updatedTarget.troops = sumUnits(updatedTarget.units);
    msg = `Sabotage cells struck ${target.name} depots (-${troopsHit} enemy troops).`;
  } else {
    const unrestBoost = hasDoctrine(state, 'infil_sleepers') ? 45 : 32;
    const troopPct = hasDoctrine(state, 'infil_sleepers') ? 0.25 : 0.1;
    updatedTarget.unrest = Math.min(100, target.unrest + unrestBoost);
    const troopsHit = Math.max(2, Math.round(target.troops * troopPct));
    const nextTroops = Math.max(2, target.troops - troopsHit);
    updatedTarget.units = scaleUnitsToTotal(target.units, nextTroops);
    updatedTarget.troops = sumUnits(updatedTarget.units);

    if (
      state.phase === 'EXPOSED' &&
      hasDoctrine(state, 'infil_coup') &&
      updatedTarget.unrest >= 75 &&
      updatedTarget.troops <= 18
    ) {
      flippedPeacefully = true;
      updatedTarget.ownerId = activeId;
      const defectTroops = Math.max(6, Math.round(target.troops * 0.5));
      updatedTarget.units = scaleUnitsToTotal(target.units, defectTroops);
      updatedTarget.troops = sumUnits(updatedTarget.units);
      updatedTarget.unrest = 35;
      msg = `BLOODLESS SUBVERSION! Sleeper cells seized ${target.name} from within!`;
    } else {
      msg = `Insurgent agitation sparked riots in ${target.name} (+${unrestBoost}% unrest, -${troopsHit} troops).`;
    }
  }

  const nations = { ...state.nations };
  if (
    state.phase === 'EXPOSED' &&
    target.ownerId !== 'rebels' &&
    nations[target.ownerId]
  ) {
    nations[target.ownerId] = {
      ...nations[target.ownerId],
      relation: Math.max(-100, nations[target.ownerId].relation - 12),
    };
  }

  const nextSuspicion =
    state.phase === 'UNDERGROUND' ? addSuspicion(state, 9) : state.suspicion;

  const regions = {
    ...state.regions,
    [targetRegionId]: updatedTarget,
  };

  if (flippedPeacefully && target.ownerId !== 'rebels' && nations[target.ownerId]) {
    const stillHasLand = Object.values(regions).some(
      (r) => r.ownerId === target.ownerId
    );
    if (!stillHasLand) {
      nations[target.ownerId] = {
        ...nations[target.ownerId],
        eliminated: true,
        atWar: false,
      };
    }
  }

  return snapshotActivePlayer({
    ...state,
    suspicion: nextSuspicion,
    resources: {
      ...state.resources,
      influence: state.resources.influence - cost,
    },
    regions,
    nations,
    covertOpsUsedThisTurn: {
      ...state.covertOpsUsedThisTurn,
      [targetRegionId]: true,
    },
    logs: [
      { id: uid(), turn: state.turn, type: 'diplomacy', message: msg },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const estimateCombatOdds = (
  state: GameState,
  toRegion: Region,
  attackUnits: UnitComposition
): {
  attackPower: number;
  defensePower: number;
  modifiers: CombatModifier[];
} => {
  const modifiers: CombatModifier[] = [];
  let atkMult = 1.0;
  let defMult = 1.0;

  if (state.resources.funds < 0) {
    const pen = state.resources.funds < -100 ? 0.25 : 0.15;
    atkMult -= pen;
    modifiers.push({
      label: 'Debt Pay Mutiny',
      value: `-${Math.round(pen * 100)}% Atk`,
      positive: false,
    });
  }
  if (state.resources.materials <= 0) {
    atkMult -= 0.25;
    modifiers.push({
      label: 'Steel Shortage',
      value: '-25% Atk',
      positive: false,
    });
  }
  if (state.resources.energy <= 0) {
    const fuelPen = state.combatStyle === 'blitz' ? 0.35 : 0.15;
    atkMult -= fuelPen;
    modifiers.push({
      label: state.combatStyle === 'blitz' ? 'Blitz Fuel Collapse' : 'Fuel Shortage',
      value: `-${Math.round(fuelPen * 100)}% Atk`,
      positive: false,
    });
  }

  if (state.ideology === 'junta') {
    atkMult += 0.15;
    modifiers.push({
      label: 'Military Junta Zeal',
      value: '+15% Atk',
      positive: true,
    });
  }

  const hasArmor = (attackUnits.mbt ?? 0) + (attackUnits.mechanized ?? 0) > 0;
  const hasArtillery = (attackUnits.howitzer ?? 0) > 0;
  const hasSpec = (attackUnits.commandos ?? 0) > 0;
  const hasAir =
    (attackUnits.interceptor ?? 0) +
      (attackUnits.gunship ?? 0) +
      (attackUnits.bomber ?? 0) >
    0;
  const hasNavy =
    (attackUnits.frigate ?? 0) +
      (attackUnits.destroyer ?? 0) +
      (attackUnits.carrier ?? 0) >
    0;

  if (hasArmor && (toRegion.terrain === 'Plains' || toRegion.terrain === 'Desert')) {
    modifiers.push({
      label: 'Armored Spearhead Terrain',
      value: '+Tank/IFV Shock',
      positive: true,
    });
  }
  if (hasArtillery && (toRegion.buildings.fortress > 0 || toRegion.terrain === 'Urban')) {
    modifiers.push({
      label: 'Howitzer Siege Support',
      value: '+Bunker Buster',
      positive: true,
    });
  }
  if (hasSpec) {
    modifiers.push({
      label: 'Commando Flanking',
      value: '+Ambush',
      positive: true,
    });
  }
  if (hasAir) {
    atkMult += 0.12;
    modifiers.push({
      label: 'Air Force Strike Support',
      value: '+12% Atk',
      positive: true,
    });
  }
  if (hasNavy && toRegion.terrain === 'Coastal') {
    atkMult += 0.16;
    modifiers.push({
      label: 'Naval Shore Bombardment',
      value: '+16% Atk',
      positive: true,
    });
  }

  const ignoreTerrain = hasDoctrine(state, 'infil_hijack');
  if (!ignoreTerrain) {
    if (toRegion.terrain === 'Mountain') {
      defMult += 0.28;
      modifiers.push({
        label: 'Mountain Ridges',
        value: '+28% Enemy Def',
        positive: false,
      });
    } else if (
      toRegion.terrain === 'Urban' &&
      !hasDoctrine(state, 'fortress_siege')
    ) {
      defMult += 0.2;
      modifiers.push({
        label: 'Urban Cover',
        value: '+20% Enemy Def',
        positive: false,
      });
    } else if (toRegion.terrain === 'Coastal') {
      defMult += 0.1;
      modifiers.push({
        label: 'Amphibious Crossing',
        value: '+10% Enemy Def',
        positive: false,
      });
    }
  }

  if (toRegion.buildings.fortress > 0 && !hasDoctrine(state, 'fortress_siege')) {
    const fortScale = hasDoctrine(state, 'blitz_spearhead') ? 0.5 : 1.0;
    const fortBonus = toRegion.buildings.fortress * 0.25 * fortScale;
    defMult += fortBonus;
    modifiers.push({
      label: 'Bastion Bunkers',
      value: `+${Math.round(fortBonus * 100)}% Enemy Def`,
      positive: false,
    });
  }

  if (toRegion.unrest >= 45) {
    const penalty = toRegion.unrest >= 75 ? 0.28 : 0.14;
    defMult -= penalty;
    modifiers.push({
      label: 'Local Unrest',
      value: `-${Math.round(penalty * 100)}% Enemy Def`,
      positive: true,
    });
  }

  // Type-vs-type strategic firepower weighting
  const defU = toRegion.units;
  const totalDef = Math.max(1, sumUnits(defU));
  let weightedAtk = 0;
  for (const aUt of UNIT_ORDER) {
    const aCnt = attackUnits[aUt] ?? 0;
    if (aCnt <= 0) continue;
    const eff = getUnitEffectiveStats(aUt, state.unitLevels?.[aUt] ?? 1);
    const baseScore = (eff.attack * 0.12 + eff.hp * 0.025) * aCnt;
    let avgMatch = 0;
    for (const dUt of UNIT_ORDER) {
      const dCnt = defU[dUt] ?? 0;
      if (dCnt <= 0) continue;
      avgMatch += (dCnt / totalDef) * getUnitMatchupMultiplier(aUt, dUt).mult;
    }
    weightedAtk += baseScore * (avgMatch || 1);
  }

  let weightedDef = 0;
  for (const dUt of UNIT_ORDER) {
    const dCnt = defU[dUt] ?? 0;
    if (dCnt <= 0) continue;
    const dDef = UNITS[dUt];
    weightedDef += (dDef.defense * 0.12 + dDef.hp * 0.025) * dCnt;
  }

  return {
    attackPower: Math.max(1, weightedAtk * Math.max(0.35, atkMult)),
    defensePower: Math.max(1, weightedDef * Math.max(0.45, defMult)),
    modifiers,
  };
};

const exposeRevolutionToWorld = (
  state: GameState,
  regions: Record<string, Region>,
  nations: Record<string, Nation>,
  logs: LogEntry[],
  seizedRegionId: string | null,
  playerId: string
): void => {
  const p = state.players.find((pl) => pl.id === playerId);
  const cellId = seizedRegionId ?? p?.cellRegionId ?? state.cellRegionId;
  const cellReg = regions[cellId];
  const hostId = cellReg?.hostNationId;
  const hostBloc = hostId && nations[hostId] ? nations[hostId].bloc2026 : 'global_south';
  const ideology = p?.ideology ?? state.ideology;

  for (const [nId, n] of Object.entries(nations)) {
    if (n.eliminated) continue;
    let rel = 0;

    if (n.id === hostId) {
      rel = -95;
    } else if (n.bloc2026 === hostBloc) {
      rel = -35;
    } else {
      if (ideology === 'peoples_republic' || ideology === 'junta') {
        if (n.bloc2026 === 'brics_eurasian') rel = 38;
        else if (n.bloc2026 === 'global_south') rel = 22;
        else if (n.bloc2026 === 'arab_islamic') rel = 18;
        else rel = -30;
      } else {
        if (n.bloc2026 === 'western') rel = 34;
        else if (n.bloc2026 === 'global_south') rel = 24;
        else if (n.bloc2026 === 'arab_islamic') rel = 16;
        else rel = -30;
      }
    }

    nations[nId] = {
      ...n,
      relation: rel,
      atWar: n.id === hostId ? true : n.atWar,
    };
    if (p) {
      p.nationDiplomacy[nId] = {
        relation: rel,
        pactTurns: 0,
        atWar: n.id === hostId,
        allied: false,
      };
    }
  }

  if (cellReg) {
    for (const adjId of cellReg.adjacentIds) {
      const adj = regions[adjId];
      if (adj && !isHumanOwner(state, adj.ownerId) && nations[adj.ownerId]) {
        const nextRel = clamp(nations[adj.ownerId].relation - 25, -100, 100);
        nations[adj.ownerId] = { ...nations[adj.ownerId], relation: nextRel };
        if (p && p.nationDiplomacy[adj.ownerId]) {
          p.nationDiplomacy[adj.ownerId].relation = nextRel;
        }
      }
    }
  }

  logs.unshift({
    id: uid(),
    turn: state.turn,
    type: 'diplomacy',
    message: `COVER BLOWN (${p?.name ?? 'Revolution'}): The world now sees your uprising. Aligned 2026 partners are open to lending funds!`,
  });
};

export const getMaxAttacksPerRegion = (state: GameState): number => {
  const base = state.combatStyle === 'blitz' ? 2 : 1;
  return state.gameVariant === 'BLITZ' ? base * 2 : base;
};

// Enter Interactive Tactical Battle for Underground Uprising
export const startUprisingBattle = (state: GameState): GameState => {
  const activeId = getActivePlayerId(state);
  if (state.phase === 'EXPOSED' && getPlayerRegions(state, activeId).length > 0) {
    return state;
  }
  if (state.pendingBattle) return state;

  const target = state.regions[state.cellRegionId];
  if (!target || state.undergroundTroops < 2) return state;

  const defenderLabel =
    state.players.find((p) => p.id === target.ownerId)?.name ??
    state.nations[target.ownerId]?.name ??
    'Local Government';

  const pendingBattle = createInitialBattle(
    state,
    null,
    target,
    state.undergroundUnits,
    defenderLabel,
    true
  );

  return {
    ...state,
    pendingBattle,
  };
};

// Enter Interactive Tactical Battle for Border Offensive
export const startAttackBattle = (
  state: GameState,
  fromId: string,
  toId: string,
  commitFraction: number
): GameState => {
  const activeId = getActivePlayerId(state);
  if (state.phase === 'UNDERGROUND' || state.pendingBattle) return state;

  const from = state.regions[fromId];
  const to = state.regions[toId];
  const maxAttacks = getMaxAttacksPerRegion(state);
  const usedAttacks = state.attackCountsThisTurn[fromId] ?? 0;

  if (
    !from ||
    !to ||
    from.ownerId !== activeId ||
    to.ownerId === activeId ||
    !from.adjacentIds.includes(toId) ||
    from.troops <= 1 ||
    usedAttacks >= maxAttacks
  ) {
    return state;
  }

  const committedUnits = splitUnitsByFraction(from.units, commitFraction);
  if (sumUnits(committedUnits) < 1) return state;

  const remainingFromUnits = subtractUnitCompositions(from.units, committedUnits);
  const defenderHuman = state.players.find((p) => p.id === to.ownerId);
  const defenderLabel =
    to.ownerId === 'rebels'
      ? 'Separatist Rebels'
      : defenderHuman?.name ?? state.nations[to.ownerId]?.name ?? 'Foreign Garrison';

  const pendingBattle = createInitialBattle(
    state,
    fromId,
    to,
    committedUnits,
    defenderLabel,
    false
  );

  return snapshotActivePlayer({
    ...state,
    regions: {
      ...state.regions,
      [fromId]: {
        ...from,
        units: remainingFromUnits,
        troops: sumUnits(remainingFromUnits),
      },
    },
    pendingBattle,
  });
};

export const updatePendingBattle = (
  state: GameState,
  battle: PendingBattle
): GameState => ({
  ...state,
  pendingBattle: battle,
});

export const finishPendingBattle = (
  state: GameState,
  finalBattle: PendingBattle
): GameState => {
  const activeId = getActivePlayerId(state);
  const playerWon = finalBattle.winner === 'player';
  const retreated = finalBattle.winner === 'retreat';
  const to = state.regions[finalBattle.toRegionId];
  if (!to) return { ...state, pendingBattle: null };

  const regions: Record<string, Region> = { ...state.regions };
  const nations: Record<string, Nation> = { ...state.nations };
  const logs: LogEntry[] = [...state.logs];
  let activeLoans = [...state.activeLoans];
  let creditFreezeTurns = state.creditFreezeTurns;
  let aiWars = [...state.aiWars];

  const players = state.players.map((p) => ({
    ...p,
    nationDiplomacy: { ...p.nationDiplomacy },
    humanAllies: [...p.humanAllies],
    humanWars: [...p.humanWars],
  }));
  const activeHuman = players[state.activePlayerIndex];

  const survPlayer = extractSurvivingUnits(
    finalBattle.committedUnits,
    finalBattle.tokens,
    'player',
    playerWon
  );
  const survEnemy = extractSurvivingUnits(
    finalBattle.defenderUnits,
    finalBattle.tokens,
    'enemy',
    !playerWon
  );

  const playerInitialTotal = sumUnits(finalBattle.committedUnits);
  const survPlayerTotal = sumUnits(survPlayer);
  const attackerLosses = Math.max(0, playerInitialTotal - survPlayerTotal);

  const defenderId = to.ownerId;
  const defenderLabel = finalBattle.defenderName;

  if (finalBattle.isUprising) {
    if (playerWon) {
      regions[to.id] = {
        ...to,
        ownerId: activeId,
        units: survPlayer,
        troops: survPlayerTotal,
        unrest: hasTech(state, 'global_hegemony') ? 20 : 38,
      };
      if (nations[defenderId]) {
        const stillHasLand = Object.values(regions).some(
          (r) => r.ownerId === defenderId
        );
        if (!stillHasLand) {
          nations[defenderId] = {
            ...nations[defenderId],
            eliminated: true,
            atWar: false,
          };
        }
      }
      logs.unshift({
        id: uid(),
        turn: state.turn,
        type: 'war',
        message: `COUP SUCCEEDED! ${activeHuman?.name ?? 'Your force'} seized ${to.name} from ${defenderLabel} (${survPlayerTotal} forces remaining).`,
      });
    } else {
      regions[to.id] = {
        ...to,
        units: survEnemy,
        troops: Math.max(2, sumUnits(survEnemy)),
      };
      logs.unshift({
        id: uid(),
        turn: state.turn,
        type: 'war',
        message: `Uprising in ${to.name} repulsed by ${defenderLabel}. ${survPlayerTotal} fighters pulled back.`,
      });
    }

    const tempState: GameState = { ...state, players };
    if (state.phase === 'UNDERGROUND') {
      exposeRevolutionToWorld(
        tempState,
        regions,
        nations,
        logs,
        playerWon ? to.id : null,
        activeId
      );
    }

    return snapshotActivePlayer({
      ...state,
      players,
      phase: 'EXPOSED',
      suspicion: 100,
      undergroundUnits: playerWon ? emptyUnits() : survPlayer,
      undergroundTroops: playerWon ? 0 : survPlayerTotal,
      regions,
      nations,
      pendingBattle: null,
      stats: {
        ...state.stats,
        battlesWon: state.stats.battlesWon + (playerWon ? 1 : 0),
        battlesLost: state.stats.battlesLost + (playerWon ? 0 : 1),
      },
      factionLoyalty: {
        ...state.factionLoyalty,
        military: clamp(state.factionLoyalty.military + (playerWon ? 8 : -10), 0, 100),
        civic: clamp(state.factionLoyalty.civic + (playerWon ? 6 : -6), 0, 100),
      },
      logs: logs.slice(0, 50),
    });
  }

  // Standard border offensive resolution
  if (defenderId !== 'rebels' && nations[defenderId]) {
    const wasAlreadyAtWar = Boolean(nations[defenderId].atWar);
    const attackedCreditor = activeLoans.some((l) => l.lenderNationId === defenderId);
    if (attackedCreditor) {
      const attackedBloc = nations[defenderId].bloc2026;
      activeLoans = activeLoans.filter((l) => l.lenderNationId !== defenderId);
      creditFreezeTurns = Math.max(creditFreezeTurns, 5);
      for (const [nId, n] of Object.entries(nations)) {
        if (n.bloc2026 === attackedBloc && !n.eliminated) {
          nations[nId] = { ...n, relation: clamp(n.relation - 45, -100, 100) };
        }
      }
      logs.unshift({
        id: uid(),
        turn: state.turn,
        type: 'diplomacy',
        message: `Attacked creditor ${defenderLabel}! Bilateral loan defaulted & credit frozen for 5 turns.`,
      });
    }

    nations[defenderId] = {
      ...nations[defenderId],
      atWar: true,
      allied: false,
      pactTurns: 0,
      relation: -90,
    };

    if (activeHuman) {
      activeHuman.nationDiplomacy[defenderId] = {
        relation: -90,
        pactTurns: 0,
        atWar: true,
        allied: false,
      };
      if (!wasAlreadyAtWar) {
        const callRes = callAlliesToWarAgainstNation(
          activeHuman,
          players,
          nations,
          regions,
          aiWars,
          defenderId,
          state.turn,
          logs
        );
        aiWars = callRes.aiWars;
      }
    }
  } else {
    // Attacking another Human Commander!
    const rivalHuman = players.find((p) => p.id === defenderId);
    if (rivalHuman && activeHuman) {
      activeHuman.humanAllies = activeHuman.humanAllies.filter((id) => id !== defenderId);
      rivalHuman.humanAllies = rivalHuman.humanAllies.filter((id) => id !== activeId);
      if (!activeHuman.humanWars.includes(defenderId)) {
        activeHuman.humanWars.push(defenderId);
      }
      if (!rivalHuman.humanWars.includes(activeId)) {
        rivalHuman.humanWars.push(activeId);
      }
    }
  }

  const fromId = finalBattle.fromRegionId;
  if (playerWon) {
    regions[to.id] = {
      ...to,
      ownerId: activeId,
      units: survPlayer,
      troops: survPlayerTotal,
      unrest: hasTech(state, 'global_hegemony') ? 20 : 42,
    };

    if (
      state.combatStyle === 'blitz' &&
      hasDoctrine(state, 'blitz_shock') &&
      defenderId !== 'rebels'
    ) {
      for (const adjId of to.adjacentIds) {
        const adj = regions[adjId];
        if (adj && adj.ownerId === defenderId) {
          const reduced = Math.max(3, Math.round(adj.troops * 0.85));
          const scaled = scaleUnitsToTotal(adj.units, reduced);
          regions[adjId] = { ...adj, units: scaled, troops: sumUnits(scaled) };
        }
      }
    }

    if (defenderId !== 'rebels' && nations[defenderId]) {
      const stillHasLand = Object.values(regions).some((r) => r.ownerId === defenderId);
      if (!stillHasLand) {
        nations[defenderId] = {
          ...nations[defenderId],
          eliminated: true,
          atWar: false,
        };
        aiWars = aiWars.filter(([x, y]) => x !== defenderId && y !== defenderId);
      }
    } else {
      const rivalHuman = players.find((p) => p.id === defenderId);
      if (rivalHuman) {
        const stillHasLand = Object.values(regions).some((r) => r.ownerId === defenderId);
        if (!stillHasLand && rivalHuman.undergroundTroops <= 0) {
          rivalHuman.eliminated = true;
          logs.unshift({
            id: uid(),
            turn: state.turn,
            type: 'war',
            message: `${rivalHuman.name} was eliminated by ${activeHuman?.name ?? 'Commander'}!`,
          });
        }
      }
    }

    logs.unshift({
      id: uid(),
      turn: state.turn,
      type: 'war',
      message: `${activeHuman?.name ?? 'Your Command'} captured ${to.name} from ${defenderLabel}! (${survPlayerTotal} troops garrisoned, -${attackerLosses} lost)`,
    });
  } else {
    if (fromId && regions[fromId] && survPlayerTotal > 0) {
      const merged = addUnitCompositions(regions[fromId].units, survPlayer);
      regions[fromId] = {
        ...regions[fromId],
        units: merged,
        troops: sumUnits(merged),
      };
    }
    regions[to.id] = {
      ...to,
      units: survEnemy,
      troops: Math.max(2, sumUnits(survEnemy)),
    };
    logs.unshift({
      id: uid(),
      turn: state.turn,
      type: 'war',
      message: retreated
        ? `Retreated from ${to.name}. ${survPlayerTotal} surviving troops fell back to staging province.`
        : `Assault on ${to.name} repulsed by ${defenderLabel}. Lost ${attackerLosses} troops.`,
    });
  }

  let fuelCost = 0;
  if (state.combatStyle === 'blitz') {
    fuelCost = hasDoctrine(state, 'blitz_columns') ? 2 : 4;
  }

  const totalRegions = Object.keys(regions).length;
  const playerTotal = Object.values(regions).filter((r) => r.ownerId === activeId).length;
  const aliveHumans = players.filter((p) => !p.eliminated);
  const aliveAi = Object.values(nations).filter((n) => !n.eliminated).length;
  const wonByElimination =
    players.length > 1 && aliveHumans.length === 1 && aliveAi === 0;
  const mode: GameMode =
    playerTotal === totalRegions || wonByElimination ? 'VICTORY' : state.mode;

  const usedAttacks = fromId ? state.attackCountsThisTurn[fromId] ?? 0 : 0;

  return snapshotActivePlayer({
    ...state,
    mode,
    winnerPlayerId: mode === 'VICTORY' ? activeId : state.winnerPlayerId,
    players,
    regions,
    nations,
    aiWars,
    activeLoans,
    creditFreezeTurns,
    pendingBattle: null,
    attackCountsThisTurn: fromId
      ? { ...state.attackCountsThisTurn, [fromId]: usedAttacks + 1 }
      : state.attackCountsThisTurn,
    resources: {
      ...state.resources,
      energy: Math.max(-25, state.resources.energy - fuelCost),
      influence: playerWon
        ? state.resources.influence + 5
        : Math.max(0, state.resources.influence - 3),
    },
    factionLoyalty: {
      ...state.factionLoyalty,
      military: clamp(state.factionLoyalty.military + (playerWon ? 4 : -6), 0, 100),
      civic: clamp(state.factionLoyalty.civic + (playerWon ? 2 : -4), 0, 100),
    },
    stats: {
      ...state.stats,
      battlesWon: state.stats.battlesWon + (playerWon ? 1 : 0),
      battlesLost: state.stats.battlesLost + (playerWon ? 0 : 1),
    },
    logs: logs.slice(0, 50),
  });
};

export const signNonAggressionPact = (
  state: GameState,
  nationId: string
): GameState => {
  if (state.phase === 'UNDERGROUND') return state;
  const nation = state.nations[nationId];
  if (!nation || nation.eliminated || nation.pactTurns > 0) return state;

  const costInfluence = 16;
  const costFunds = 50;
  if (state.resources.influence < costInfluence) return state;
  if (state.resources.funds - costFunds < -120) return state;

  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      influence: state.resources.influence - costInfluence,
      funds: state.resources.funds - costFunds,
    },
    nations: {
      ...state.nations,
      [nationId]: {
        ...nation,
        atWar: false,
        pactTurns: 5,
        relation: Math.min(100, nation.relation + 25),
      },
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'diplomacy',
        message: `Signed 5-turn Non-Aggression Pact with ${nation.name}.`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const takeEmergencyLoan = (state: GameState): GameState => {
  if (state.loanCooldown > 0) return state;
  return snapshotActivePlayer({
    ...state,
    resources: {
      ...state.resources,
      funds: state.resources.funds + 120,
      influence: Math.max(0, state.resources.influence - 8),
    },
    loanCooldown: 4,
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'economy',
        message: 'Drew $120 Black-Market Emergency Credit (-8 Influence).',
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

export const setTaxPolicy = (state: GameState, taxPolicy: TaxPolicy): GameState =>
  snapshotActivePlayer({
    ...state,
    taxPolicy,
  });

export const applyEventChoice = (
  state: GameState,
  choice: EventChoice
): GameState => {
  const activeId = getActivePlayerId(state);
  const regions = { ...state.regions };
  const nations = { ...state.nations };
  let undergroundUnits = { ...state.undergroundUnits };

  if (choice.globalUnrestDelta) {
    for (const r of Object.values(regions)) {
      if (r.ownerId === activeId) {
        regions[r.id] = {
          ...r,
          unrest: clamp(r.unrest + choice.globalUnrestDelta, 0, 100),
        };
      }
    }
  }

  if (choice.targetRegionId && regions[choice.targetRegionId]) {
    const tr = regions[choice.targetRegionId];
    const nextTroops = Math.max(1, tr.troops + (choice.targetRegionTroopsDelta ?? 0));
    const nextUnits = scaleUnitsToTotal(tr.units, nextTroops);
    regions[choice.targetRegionId] = {
      ...tr,
      units: nextUnits,
      troops: sumUnits(nextUnits),
      ownerId: choice.targetRegionFlipToRebels ? 'rebels' : tr.ownerId,
    };
  } else if (choice.targetRegionTroopsDelta && state.phase === 'UNDERGROUND') {
    const nextTotal = Math.max(
      1,
      state.undergroundTroops + choice.targetRegionTroopsDelta
    );
    undergroundUnits = scaleUnitsToTotal(undergroundUnits, nextTotal);
  }

  const nextFunds = state.resources.funds + (choice.fundsDelta ?? 0);
  const nextLoyalty: FactionLoyalty = {
    military: clamp(
      state.factionLoyalty.military + (choice.factionDelta?.military ?? 0),
      0,
      100
    ),
    industry: clamp(
      state.factionLoyalty.industry + (choice.factionDelta?.industry ?? 0),
      0,
      100
    ),
    civic: clamp(
      state.factionLoyalty.civic + (choice.factionDelta?.civic ?? 0),
      0,
      100
    ),
  };

  return snapshotActivePlayer({
    ...state,
    suspicion: clamp(state.suspicion + (choice.suspicionDelta ?? 0), 0, 100),
    undergroundUnits,
    undergroundTroops: sumUnits(undergroundUnits),
    factionLoyalty: nextLoyalty,
    resources: {
      funds: nextFunds,
      materials: Math.max(-20, state.resources.materials + (choice.materialsDelta ?? 0)),
      energy: Math.max(-20, state.resources.energy + (choice.energyDelta ?? 0)),
      manpower: Math.max(0, (state.resources.manpower ?? 0) + (choice.manpowerDelta ?? 0)),
      influence: Math.max(0, state.resources.influence + (choice.influenceDelta ?? 0)),
      science: Math.max(0, state.resources.science + (choice.scienceDelta ?? 0)),
    },
    productionDebuffTurns:
      state.productionDebuffTurns + (choice.productionDebuffTurns ?? 0),
    regions,
    nations,
    activeEvent: null,
    stats: {
      ...state.stats,
      peakDebt: Math.min(state.stats.peakDebt, nextFunds),
    },
    logs: [
      {
        id: uid(),
        turn: state.turn,
        type: 'event',
        message: `Resolved "${state.activeEvent?.title ?? 'Event'}": ${choice.label}.`,
      },
      ...state.logs.slice(0, 49),
    ],
  });
};

const resolveWorldTurn = (rawState: GameState): GameState => {
  const snapped = snapshotActivePlayer(rawState);
  const nextTurn = snapped.turn + 1;
  const logs: LogEntry[] = [...snapped.logs];

  const regions: Record<string, Region> = {};
  for (const [k, v] of Object.entries(snapped.regions)) {
    regions[k] = {
      ...v,
      units: { ...v.units },
      buildings: { ...v.buildings },
    };
  }
  const nations: Record<string, Nation> = {};
  for (const [k, v] of Object.entries(snapped.nations)) {
    nations[k] = { ...v };
  }

  const players = snapped.players.map((p) => ({
    ...p,
    resources: { ...p.resources },
    factionLoyalty: { ...p.factionLoyalty },
    undergroundUnits: { ...p.undergroundUnits },
    unitLevels: { ...(p.unitLevels ?? createInitialUnitLevels(snapped.gameVariant)) },
    stats: { ...p.stats },
    nationDiplomacy: { ...p.nationDiplomacy },
    humanAllies: [...p.humanAllies],
    humanWars: [...p.humanWars],
    attackCountsThisTurn: {},
    covertOpsUsedThisTurn: {},
  }));

  let lastBattle: BattleReport | null = null;

  // 1. Update each surviving human player's economy, suspicion, unrest & revolts
  for (let pIdx = 0; pIdx < players.length; pIdx++) {
    const p = players[pIdx];
    if (p.eliminated) continue;

    // Build transient view to evaluate calculateNetIncome accurately for player p
    const pStateView = hydratePlayerIntoState(
      { ...snapped, players, regions, nations },
      pIdx
    );
    const income = calculateNetIncome(pStateView);

    p.resources.funds += income.funds;
    p.resources.materials = Math.max(-30, p.resources.materials + income.materials);
    p.resources.energy = Math.max(-30, p.resources.energy + income.energy);
    const mpCap = 250 + Object.values(regions).filter((r) => r.ownerId === p.id).length * 90;
    p.resources.manpower = Math.min(mpCap, Math.max(0, (p.resources.manpower ?? 0) + income.manpower));
    p.resources.influence = Math.max(0, p.resources.influence + income.influence);
    p.resources.science = Math.max(0, p.resources.science + income.science);

    const updatedLoans: BilateralLoan[] = [];
    for (const loan of p.activeLoans) {
      const principalStep = Math.min(
        loan.remaining,
        Math.ceil(loan.remaining / Math.max(1, loan.turnsLeft))
      );
      const rem = loan.remaining - principalStep;
      const tLeft = loan.turnsLeft - 1;
      if (rem > 0 && tLeft > 0) {
        updatedLoans.push({ ...loan, remaining: rem, turnsLeft: tLeft });
      } else {
        if (p.nationDiplomacy[loan.lenderNationId]) {
          p.nationDiplomacy[loan.lenderNationId].relation = clamp(
            p.nationDiplomacy[loan.lenderNationId].relation + 8,
            -100,
            100
          );
        }
        logs.unshift({
          id: uid(),
          turn: nextTurn,
          type: 'economy',
          message: `${p.name} settled bilateral loan with ${loan.lenderName} (+8 Relation).`,
        });
      }
    }
    p.activeLoans = updatedLoans;
    p.creditFreezeTurns = Math.max(0, p.creditFreezeTurns - 1);
    p.productionDebuffTurns = Math.max(0, p.productionDebuffTurns - 1);
    p.loanCooldown = Math.max(0, p.loanCooldown - 1);
    p.debtTurns = p.resources.funds < 0 ? p.debtTurns + 1 : 0;
    p.stats.peakDebt = Math.min(p.stats.peakDebt, p.resources.funds);

    if (p.taxPolicy === 'War') p.factionLoyalty.civic = clamp(p.factionLoyalty.civic - 3, 0, 100);
    if (p.taxPolicy === 'Low') p.factionLoyalty.civic = clamp(p.factionLoyalty.civic + 2, 0, 100);
    if (p.resources.funds < 0) p.factionLoyalty.industry = clamp(p.factionLoyalty.industry - 3, 0, 100);
    if (p.activePolicies.includes('conscription')) p.factionLoyalty.civic = clamp(p.factionLoyalty.civic - 2, 0, 100);
    if (p.activePolicies.includes('martial_law')) p.factionLoyalty.civic = clamp(p.factionLoyalty.civic - 2, 0, 100);
    if (p.activePolicies.includes('welfare_charter')) p.factionLoyalty.civic = clamp(p.factionLoyalty.civic + 2, 0, 100);

    if (
      p.phase === 'EXPOSED' &&
      p.combatStyle === 'infiltration' &&
      p.doctrineUpgrades.includes('infil_coup')
    ) {
      p.resources.funds += 28;
      p.resources.science += 4;
    }

    if (p.resources.funds < 0) {
      logs.unshift({
        id: uid(),
        turn: nextTurn,
        type: 'economy',
        message: `${p.name} Treasury in Debt ($${p.resources.funds}). Paid $${income.debtInterest} interest.`,
      });
    }

    p.suspicion = clamp(p.suspicion + income.suspicionDelta, 0, 100);
    if (p.phase === 'UNDERGROUND' && p.suspicion >= 100) {
      p.phase = 'EXPOSED';
      exposeRevolutionToWorld(
        { ...snapped, players, regions, nations },
        regions,
        nations,
        logs,
        null,
        p.id
      );
    }

    // Player Unrest & Revolts
    const playerRegionsList = Object.values(regions).filter((x) => x.ownerId === p.id);
    const playerRegCount = playerRegionsList.length;

    let taxUnrestDrift = p.taxPolicy === 'War' ? 5 : p.taxPolicy === 'Low' ? -3 : 1;
    if (p.ideology === 'junta') taxUnrestDrift += 2;
    if (p.ideology === 'peoples_republic') taxUnrestDrift -= 2;
    if (p.ideology === 'syndicalist' && p.resources.funds < 0) taxUnrestDrift += 2;
    if (p.activePolicies.includes('press_censorship')) taxUnrestDrift -= 2;
    if (p.activePolicies.includes('conscription')) taxUnrestDrift += 3;
    if (p.activePolicies.includes('welfare_charter')) taxUnrestDrift -= 4;

    const debtUnrestDrift = p.resources.funds < 0 ? 4 : 0;
    const techUnrestOffset = p.unlockedTechs.includes('hearts_and_minds') ? -3 : 0;

    for (const r of playerRegionsList) {
      let buildingUnrest = 0;
      (Object.keys(r.buildings) as BuildingType[]).forEach((b) => {
        buildingUnrest += BUILDINGS[b].unrestDelta * (r.buildings[b] ?? 0);
      });

      const overext = playerRegCount > 25 ? 2 : 0;
      const delta =
        taxUnrestDrift + debtUnrestDrift + techUnrestOffset + buildingUnrest + overext;
      r.unrest = clamp(r.unrest + delta, 0, 100);

      let revoltChance = r.unrest >= 72 ? (r.unrest - 60) / 80 : 0;
      if (p.activePolicies.includes('martial_law')) revoltChance *= 0.5;

      if (revoltChance > 0 && Math.random() < revoltChance) {
        p.stats.revoltsFaced += 1;
        const rebelForce = Math.max(10, Math.round(12 + playerRegCount * 0.9));
        const fortMult =
          1 +
          (r.buildings.fortress ?? 0) * 0.25 +
          (p.combatStyle === 'fortress' ? 0.35 : 0);
        const garrisonPower = r.troops * fortMult;
        const bunkerProtected =
          p.combatStyle === 'fortress' &&
          p.doctrineUpgrades.includes('fortress_bunkers') &&
          r.buildings.fortress > 0;

        if (rebelForce > garrisonPower && playerRegCount > 1 && !bunkerProtected) {
          r.ownerId = 'rebels';
          const nextT = Math.max(8, Math.round(rebelForce * 0.65));
          const rebelUnits = emptyUnits();
          rebelUnits.riflemen = Math.round(nextT * 0.55);
          rebelUnits.anti_tank = Math.round(nextT * 0.15);
          rebelUnits.commandos = Math.max(
            1,
            nextT - rebelUnits.riflemen - rebelUnits.anti_tank
          );
          r.units = rebelUnits;
          r.troops = sumUnits(r.units);
          r.unrest = 20;
          logs.unshift({
            id: uid(),
            turn: nextTurn,
            type: 'revolt',
            message: `REVOLT IN ${r.name.toUpperCase()} (${p.name})! Insurgents seized the province!`,
          });
        } else {
          const lost = Math.min(r.troops - 1, Math.max(2, Math.round(rebelForce * 0.3)));
          const rem = Math.max(1, r.troops - lost);
          r.units = scaleUnitsToTotal(r.units, rem);
          r.troops = sumUnits(r.units);
          r.unrest = Math.max(25, r.unrest - 35);
          logs.unshift({
            id: uid(),
            turn: nextTurn,
            type: 'revolt',
            message: `Revolt crushed in ${r.name} (${p.name})! (-${lost} Regiments)`,
          });
        }
      }
    }
  }

  // 2. Rival Nation AI (Reinforcements + Attacks on EXPOSED Humans + Inter-AI Wars)
  const diffBoost = snapped.difficulty === 'Brutal' ? 1.25 : 1.0;
  const regionsByOwner: Record<string, Region[]> = {};
  for (const r of Object.values(regions)) {
    if (!regionsByOwner[r.ownerId]) regionsByOwner[r.ownerId] = [];
    regionsByOwner[r.ownerId].push(r);
  }

  // Underground cell raid if exposed human holds 0 provinces
  for (const p of players) {
    if (p.eliminated || p.phase !== 'EXPOSED') continue;
    const pRegCount = (regionsByOwner[p.id] ?? []).length;
    if (pRegCount === 0 && regions[p.cellRegionId]) {
      const host = regions[p.cellRegionId];
      const curUg = sumUnits(p.undergroundUnits);
      if (curUg > 0) {
        const raidLoss = Math.min(curUg, Math.max(1, Math.round(host.troops * 0.14)));
        p.undergroundUnits = scaleUnitsToTotal(p.undergroundUnits, curUg - raidLoss);
        p.undergroundTroops = sumUnits(p.undergroundUnits);
        logs.unshift({
          id: uid(),
          turn: nextTurn,
          type: 'war',
          message: `${nations[host.ownerId]?.name ?? 'Security forces'} raided ${p.name}'s cells in ${host.name} (-${raidLoss} Fighters).`,
        });
      }
    }
  }

  const exposedHumans = players.filter((p) => !p.eliminated && p.phase === 'EXPOSED');

  for (const nation of Object.values(nations)) {
    if (nation.eliminated) continue;
    const nationRegions = regionsByOwner[nation.id] ?? [];
    if (nationRegions.length === 0) {
      nation.eliminated = true;
      continue;
    }

    for (const nr of nationRegions) {
      const cap = 58 + Math.min(40, nextTurn);
      if (nr.troops < cap && Math.random() < 0.45) {
        const add = Math.max(1, Math.round(nation.strengthGrowth * diffBoost * 0.4));
        nr.units = scaleUnitsToTotal(nr.units, nr.troops + add);
        nr.troops = sumUnits(nr.units);
      }
      nr.unrest = Math.max(8, nr.unrest - 2);
    }

    for (const hp of exposedHumans) {
      const stance = hp.nationDiplomacy[nation.id] ?? {
        relation: 0,
        pactTurns: 0,
        atWar: false,
        allied: false,
      };
      if (stance.pactTurns > 0) stance.pactTurns -= 1;

      const borderPairs: Array<{ from: Region; to: Region }> = [];
      for (const nr of nationRegions) {
        for (const adjId of nr.adjacentIds) {
          const adj = regions[adjId];
          if (adj && adj.ownerId === hp.id) {
            borderPairs.push({ from: nr, to: adj });
          }
        }
      }

      if (borderPairs.length === 0) {
        hp.nationDiplomacy[nation.id] = stance;
        continue;
      }

      const hpCount = (regionsByOwner[hp.id] ?? []).length;

      if (hpCount >= 25 && !stance.atWar && stance.pactTurns === 0 && stance.relation < 20) {
        stance.relation -= 8;
        if (stance.relation <= -55 && Math.random() < 0.3) {
          stance.atWar = true;
          stance.allied = false;
          logs.unshift({
            id: uid(),
            turn: nextTurn,
            type: 'diplomacy',
            message: `${nation.name} joined the coalition and declared WAR on ${hp.name}!`,
          });
        }
      }

      if (stance.pactTurns > 0) {
        let counterIntelFactor = hp.unlockedTechs.includes('counter_intel') ? 0.3 : 1.0;
        if (hp.combatStyle === 'infiltration') counterIntelFactor *= 0.35;
        const weaknessFactor = hp.resources.funds < 0 || hpCount <= 4 ? 1.35 : 1.0;
        const backstabChance =
          nation.betrayalTendency * 0.2 * counterIntelFactor * weaknessFactor;

        if (Math.random() < backstabChance) {
          stance.pactTurns = 0;
          stance.allied = false;
          stance.atWar = true;
          stance.relation = -90;
          hp.stats.backstabsSurvived += 1;
          logs.unshift({
            id: uid(),
            turn: nextTurn,
            type: 'diplomacy',
            message: `BETRAYAL! ${nation.name} tore up ${hp.name}'s pact and declared WAR!`,
          });
        }
      } else if (!stance.atWar && stance.relation < 10) {
        const aggroChance =
          (hp.resources.funds < 0 ? 0.18 : 0.1) *
          (snapped.difficulty === 'Brutal' ? 1.3 : 1);
        if (Math.random() < aggroChance) {
          stance.atWar = true;
          stance.allied = false;
          logs.unshift({
            id: uid(),
            turn: nextTurn,
            type: 'diplomacy',
            message: `${nation.name} mobilized on ${hp.name}'s border and declared WAR!`,
          });
        }
      }

      hp.nationDiplomacy[nation.id] = stance;

      if (stance.atWar && Math.random() < 0.58) {
        borderPairs.sort((a, b) => a.to.troops - b.to.troops);
        const best = borderPairs[0];
        const sendTroops = Math.round(best.from.troops * 0.68);

        if (sendTroops >= Math.max(8, best.to.troops * 0.78)) {
          let fortBonus = 1 + (best.to.buildings.fortress ?? 0) * 0.25;
          if (hp.combatStyle === 'fortress') {
            fortBonus += hp.doctrineUpgrades.includes('fortress_bunkers') ? 0.65 : 0.35;
          }
          const debtPenalty = hp.resources.funds < 0 ? 0.15 : 0;
          const playerDefMult = Math.max(0.6, fortBonus - debtPenalty);

          const enemyPower = sendTroops * (0.9 + Math.random() * 0.2);
          const playerDefPower = best.to.troops * playerDefMult;

          const enemyWon = enemyPower > playerDefPower;
          const attackerExtraLoss =
            hp.combatStyle === 'fortress' &&
            hp.doctrineUpgrades.includes('fortress_curtain')
              ? 1.4
              : 1.0;

          const enemyLosses = enemyWon
            ? Math.max(2, Math.round(sendTroops * 0.42 * attackerExtraLoss))
            : Math.max(3, Math.round(sendTroops * 0.65 * attackerExtraLoss));
          const defCasMult = hp.combatStyle === 'fortress' ? 0.75 : 1.0;
          const playerLosses = enemyWon
            ? best.to.troops
            : Math.min(
                best.to.troops - 1,
                Math.max(1, Math.round(best.to.troops * 0.42 * defCasMult))
              );

          const remFrom = Math.max(4, best.from.troops - enemyLosses);
          best.from.units = scaleUnitsToTotal(best.from.units, remFrom);
          best.from.troops = sumUnits(best.from.units);

          if (enemyWon) {
            hp.stats.battlesLost += 1;
            best.to.ownerId = nation.id;
            const occupyCount = Math.max(5, sendTroops - enemyLosses);
            best.to.units = scaleUnitsToTotal(best.from.units, occupyCount);
            best.to.troops = sumUnits(best.to.units);
            best.to.unrest = 25;
            regionsByOwner[hp.id] = (regionsByOwner[hp.id] ?? []).filter(
              (r) => r.id !== best.to.id
            );
            logs.unshift({
              id: uid(),
              turn: nextTurn,
              type: 'war',
              message: `${nation.name} attacked ${best.to.name} and OVERRAN ${hp.name}'s garrison!`,
            });
          } else {
            hp.stats.battlesWon += 1;
            const remTo = Math.max(1, best.to.troops - playerLosses);
            best.to.units = scaleUnitsToTotal(best.to.units, remTo);
            best.to.troops = sumUnits(best.to.units);
            logs.unshift({
              id: uid(),
              turn: nextTurn,
              type: 'war',
              message: `${hp.name} defended ${best.to.name} against ${nation.name}! (-${playerLosses} troops)`,
            });
          }

          lastBattle = {
            id: uid(),
            turn: nextTurn,
            attackerLabel: nation.name,
            defenderLabel: `${hp.name} Defense`,
            regionId: best.to.id,
            regionName: best.to.name,
            playerWasAttacker: false,
            playerWon: !enemyWon,
            captured: enemyWon,
            attackerInitial: sendTroops,
            attackerLosses: enemyLosses,
            defenderInitial: best.to.troops + (enemyWon ? 0 : playerLosses),
            defenderLosses: playerLosses,
            modifiers: [
              ...(hp.combatStyle === 'fortress'
                ? [{ label: 'Bastion Doctrine', value: '+35%+ Def', positive: true }]
                : []),
              ...(debtPenalty > 0
                ? [{ label: 'Debt Morale Penalty', value: '-15% Def', positive: false }]
                : []),
            ],
          };
          break; // one battle report per nation per turn
        }
      }
    }
  }

  // 3. Inter-AI Conflict (AI-vs-AI war declarations, border battles & captures)
  const nextAiWars = resolveInterAiConflict(
    regions,
    nations,
    snapped.aiWars ?? [],
    nextTurn,
    logs
  );

  // 4. Update eliminated humans & check Victory/Defeat
  const totalRegions = Object.keys(regions).length;
  let winnerPlayerId: string | null = snapped.winnerPlayerId ?? null;
  let mode: GameMode = snapped.mode;

  for (const p of players) {
    const ownedCount = Object.values(regions).filter((r) => r.ownerId === p.id).length;
    if (
      p.phase === 'EXPOSED' &&
      ownedCount === 0 &&
      sumUnits(p.undergroundUnits) <= 0
    ) {
      p.eliminated = true;
    }
    if (ownedCount === totalRegions) {
      mode = 'VICTORY';
      winnerPlayerId = p.id;
    }
  }

  const aliveHumans = players.filter((p) => !p.eliminated);
  const aliveAiNations = Object.values(nations).filter((n) => !n.eliminated).length;
  if (aliveHumans.length === 0) {
    mode = 'DEFEAT';
  } else if (players.length > 1 && aliveHumans.length === 1 && aliveAiNations === 0) {
    mode = 'VICTORY';
    winnerPlayerId = aliveHumans[0].id;
  }

  const firstAliveIdx = players.findIndex((p) => !p.eliminated);
  const nextIdx = firstAliveIdx >= 0 ? firstAliveIdx : 0;

  let nextState: GameState = hydratePlayerIntoState(
    {
      ...snapped,
      mode,
      winnerPlayerId,
      turn: nextTurn,
      players,
      regions,
      nations,
      aiWars: nextAiWars,
      lastBattle,
      awaitingHandoff:
        snapped.multiplayerType === 'HOTSEAT' &&
        aliveHumans.length > 1 &&
        mode === 'PLAYING',
      logs: logs.slice(0, 50),
    },
    nextIdx
  );

  // 5. Random World Event for next active human
  const eventRate = nextState.phase === 'UNDERGROUND' ? 0.3 : 0.4;
  if (mode === 'PLAYING' && nextTurn >= 2 && Math.random() < eventRate) {
    const evt = pickRandomWorldEvent(nextState);
    if (evt) {
      nextState = {
        ...nextState,
        activeEvent: evt,
        stats: {
          ...nextState.stats,
          disastersEndured: nextState.stats.disastersEndured + 1,
        },
      };
      nextState = snapshotActivePlayer(nextState);
    }
  }

  return nextState;
};

export const advanceTurn = (state: GameState): GameState => {
  if (state.mode !== 'PLAYING' || state.activeEvent || state.pendingBattle) {
    return state;
  }

  const snapped = snapshotActivePlayer(state);

  // Check if there is another alive human player waiting in this turn round
  if (snapped.players && snapped.players.length > 1) {
    let nextIdx = -1;
    for (let i = snapped.activePlayerIndex + 1; i < snapped.players.length; i++) {
      if (!snapped.players[i].eliminated) {
        nextIdx = i;
        break;
      }
    }
    if (nextIdx !== -1) {
      const nextPlayer = snapped.players[nextIdx];
      const nextHydrated = hydratePlayerIntoState(
        {
          ...snapped,
          lastBattle: null,
          awaitingHandoff: snapped.multiplayerType === 'HOTSEAT',
          logs: [
            {
              id: uid(),
              turn: snapped.turn,
              type: 'event',
              message: `Command shifted to ${nextPlayer.name} (Turn ${snapped.turn}).`,
            },
            ...snapped.logs.slice(0, 49),
          ],
        },
        nextIdx
      );
      return nextHydrated;
    }
  }

  return resolveWorldTurn(snapped);
};

export const applyGameAction = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'END_TURN':
      return advanceTurn(state);
    case 'CONFIRM_HANDOFF':
      return confirmHandoff(state);
    case 'RECRUIT_UNIT':
      return recruitUnit(state, action.regionId, action.unitType, action.amount);
    case 'BUILD_STRUCTURE':
      return buildStructure(state, action.regionId, action.buildingType);
    case 'PACIFY_REGION':
      return pacifyRegion(state, action.regionId);
    case 'LAUNCH_UPRISING':
      return startUprisingBattle(state);
    case 'START_ATTACK':
      return startAttackBattle(state, action.fromId, action.toId, action.commitFraction);
    case 'UPDATE_BATTLE':
      return updatePendingBattle(state, action.battle);
    case 'FINISH_BATTLE':
      return finishPendingBattle(state, action.battle);
    case 'TRANSFER_TROOPS':
      return transferTroops(state, action.fromId, action.toId, action.fraction);
    case 'COVERT_OP':
      return runCovertOp(state, action.targetId, action.op);
    case 'UNLOCK_TECH':
      return unlockTechnology(state, action.techId);
    case 'UNLOCK_DOCTRINE':
      return unlockDoctrineUpgrade(state, action.upgradeId);
    case 'RESEARCH_UNIT':
      return researchUnitLevel(state, action.unitType);
    case 'SWITCH_IDEOLOGY':
      return switchIdeology(state, action.ideologyId);
    case 'TOGGLE_POLICY':
      return togglePolicy(state, action.policyId);
    case 'APPEASE_FACTION':
      return appeaseFaction(state, action.pillar);
    case 'SET_TAX_POLICY':
      return setTaxPolicy(state, action.policy);
    case 'TAKE_EMERGENCY_LOAN':
      return takeEmergencyLoan(state);
    case 'SIGN_PACT':
      return signNonAggressionPact(state, action.nationId);
    case 'FORM_ALLIANCE':
      return formAlliance(state, action.nationId);
    case 'DECLARE_WAR':
      return declareWarOnNation(state, action.nationId);
    case 'TOGGLE_HUMAN_ALLY':
      return toggleHumanAlliance(state, action.targetPlayerId);
    case 'DECLARE_WAR_HUMAN':
      return declareWarOnHuman(state, action.targetPlayerId);
    case 'BORROW_NATION':
      return borrowFromNation(state, action.nationId);
    case 'REPAY_LOAN':
      return repayLoan(state, action.loanId);
    case 'DEFAULT_LOAN':
      return defaultOnLoan(state, action.loanId);
    case 'COURT_NATION':
      return courtNation(state, action.nationId);
    case 'EVENT_CHOICE':
      return applyEventChoice(state, action.choice);
    case 'CLOSE_BATTLE_REPORT':
      return { ...state, lastBattle: null };
    default:
      return state;
  }
};

export { hasAiWar };
