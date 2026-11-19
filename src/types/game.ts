export type GameMode = 'TITLE_MENU' | 'PLAYING' | 'VICTORY' | 'DEFEAT';

export type GameVariant = 'CLASSIC' | 'BLITZ';

export type ScenarioId = 'modern_2026' | 'ww2_1939' | 'cold_war_1962';

export type MultiplayerType = 'SOLO' | 'HOTSEAT' | 'ONLINE';

export type ActiveTab =
  | 'MAP'
  | 'INDUSTRY'
  | 'RESEARCH'
  | 'DOCTRINE'
  | 'POLITICS'
  | 'DIPLOMACY';

export type RevolutionPhase = 'UNDERGROUND' | 'EXPOSED';

export type Difficulty = 'Standard' | 'Brutal';

export type Continent =
  | 'North America'
  | 'South America'
  | 'Europe'
  | 'Africa'
  | 'Asia'
  | 'Oceania';

export type TerrainType = 'Mountain' | 'Urban' | 'Plains' | 'Desert' | 'Coastal';

export type BuildingType =
  | 'workshop'
  | 'refinery'
  | 'bank'
  | 'lab'
  | 'propaganda'
  | 'fortress';

export type TaxPolicy = 'Low' | 'Standard' | 'War';

export type UnitBranch = 'Army' | 'Navy' | 'Air Force';

export type UnitClass =
  | 'Infantry'
  | 'Vehicle'
  | 'Armored'
  | 'Artillery'
  | 'Support'
  | 'Naval'
  | 'Aircraft';

export type UnitType =
  | 'riflemen'
  | 'anti_tank'
  | 'mechanized'
  | 'mbt'
  | 'howitzer'
  | 'commandos'
  | 'frigate'
  | 'destroyer'
  | 'carrier'
  | 'interceptor'
  | 'gunship'
  | 'bomber';

export type UnitComposition = Record<UnitType, number>;

export interface UnitDef {
  id: UnitType;
  name: string;
  shortName: string;
  branch: UnitBranch;
  unitClass: UnitClass;
  role: string;
  batchSize: number;
  manpowerCost: number;
  costFunds: number;
  costMaterials: number;
  costEnergy: number;
  upkeepFunds: number;
  upkeepMaterials: number;
  upkeepEnergy: number;
  hp: number;
  attack: number;
  defense: number;
  move: number;
  range: number;
  suspicionFactor: number;
  requiresCoastal?: boolean;
  requiresExposed?: boolean;
  strengths: string;
  weaknesses: string;
}

export interface UnitLevelSpec {
  level: 1 | 2 | 3 | 4;
  designation: string;
  costScience: number;
  atkMult: number;
  defMult: number;
  hpMult: number;
  moveBonus: number;
  rangeBonus: number;
  costDiscount: number;
  upkeepDiscount: number;
  perkSummary: string;
}

export interface UnitTechTreeEntry {
  unitType: UnitType;
  branch: UnitBranch;
  tierOrder: 1 | 2 | 3;
  prerequisite?: { unitType: UnitType; minLevel: number };
  levels: UnitLevelSpec[];
}

export type BattleTileType = 'open' | 'ridge' | 'cover' | 'bunker' | 'chokepoint';

export interface BattleTile {
  row: number;
  col: number;
  type: BattleTileType;
}

export interface BattleToken {
  id: string;
  side: 'player' | 'enemy';
  unitType: UnitType;
  unitClass: UnitClass;
  branch: UnitBranch;
  label: string;
  row: number;
  col: number;
  count: number; // actual troop/hull/airframe headcount represented by this squad
  maxHp: number;
  hp: number;
  attack: number;
  defense: number;
  move: number;
  range: number;
  hasMoved: boolean;
  hasActed: boolean;
}

export interface PendingBattle {
  id: string;
  isUprising: boolean;
  fromRegionId: string | null;
  toRegionId: string;
  toRegionName: string;
  terrain: TerrainType;
  defenderName: string;
  committedUnits: UnitComposition;
  defenderUnits: UnitComposition;
  hasFortress: boolean;
  localUnrest: number;
  tiles: BattleTile[];
  tokens: BattleToken[];
  phase: 'DEPLOY' | 'COMBAT' | 'COMPLETE';
  round: number;
  maxRounds: number;
  winner: 'player' | 'enemy' | 'retreat' | null;
  combatLog: string[];
}

export type CombatStyleId = 'guerilla' | 'blitz' | 'fortress' | 'infiltration';

export type Bloc2026 = 'western' | 'brics_eurasian' | 'arab_islamic' | 'global_south';

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  yearLabel: string;
  summary: string;
  featuredCountries: string[];
  blocLabels: Record<Bloc2026, string>;
}

export interface CombatStyleUpgrade {
  id: string;
  tier: 1 | 2 | 3;
  name: string;
  costScience: number;
  description: string;
  proEffect: string;
}

export interface CombatStyleDef {
  id: CombatStyleId;
  name: string;
  summary: string;
  pros: string[];
  cons: string[];
  upgrades: CombatStyleUpgrade[];
}

export type IdeologyId =
  | 'junta'
  | 'peoples_republic'
  | 'syndicalist'
  | 'technocracy';

export interface IdeologyDef {
  id: IdeologyId;
  name: string;
  summary: string;
  effectsText: string;
  switchInfluenceCost: number;
}

export type PolicyId =
  | 'underground_cells'
  | 'press_censorship'
  | 'conscription'
  | 'martial_law'
  | 'welfare_charter';

export interface PolicyDef {
  id: PolicyId;
  name: string;
  description: string;
  effectSummary: string;
  upkeepFunds: number;
  upkeepInfluence: number;
  minPhase?: RevolutionPhase;
}

export interface Region {
  id: string;
  name: string;
  continent: Continent;
  terrain: TerrainType;
  ownerId: string; // 'player' | 'rebels' | nationId
  hostNationId: string;
  troops: number;
  units: UnitComposition;
  unrest: number;
  baseFunds: number;
  baseMaterials: number;
  baseEnergy: number;
  baseScience: number;
  buildings: Record<BuildingType, number>;
  adjacentIds: string[];
  svgPath: string;
  labelPos: [number, number];
}

export interface Nation {
  id: string;
  name: string;
  bloc2026: Bloc2026;
  gdpTier: number; // 1 to 4
  color: string;
  strokeColor: string;
  relation: number; // -100 to 100
  pactTurns: number;
  allied?: boolean;
  betrayalTendency: number;
  atWar: boolean;
  eliminated: boolean;
  capitalRegionId: string;
  strengthGrowth: number;
}

export interface NationStance {
  relation: number;
  pactTurns: number;
  atWar: boolean;
  allied: boolean;
}

export interface BilateralLoan {
  id: string;
  lenderNationId: string;
  lenderName: string;
  bloc2026: Bloc2026;
  principal: number;
  remaining: number;
  interestRate: number;
  turnsLeft: number;
}

export type TechBranch = 'Industry' | 'Intelligence';

export interface TechNode {
  id: string;
  name: string;
  branch: TechBranch;
  tier: 1 | 2 | 3 | 4;
  cost: number;
  prerequisites: string[];
  description: string;
  effectSummary: string;
}

export interface BuildingDef {
  id: BuildingType;
  name: string;
  shortDesc: string;
  costFunds: number;
  costMaterials: number;
  upkeepFunds: number;
  upkeepEnergy: number;
  deltaFunds: number;
  deltaMaterials: number;
  deltaEnergy: number;
  deltaScience: number;
  deltaInfluence: number;
  unrestDelta: number;
  defenseBonus: number;
}

export interface EventChoice {
  id: string;
  label: string;
  effectHint: string;
  fundsDelta?: number;
  materialsDelta?: number;
  energyDelta?: number;
  manpowerDelta?: number;
  influenceDelta?: number;
  scienceDelta?: number;
  suspicionDelta?: number;
  globalUnrestDelta?: number;
  targetRegionId?: string;
  targetRegionFlipToRebels?: boolean;
  targetRegionTroopsDelta?: number;
  productionDebuffTurns?: number;
  factionDelta?: Partial<FactionLoyalty>;
}

export interface WorldEvent {
  id: string;
  title: string;
  category: 'Disaster' | 'Crisis' | 'Backstab' | 'Revolt' | 'Opportunity' | 'Politics';
  description: string;
  choices: EventChoice[];
}

export interface CombatModifier {
  label: string;
  value: string;
  positive: boolean;
}

export interface BattleReport {
  id: string;
  turn: number;
  attackerLabel: string;
  defenderLabel: string;
  regionId: string;
  regionName: string;
  playerWasAttacker: boolean;
  playerWon: boolean;
  captured: boolean;
  attackerInitial: number;
  attackerLosses: number;
  defenderInitial: number;
  defenderLosses: number;
  modifiers: CombatModifier[];
}

export interface LogEntry {
  id: string;
  turn: number;
  type: 'war' | 'economy' | 'event' | 'revolt' | 'diplomacy' | 'tech' | 'politics';
  message: string;
}

export interface CampaignOrigin {
  id: string;
  name: string;
  startRegionId: string;
  hostCountryName: string;
  summary: string;
  challengeNote: string;
  startingFunds: number;
  startingMaterials: number;
  startingEnergy: number;
  startingInfluence: number;
  startingManpower: number;
  startingTroops: number;
  startingUnits: UnitComposition;
}

export interface Resources {
  funds: number;
  materials: number;
  energy: number;
  manpower: number;
  influence: number;
  science: number;
}

export interface NetIncome {
  funds: number;
  materials: number;
  energy: number;
  manpower: number;
  influence: number;
  science: number;
  debtInterest: number;
  loanService: number;
  armyUpkeepFunds: number;
  armyUpkeepMaterials: number;
  armyUpkeepEnergy: number;
  buildingUpkeepFunds: number;
  buildingUpkeepEnergy: number;
  suspicionDelta: number;
}

export interface FactionLoyalty {
  military: number;
  industry: number;
  civic: number;
}

export interface GameStats {
  battlesWon: number;
  battlesLost: number;
  revoltsFaced: number;
  backstabsSurvived: number;
  disastersEndured: number;
  peakDebt: number;
  factoriesBuilt: number;
  techsUnlocked: number;
}

export interface HumanPlayer {
  id: string; // 'player' | 'player_2' | 'player_3' | 'player_4'
  name: string;
  color: string;
  phase: RevolutionPhase;
  suspicion: number;
  originId: string;
  startingNationId?: string;
  cellRegionId: string;
  undergroundTroops: number;
  undergroundUnits: UnitComposition;
  capitalRegionId: string;
  combatStyle: CombatStyleId;
  doctrineUpgrades: string[];
  ideology: IdeologyId;
  activePolicies: PolicyId[];
  factionLoyalty: FactionLoyalty;
  resources: Resources;
  taxPolicy: TaxPolicy;
  debtTurns: number;
  productionDebuffTurns: number;
  activeLoans: BilateralLoan[];
  creditFreezeTurns: number;
  unlockedTechs: string[];
  unitLevels: UnitComposition;
  stats: GameStats;
  attackCountsThisTurn: Record<string, number>;
  covertOpsUsedThisTurn: Record<string, boolean>;
  loanCooldown: number;
  eliminated: boolean;
  nationDiplomacy: Record<string, NationStance>;
  humanAllies: string[];
  humanWars: string[];
}

export interface PlayerSetupConfig {
  id?: string;
  name: string;
  originId: string;
  startingNationId?: string;
  combatStyle: CombatStyleId;
}

export interface GameState {
  mode: GameMode;
  gameVariant: GameVariant;
  scenarioId: ScenarioId;
  multiplayerType: MultiplayerType;
  roomCode?: string;
  players: HumanPlayer[];
  activePlayerIndex: number;
  awaitingHandoff: boolean;
  winnerPlayerId?: string | null;
  phase: RevolutionPhase;
  suspicion: number;
  turn: number;
  difficulty: Difficulty;
  originId: string;
  cellRegionId: string;
  undergroundTroops: number;
  undergroundUnits: UnitComposition;
  capitalRegionId: string;
  combatStyle: CombatStyleId;
  doctrineUpgrades: string[];
  ideology: IdeologyId;
  activePolicies: PolicyId[];
  factionLoyalty: FactionLoyalty;
  resources: Resources;
  taxPolicy: TaxPolicy;
  debtTurns: number;
  productionDebuffTurns: number;
  regions: Record<string, Region>;
  nations: Record<string, Nation>;
  aiWars: Array<[string, string]>;
  activeLoans: BilateralLoan[];
  creditFreezeTurns: number;
  unlockedTechs: string[];
  unitLevels: UnitComposition;
  activeEvent: WorldEvent | null;
  pendingBattle: PendingBattle | null;
  lastBattle: BattleReport | null;
  logs: LogEntry[];
  stats: GameStats;
  attackCountsThisTurn: Record<string, number>;
  covertOpsUsedThisTurn: Record<string, boolean>;
  loanCooldown: number;
}

export interface SaveSlotMeta {
  id: string;
  name: string;
  savedAt: string;
  turn: number;
  gameVariant: GameVariant;
  scenarioId: ScenarioId;
  difficulty: Difficulty;
  multiplayerType: MultiplayerType;
  playerCount: number;
  activePlayerName: string;
  provincesOwned: number;
  totalProvinces: number;
}

export interface SaveSlot extends SaveSlotMeta {
  state: GameState;
}

export type GameAction =
  | { type: 'END_TURN' }
  | { type: 'CONFIRM_HANDOFF' }
  | { type: 'RECRUIT_UNIT'; regionId: string; unitType: UnitType; amount?: number }
  | { type: 'BUILD_STRUCTURE'; regionId: string; buildingType: BuildingType }
  | { type: 'PACIFY_REGION'; regionId: string }
  | { type: 'LAUNCH_UPRISING' }
  | { type: 'START_ATTACK'; fromId: string; toId: string; commitFraction: number }
  | { type: 'UPDATE_BATTLE'; battle: PendingBattle }
  | { type: 'FINISH_BATTLE'; battle: PendingBattle }
  | { type: 'TRANSFER_TROOPS'; fromId: string; toId: string; fraction: number }
  | { type: 'COVERT_OP'; targetId: string; op: 'sabotage' | 'incite' }
  | { type: 'UNLOCK_TECH'; techId: string }
  | { type: 'RESEARCH_UNIT'; unitType: UnitType }
  | { type: 'UNLOCK_DOCTRINE'; upgradeId: string }
  | { type: 'SWITCH_IDEOLOGY'; ideologyId: IdeologyId }
  | { type: 'TOGGLE_POLICY'; policyId: PolicyId }
  | { type: 'APPEASE_FACTION'; pillar: keyof FactionLoyalty }
  | { type: 'SET_TAX_POLICY'; policy: TaxPolicy }
  | { type: 'TAKE_EMERGENCY_LOAN' }
  | { type: 'SIGN_PACT'; nationId: string }
  | { type: 'FORM_ALLIANCE'; nationId: string }
  | { type: 'DECLARE_WAR'; nationId: string }
  | { type: 'TOGGLE_HUMAN_ALLY'; targetPlayerId: string }
  | { type: 'DECLARE_WAR_HUMAN'; targetPlayerId: string }
  | { type: 'BORROW_NATION'; nationId: string }
  | { type: 'REPAY_LOAN'; loanId: string }
  | { type: 'DEFAULT_LOAN'; loanId: string }
  | { type: 'COURT_NATION'; nationId: string }
  | { type: 'EVENT_CHOICE'; choice: EventChoice }
  | { type: 'CLOSE_BATTLE_REPORT' };
