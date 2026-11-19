import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Unsubscribe,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { applyScenarioToWorld } from '../data/scenarios';
import { createInitialUnitLevels, UNIT_ORDER } from '../data/techAndBuildings';
import {
  CAMPAIGN_ORIGINS,
  createInitialNations,
  createInitialRegions,
  emptyUnits,
  sumAllUnits,
} from '../data/worldMap';
import {
  applyGameAction,
  createMultiplayerGame,
  getActivePlayerId,
  PLAYER_IDS,
} from '../engine/gameEngine';
import { hydratePlayerIntoState, snapshotActivePlayer } from '../engine/multiplayerHelpers';
import { db, handleFirestoreError, OperationType } from '../firebase';
import {
  BuildingType,
  CombatStyleId,
  Difficulty,
  GameAction,
  GameState,
  GameVariant,
  HumanPlayer,
  Nation,
  Region,
  ScenarioId,
  UnitComposition,
} from '../types/game';

export interface OnlineSeatInfo {
  seatId: string;
  uid: string;
  name: string;
  originId: string;
  startingNationId: string;
  combatStyle: CombatStyleId;
  ready: boolean;
  connected: boolean;
}

export interface OnlineLobbyState {
  code: string;
  hostUid: string;
  hostSeatId: string;
  status: 'WAITING' | 'STARTED' | 'FINISHED';
  gameVariant: GameVariant;
  scenarioId: ScenarioId;
  difficulty: Difficulty;
  activeUid: string;
  activeSeatId: string;
  seatUids: string[];
  seats: OnlineSeatInfo[];
  started: boolean;
}

interface SerializedRegionDelta {
  ownerId: string;
  unrest: number;
  units: Record<string, number>;
  buildings: Record<string, number>;
}

interface SerializedNationDelta {
  eliminated: boolean;
  relation: number;
  pactTurns: number;
  atWar: boolean;
  allied: boolean;
}

interface SerializedMetaDoc {
  docType: 'meta';
  roomCode: string;
  revision: number;
  mode: GameState['mode'];
  gameVariant: GameVariant;
  scenarioId: ScenarioId;
  difficulty: Difficulty;
  multiplayerType: 'ONLINE';
  activePlayerIndex: number;
  awaitingHandoff: boolean;
  winnerPlayerId: string | null;
  turn: number;
  players: HumanPlayer[];
  aiWars: Array<{ a: string; b: string }>;
  activeEvent: GameState['activeEvent'];
  pendingBattle: GameState['pendingBattle'];
  lastBattle: GameState['lastBattle'];
  logs: GameState['logs'];
  updatedByUid: string;
  updatedAt: unknown;
}

interface SerializedRegionsDoc {
  docType: 'regions';
  roomCode: string;
  revision: number;
  regions: Record<string, SerializedRegionDelta>;
  updatedByUid: string;
  updatedAt: unknown;
}

interface SerializedNationsDoc {
  docType: 'nations';
  roomCode: string;
  revision: number;
  nations: Record<string, SerializedNationDelta>;
  updatedByUid: string;
  updatedAt: unknown;
}

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_REGEX = /^[A-Z0-9]{5}$/;
const BUILDING_KEYS: BuildingType[] = [
  'workshop',
  'refinery',
  'bank',
  'lab',
  'propaganda',
  'fortress',
];

const randomCode = (): string => {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
  }
  return code;
};

const stripUndefined = <T>(val: T): T => {
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) {
    return val.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return val;
};

const toNonZeroRecord = (rec: Record<string, number>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (typeof v === 'number' && v > 0) {
      out[k] = v;
    }
  }
  return out;
};

export const serializeGameStateToDocs = (
  rawState: GameState,
  roomCode: string,
  revision: number,
  uid: string
): {
  metaDoc: SerializedMetaDoc;
  regionsDoc: SerializedRegionsDoc;
  nationsDoc: SerializedNationsDoc;
} => {
  const state = snapshotActivePlayer(rawState);

  const regionsMap: Record<string, SerializedRegionDelta> = {};
  for (const [rId, r] of Object.entries(state.regions)) {
    regionsMap[rId] = {
      ownerId: r.ownerId,
      unrest: Math.round(r.unrest),
      units: toNonZeroRecord(r.units as unknown as Record<string, number>),
      buildings: toNonZeroRecord(r.buildings as unknown as Record<string, number>),
    };
  }

  const nationsMap: Record<string, SerializedNationDelta> = {};
  for (const [nId, n] of Object.entries(state.nations)) {
    nationsMap[nId] = {
      eliminated: Boolean(n.eliminated),
      relation: Math.round(n.relation),
      pactTurns: Math.round(n.pactTurns),
      atWar: Boolean(n.atWar),
      allied: Boolean(n.allied),
    };
  }

  const ts = serverTimestamp();

  const metaDoc: SerializedMetaDoc = {
    docType: 'meta',
    roomCode,
    revision,
    mode: state.mode,
    gameVariant: state.gameVariant,
    scenarioId: state.scenarioId,
    difficulty: state.difficulty,
    multiplayerType: 'ONLINE',
    activePlayerIndex: state.activePlayerIndex,
    awaitingHandoff: false,
    winnerPlayerId: state.winnerPlayerId ?? null,
    turn: state.turn,
    players: stripUndefined(state.players),
    aiWars: (state.aiWars ?? []).slice(0, 500).map(([a, b]) => ({ a, b })),
    activeEvent: state.activeEvent ? stripUndefined(state.activeEvent) : null,
    pendingBattle: state.pendingBattle ? stripUndefined(state.pendingBattle) : null,
    lastBattle: state.lastBattle ? stripUndefined(state.lastBattle) : null,
    logs: stripUndefined((state.logs ?? []).slice(0, 50)),
    updatedByUid: uid,
    updatedAt: ts,
  };

  const regionsDoc: SerializedRegionsDoc = {
    docType: 'regions',
    roomCode,
    revision,
    regions: regionsMap,
    updatedByUid: uid,
    updatedAt: ts,
  };

  const nationsDoc: SerializedNationsDoc = {
    docType: 'nations',
    roomCode,
    revision,
    nations: nationsMap,
    updatedByUid: uid,
    updatedAt: ts,
  };

  return { metaDoc, regionsDoc, nationsDoc };
};

export const hydrateGameStateFromDocs = (
  meta: SerializedMetaDoc,
  regionsDoc: SerializedRegionsDoc,
  nationsDoc: SerializedNationsDoc
): GameState => {
  const baseRegions = createInitialRegions();
  const baseNations = createInitialNations();
  applyScenarioToWorld(meta.scenarioId ?? 'modern_2026', baseRegions, baseNations);

  const hydratedRegions: Record<string, Region> = {};
  for (const [rId, baseReg] of Object.entries(baseRegions)) {
    const delta = regionsDoc.regions?.[rId];
    if (!delta) {
      hydratedRegions[rId] = baseReg;
      continue;
    }
    const units: UnitComposition = emptyUnits();
    for (const ut of UNIT_ORDER) {
      units[ut] = Math.max(0, Math.round(delta.units?.[ut] ?? 0));
    }
    const buildings = { ...baseReg.buildings };
    for (const bKey of BUILDING_KEYS) {
      buildings[bKey] = Math.max(0, Math.round(delta.buildings?.[bKey] ?? 0));
    }
    hydratedRegions[rId] = {
      ...baseReg,
      ownerId: delta.ownerId ?? baseReg.ownerId,
      unrest: delta.unrest ?? baseReg.unrest,
      units,
      troops: sumAllUnits(units),
      buildings,
    };
  }

  const hydratedNations: Record<string, Nation> = {};
  for (const [nId, baseNat] of Object.entries(baseNations)) {
    const delta = nationsDoc.nations?.[nId];
    hydratedNations[nId] = delta
      ? {
          ...baseNat,
          eliminated: Boolean(delta.eliminated),
          relation: delta.relation ?? baseNat.relation,
          pactTurns: delta.pactTurns ?? baseNat.pactTurns,
          atWar: Boolean(delta.atWar),
          allied: Boolean(delta.allied),
        }
      : baseNat;
  }

  const normalizedPlayers: HumanPlayer[] = (meta.players ?? []).map((p) => ({
    ...p,
    doctrineUpgrades: p.doctrineUpgrades ?? [],
    activePolicies: p.activePolicies ?? [],
    activeLoans: p.activeLoans ?? [],
    unlockedTechs: p.unlockedTechs ?? [],
    unitLevels: p.unitLevels ?? createInitialUnitLevels(meta.gameVariant),
    undergroundUnits: { ...emptyUnits(), ...(p.undergroundUnits ?? {}) },
    attackCountsThisTurn: p.attackCountsThisTurn ?? {},
    covertOpsUsedThisTurn: p.covertOpsUsedThisTurn ?? {},
    humanAllies: p.humanAllies ?? [],
    humanWars: p.humanWars ?? [],
    nationDiplomacy: p.nationDiplomacy ?? {},
  }));

  const p0 = normalizedPlayers[meta.activePlayerIndex] ?? normalizedPlayers[0];

  const baseState: GameState = {
    mode: meta.mode,
    gameVariant: meta.gameVariant,
    scenarioId: meta.scenarioId ?? 'modern_2026',
    multiplayerType: 'ONLINE',
    roomCode: meta.roomCode,
    players: normalizedPlayers,
    activePlayerIndex: meta.activePlayerIndex ?? 0,
    awaitingHandoff: false,
    winnerPlayerId: meta.winnerPlayerId ?? null,
    phase: p0.phase,
    suspicion: p0.suspicion,
    turn: meta.turn,
    difficulty: meta.difficulty,
    originId: p0.originId,
    cellRegionId: p0.cellRegionId,
    undergroundTroops: p0.undergroundTroops,
    undergroundUnits: { ...p0.undergroundUnits },
    capitalRegionId: p0.capitalRegionId,
    combatStyle: p0.combatStyle,
    doctrineUpgrades: [...p0.doctrineUpgrades],
    ideology: p0.ideology,
    activePolicies: [...p0.activePolicies],
    factionLoyalty: { ...p0.factionLoyalty },
    resources: { ...p0.resources },
    taxPolicy: p0.taxPolicy,
    debtTurns: p0.debtTurns,
    productionDebuffTurns: p0.productionDebuffTurns,
    regions: hydratedRegions,
    nations: hydratedNations,
    aiWars: (meta.aiWars ?? []).map((w) => [w.a, w.b] as [string, string]),
    activeLoans: [...p0.activeLoans],
    creditFreezeTurns: p0.creditFreezeTurns,
    unlockedTechs: [...p0.unlockedTechs],
    unitLevels: { ...p0.unitLevels },
    activeEvent: meta.activeEvent ?? null,
    pendingBattle: meta.pendingBattle ?? null,
    lastBattle: meta.lastBattle ?? null,
    logs: meta.logs ?? [],
    stats: { ...p0.stats },
    attackCountsThisTurn: { ...p0.attackCountsThisTurn },
    covertOpsUsedThisTurn: { ...p0.covertOpsUsedThisTurn },
    loanCooldown: p0.loanCooldown,
  };

  return hydratePlayerIntoState(baseState, meta.activePlayerIndex ?? 0);
};

const toLobbyState = (data: Record<string, unknown>): OnlineLobbyState => {
  const status = (data.status as OnlineLobbyState['status']) ?? 'WAITING';
  return {
    code: String(data.code ?? ''),
    hostUid: String(data.hostUid ?? ''),
    hostSeatId: String(data.hostSeatId ?? 'player'),
    status,
    gameVariant: (data.gameVariant as GameVariant) ?? 'CLASSIC',
    scenarioId: (data.scenarioId as ScenarioId) ?? 'modern_2026',
    difficulty: (data.difficulty as Difficulty) ?? 'Standard',
    activeUid: String(data.activeUid ?? ''),
    activeSeatId: String(data.activeSeatId ?? 'player'),
    seatUids: Array.isArray(data.seatUids) ? (data.seatUids as string[]) : [],
    seats: Array.isArray(data.seats) ? (data.seats as OnlineSeatInfo[]) : [],
    started: status !== 'WAITING',
  };
};

export const createOnlineRoom = async (
  uid: string,
  cfg: {
    name: string;
    gameVariant: GameVariant;
    scenarioId: ScenarioId;
    difficulty: Difficulty;
    originId: string;
    startingNationId?: string;
    combatStyle: CombatStyleId;
  }
): Promise<{ code: string; seatId: string }> => {
  let code = '';
  for (let i = 0; i < 6; i++) {
    const candidate = randomCode();
    try {
      const existing = await getDoc(doc(db, 'rooms', candidate));
      if (!existing.exists()) {
        code = candidate;
        break;
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `rooms/${candidate}`);
    }
  }
  if (!code) code = randomCode();

  const seatId = PLAYER_IDS[0];
  const cleanName = (cfg.name || 'Commander 1').trim().slice(0, 24) || 'Commander 1';
  const seat: OnlineSeatInfo = {
    seatId,
    uid,
    name: cleanName,
    originId: cfg.originId || CAMPAIGN_ORIGINS[0].id,
    startingNationId: cfg.startingNationId || 'brazil',
    combatStyle: cfg.combatStyle || 'guerilla',
    ready: true,
    connected: true,
  };

  const payload = {
    code,
    hostUid: uid,
    hostSeatId: seatId,
    status: 'WAITING',
    gameVariant: cfg.gameVariant || 'CLASSIC',
    scenarioId: cfg.gameVariant === 'BLITZ' ? cfg.scenarioId || 'modern_2026' : 'modern_2026',
    difficulty: cfg.difficulty || 'Standard',
    activeUid: uid,
    activeSeatId: seatId,
    seatUids: [uid],
    seats: [seat],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'rooms', code), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `rooms/${code}`);
  }

  return { code, seatId };
};

export const joinOnlineRoom = async (
  uid: string,
  rawCode: string,
  name: string
): Promise<{ code: string; seatId: string }> => {
  const code = rawCode.trim().toUpperCase();
  if (!ROOM_CODE_REGEX.test(code)) {
    throw new Error('Enter a valid 5-character lobby code (letters & numbers).');
  }

  const roomRef = doc(db, 'rooms', code);

  try {
    const joinedSeatId = await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) {
        throw new Error(`Lobby "${code}" does not exist. Check the code with the host.`);
      }

      const data = snap.data() as Record<string, unknown>;
      const lobby = toLobbyState(data);

      const existingSeat = lobby.seats.find((s) => s.uid === uid);
      if (existingSeat) {
        return existingSeat.seatId;
      }

      if (lobby.status !== 'WAITING') {
        throw new Error(`Lobby "${code}" has already started its campaign.`);
      }
      if (lobby.seats.length >= 4) {
        throw new Error(`Lobby "${code}" is full (4/4 Commanders).`);
      }

      const nextSeatId =
        PLAYER_IDS.find((id) => !lobby.seats.some((s) => s.seatId === id)) ??
        PLAYER_IDS[lobby.seats.length];
      const seatIndex = PLAYER_IDS.indexOf(nextSeatId);
      const defaultOrigin =
        CAMPAIGN_ORIGINS[Math.max(0, seatIndex) % CAMPAIGN_ORIGINS.length];
      const fallbackNations = ['brazil', 'germany', 'japan', 'turkey', 'india'];
      const usedNations = new Set(lobby.seats.map((s) => s.startingNationId));
      const defaultNation =
        fallbackNations.find((n) => !usedNations.has(n)) ?? 'india';

      const cleanName =
        (name || `Commander ${lobby.seats.length + 1}`).trim().slice(0, 24) ||
        `Commander ${lobby.seats.length + 1}`;

      const newSeat: OnlineSeatInfo = {
        seatId: nextSeatId,
        uid,
        name: cleanName,
        originId: defaultOrigin.id,
        startingNationId: defaultNation,
        combatStyle: 'guerilla',
        ready: false,
        connected: true,
      };

      tx.update(roomRef, {
        seats: [...lobby.seats, newSeat],
        seatUids: [...lobby.seatUids, uid],
        updatedAt: serverTimestamp(),
      });

      return nextSeatId;
    });

    return { code, seatId: joinedSeatId };
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('does not exist') ||
        err.message.includes('already started') ||
        err.message.includes('is full') ||
        err.message.includes('valid 5-character'))
    ) {
      throw err;
    }
    handleFirestoreError(err, OperationType.UPDATE, `rooms/${code}`);
  }
};

export const updateOnlineSeat = async (
  code: string,
  uid: string,
  patch: Partial<
    Pick<
      OnlineSeatInfo,
      'name' | 'originId' | 'startingNationId' | 'combatStyle' | 'ready'
    >
  >
): Promise<void> => {
  const roomRef = doc(db, 'rooms', code);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) return;
      const lobby = toLobbyState(snap.data() as Record<string, unknown>);
      if (lobby.status !== 'WAITING') return;

      const updatedSeats = lobby.seats.map((s) => {
        if (s.uid !== uid) return s;
        const cleanName =
          typeof patch.name === 'string'
            ? patch.name.trim().slice(0, 24) || s.name
            : s.name;
        return {
          ...s,
          name: cleanName,
          originId: patch.originId ?? s.originId,
          startingNationId: patch.startingNationId ?? s.startingNationId,
          combatStyle: patch.combatStyle ?? s.combatStyle,
          ready: typeof patch.ready === 'boolean' ? patch.ready : s.ready,
        };
      });

      tx.update(roomRef, {
        seats: updatedSeats,
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `rooms/${code}`);
  }
};

export const updateOnlineSettings = async (
  code: string,
  uid: string,
  patch: {
    gameVariant?: GameVariant;
    scenarioId?: ScenarioId;
    difficulty?: Difficulty;
  }
): Promise<void> => {
  const roomRef = doc(db, 'rooms', code);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const lobby = toLobbyState(snap.data() as Record<string, unknown>);
    if (lobby.hostUid !== uid || lobby.status !== 'WAITING') return;

    const nextVariant = patch.gameVariant ?? lobby.gameVariant;
    const nextScenario =
      nextVariant === 'BLITZ'
        ? patch.scenarioId ?? lobby.scenarioId
        : 'modern_2026';
    const nextDifficulty = patch.difficulty ?? lobby.difficulty;

    await updateDoc(roomRef, {
      gameVariant: nextVariant,
      scenarioId: nextScenario,
      difficulty: nextDifficulty,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `rooms/${code}`);
  }
};

export const leaveOnlineRoom = async (
  code: string,
  uid: string
): Promise<void> => {
  const roomRef = doc(db, 'rooms', code);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) return;
    const lobby = toLobbyState(snap.data() as Record<string, unknown>);
    if (lobby.status !== 'WAITING') return;

    if (lobby.hostUid === uid) {
      await deleteDoc(roomRef);
      return;
    }

    await runTransaction(db, async (tx) => {
      const txSnap = await tx.get(roomRef);
      if (!txSnap.exists()) return;
      const cur = toLobbyState(txSnap.data() as Record<string, unknown>);
      if (cur.status !== 'WAITING') return;
      tx.update(roomRef, {
        seats: cur.seats.filter((s) => s.uid !== uid),
        seatUids: cur.seatUids.filter((id) => id !== uid),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `rooms/${code}`);
  }
};

export const startOnlineRoom = async (
  code: string,
  uid: string
): Promise<void> => {
  const roomRef = doc(db, 'rooms', code);
  try {
    const snap = await getDoc(roomRef);
    if (!snap.exists()) throw new Error(`Lobby "${code}" not found.`);
    const lobby = toLobbyState(snap.data() as Record<string, unknown>);
    if (lobby.hostUid !== uid || lobby.status !== 'WAITING') return;

    const initialGame = createMultiplayerGame(
      lobby.seats.map((s) => ({
        id: s.seatId,
        name: s.name,
        originId: s.originId,
        startingNationId: s.startingNationId,
        combatStyle: s.combatStyle,
      })),
      lobby.gameVariant,
      lobby.difficulty,
      'ONLINE',
      lobby.code,
      lobby.scenarioId
    );

    const activeSeatId = getActivePlayerId(initialGame);
    const activeUid =
      lobby.seats.find((s) => s.seatId === activeSeatId)?.uid ?? lobby.hostUid;

    const { metaDoc, regionsDoc, nationsDoc } = serializeGameStateToDocs(
      initialGame,
      lobby.code,
      1,
      uid
    );

    const batch = writeBatch(db);
    batch.update(roomRef, {
      status: 'STARTED',
      activeUid,
      activeSeatId,
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'rooms', lobby.code, 'game', 'meta'), metaDoc);
    batch.set(doc(db, 'rooms', lobby.code, 'game', 'regions'), regionsDoc);
    batch.set(doc(db, 'rooms', lobby.code, 'game', 'nations'), nationsDoc);
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `rooms/${code}`);
  }
};

export const dispatchOnlineAction = async (
  code: string,
  uid: string,
  lobby: OnlineLobbyState,
  currentState: GameState,
  currentRevision: number,
  action: GameAction
): Promise<GameState> => {
  if (lobby.activeUid !== uid) {
    throw new Error('Wait for your turn before issuing commands.');
  }

  const nextState = applyGameAction(currentState, action);
  const nextRevision = currentRevision + 1;

  const { metaDoc, regionsDoc, nationsDoc } = serializeGameStateToDocs(
    nextState,
    code,
    nextRevision,
    uid
  );

  const nextSeatId = getActivePlayerId(nextState);
  const nextActiveUid =
    lobby.seats.find((s) => s.seatId === nextSeatId)?.uid ?? lobby.activeUid;
  const nextStatus: OnlineLobbyState['status'] =
    nextState.mode === 'VICTORY' || nextState.mode === 'DEFEAT'
      ? 'FINISHED'
      : 'STARTED';

  const batch = writeBatch(db);
  batch.set(doc(db, 'rooms', code, 'game', 'meta'), metaDoc);
  batch.set(doc(db, 'rooms', code, 'game', 'regions'), regionsDoc);
  batch.set(doc(db, 'rooms', code, 'game', 'nations'), nationsDoc);

  if (
    nextActiveUid !== lobby.activeUid ||
    nextSeatId !== lobby.activeSeatId ||
    nextStatus !== lobby.status
  ) {
    batch.update(doc(db, 'rooms', code), {
      status: nextStatus,
      activeUid: nextActiveUid,
      activeSeatId: nextSeatId,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `rooms/${code}/game`);
  }

  return nextState;
};

export const findLatestJoinedRoom = async (
  uid: string
): Promise<{ code: string; seatId: string } | null> => {
  try {
    const q = query(
      collection(db, 'rooms'),
      where('seatUids', 'array-contains', uid)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;

    const candidates = snap.docs
      .map((d) => toLobbyState(d.data() as Record<string, unknown>))
      .filter((r) => r.status !== 'FINISHED');
    if (candidates.length === 0) return null;

    const active = candidates.find((r) => r.status === 'STARTED') ?? candidates[0];
    const seat = active.seats.find((s) => s.uid === uid);
    if (!seat) return null;
    return { code: active.code, seatId: seat.seatId };
  } catch {
    return null;
  }
};

export const subscribeToOnlineRoom = (
  code: string,
  callbacks: {
    onLobby: (lobby: OnlineLobbyState | null) => void;
    onState: (state: GameState, revision: number) => void;
    onError: (message: string) => void;
  }
): Unsubscribe => {
  let metaDoc: SerializedMetaDoc | null = null;
  let regionsDoc: SerializedRegionsDoc | null = null;
  let nationsDoc: SerializedNationsDoc | null = null;
  let lastHydratedRev = 0;

  let unsubMeta: Unsubscribe | null = null;
  let unsubRegions: Unsubscribe | null = null;
  let unsubNations: Unsubscribe | null = null;

  const stopGameListeners = () => {
    unsubMeta?.();
    unsubRegions?.();
    unsubNations?.();
    unsubMeta = null;
    unsubRegions = null;
    unsubNations = null;
  };

  const tryHydrate = () => {
    if (!metaDoc || !regionsDoc || !nationsDoc) return;
    if (
      metaDoc.revision === regionsDoc.revision &&
      metaDoc.revision === nationsDoc.revision &&
      metaDoc.revision !== lastHydratedRev
    ) {
      lastHydratedRev = metaDoc.revision;
      const hydrated = hydrateGameStateFromDocs(metaDoc, regionsDoc, nationsDoc);
      callbacks.onState(hydrated, metaDoc.revision);
    }
  };

  const startGameListeners = () => {
    if (unsubMeta) return;

    unsubMeta = onSnapshot(
      doc(db, 'rooms', code, 'game', 'meta'),
      (snap) => {
        if (!snap.exists()) return;
        metaDoc = snap.data() as SerializedMetaDoc;
        tryHydrate();
      },
      (err) => {
        callbacks.onError('Failed to sync match metadata.');
        handleFirestoreError(err, OperationType.GET, `rooms/${code}/game/meta`);
      }
    );

    unsubRegions = onSnapshot(
      doc(db, 'rooms', code, 'game', 'regions'),
      (snap) => {
        if (!snap.exists()) return;
        regionsDoc = snap.data() as SerializedRegionsDoc;
        tryHydrate();
      },
      (err) => {
        callbacks.onError('Failed to sync map provinces.');
        handleFirestoreError(err, OperationType.GET, `rooms/${code}/game/regions`);
      }
    );

    unsubNations = onSnapshot(
      doc(db, 'rooms', code, 'game', 'nations'),
      (snap) => {
        if (!snap.exists()) return;
        nationsDoc = snap.data() as SerializedNationsDoc;
        tryHydrate();
      },
      (err) => {
        callbacks.onError('Failed to sync diplomatic nations.');
        handleFirestoreError(err, OperationType.GET, `rooms/${code}/game/nations`);
      }
    );
  };

  const unsubRoom = onSnapshot(
    doc(db, 'rooms', code),
    (snap) => {
      if (!snap.exists()) {
        stopGameListeners();
        callbacks.onLobby(null);
        return;
      }
      const lobby = toLobbyState(snap.data() as Record<string, unknown>);
      callbacks.onLobby(lobby);
      if (lobby.status !== 'WAITING') {
        startGameListeners();
      }
    },
    (err) => {
      callbacks.onError('Lost connection to multiplayer lobby.');
      handleFirestoreError(err, OperationType.GET, `rooms/${code}`);
    }
  );

  return () => {
    stopGameListeners();
    unsubRoom();
  };
};
