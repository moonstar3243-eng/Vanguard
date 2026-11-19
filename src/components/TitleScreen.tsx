import React, { useMemo, useState } from 'react';
import {
  applyScenarioToWorld,
  getScenarioBlocLabel,
  SCENARIO_LIST,
  SCENARIOS,
} from '../data/scenarios';
import { COMBAT_STYLES } from '../data/techAndBuildings';
import {
  CAMPAIGN_ORIGINS,
  createInitialNations,
  createInitialRegions,
} from '../data/worldMap';
import { PLAYER_COLORS, PLAYER_IDS } from '../engine/gameEngine';
import {
  CombatStyleId,
  Difficulty,
  GameVariant,
  MultiplayerType,
  PlayerSetupConfig,
  SaveSlotMeta,
  ScenarioId,
} from '../types/game';
import {
  OnlineLobbyState,
  OnlineSeatInfo,
} from '../services/multiplayerService';
import {
  Check,
  Clock,
  Copy,
  Flame,
  FolderOpen,
  Globe,
  Link2,
  LogIn,
  LogOut,
  Minus,
  Search,
  ShieldAlert,
  Users,
  Wifi,
  Zap,
} from 'lucide-react';

export type { OnlineLobbyState, OnlineSeatInfo };

export interface AuthUserSummary {
  uid: string;
  displayName: string | null;
  email: string | null;
}

interface TitleScreenProps {
  latestSave: SaveSlotMeta | null;
  saveCount: number;
  onStartCampaign: (
    players: PlayerSetupConfig[],
    variant: GameVariant,
    difficulty: Difficulty,
    multiplayerType: MultiplayerType,
    scenarioId: ScenarioId
  ) => void;
  onContinueLatest: () => void;
  onOpenSaveManager: () => void;
  onlineLobby: OnlineLobbyState | null;
  onlineSeatId: string | null;
  onlineError: string | null;
  onlineBusy?: boolean;
  authReady: boolean;
  authUser: AuthUserSummary | null;
  initialJoinCode?: string;
  onGoogleSignIn: () => void;
  onGoogleSignOut: () => void;
  onCreateOnlineRoom: (cfg: {
    name: string;
    gameVariant: GameVariant;
    scenarioId: ScenarioId;
    difficulty: Difficulty;
    originId: string;
    startingNationId?: string;
    combatStyle: CombatStyleId;
  }) => void;
  onJoinOnlineRoom: (roomCode: string, name: string) => void;
  onUpdateOnlineSeat: (patch: Partial<OnlineSeatInfo>) => void;
  onUpdateOnlineSettings: (patch: {
    gameVariant?: GameVariant;
    scenarioId?: ScenarioId;
    difficulty?: Difficulty;
  }) => void;
  onStartOnlineRoom: () => void;
  onLeaveOnlineRoom: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  latestSave,
  saveCount,
  onStartCampaign,
  onContinueLatest,
  onOpenSaveManager,
  onlineLobby,
  onlineSeatId,
  onlineError,
  onlineBusy = false,
  authReady,
  authUser,
  initialJoinCode = '',
  onGoogleSignIn,
  onGoogleSignOut,
  onCreateOnlineRoom,
  onJoinOnlineRoom,
  onUpdateOnlineSeat,
  onUpdateOnlineSettings,
  onStartOnlineRoom,
  onLeaveOnlineRoom,
}) => {
  const [gameVariant, setGameVariant] = useState<GameVariant>('CLASSIC');
  const [scenarioId, setScenarioId] = useState<ScenarioId>('modern_2026');
  const [mpMode, setMpMode] = useState<MultiplayerType>(
    initialJoinCode ? 'ONLINE' : 'SOLO'
  );
  const [hotseatCount, setHotseatCount] = useState<number>(2);
  const [editingSeatIdx, setEditingSeatIdx] = useState<number>(0);
  const [difficulty, setDifficulty] = useState<Difficulty>('Standard');
  const [countrySearch, setCountrySearch] = useState<string>('');
  const [joinCode, setJoinCode] = useState<string>(initialJoinCode);
  const [joinName, setJoinName] = useState<string>(
    () => authUser?.displayName?.split(' ')[0]?.slice(0, 20) || 'Commander'
  );
  const [copiedBanner, setCopiedBanner] = useState<'code' | 'link' | null>(null);

  const [seatConfigs, setSeatConfigs] = useState<PlayerSetupConfig[]>([
    {
      id: PLAYER_IDS[0],
      name: 'Commander 1',
      originId: CAMPAIGN_ORIGINS[0].id,
      startingNationId: 'brazil',
      combatStyle: 'guerilla',
    },
    {
      id: PLAYER_IDS[1],
      name: 'Commander 2',
      originId: CAMPAIGN_ORIGINS[1].id,
      startingNationId: 'germany',
      combatStyle: 'blitz',
    },
    {
      id: PLAYER_IDS[2],
      name: 'Commander 3',
      originId: CAMPAIGN_ORIGINS[2].id,
      startingNationId: 'japan',
      combatStyle: 'fortress',
    },
    {
      id: PLAYER_IDS[3],
      name: 'Commander 4',
      originId: CAMPAIGN_ORIGINS[3].id,
      startingNationId: 'turkey',
      combatStyle: 'infiltration',
    },
  ]);

  const activeVariant = mpMode === 'ONLINE' && onlineLobby ? onlineLobby.gameVariant : gameVariant;
  const activeScenario: ScenarioId =
    activeVariant === 'BLITZ'
      ? mpMode === 'ONLINE' && onlineLobby?.scenarioId
        ? onlineLobby.scenarioId
        : scenarioId
      : 'modern_2026';
  const activeDifficulty = mpMode === 'ONLINE' && onlineLobby ? onlineLobby.difficulty : difficulty;

  const { nationList, provinceCountByNation } = useMemo(() => {
    const nMap = createInitialNations();
    const rMap = createInitialRegions();
    applyScenarioToWorld(activeScenario, rMap, nMap);
    const counts: Record<string, number> = {};
    for (const r of Object.values(rMap)) {
      counts[r.ownerId] = (counts[r.ownerId] ?? 0) + 1;
    }
    const list = Object.values(nMap)
      .filter((n) => !n.eliminated && (counts[n.id] ?? 0) > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
    return { nationList: list, provinceCountByNation: counts };
  }, [activeScenario]);

  const filteredNations = useMemo(() => {
    const q = countrySearch.trim().toLowerCase();
    const featured = SCENARIOS[activeScenario]?.featuredCountries ?? [];
    if (!q) {
      const picks = featured
        .map((id) => nationList.find((n) => n.id === id))
        .filter((n): n is (typeof nationList)[number] => Boolean(n));
      return picks.length > 0 ? picks : nationList.slice(0, 12);
    }
    return nationList.filter((n) => n.name.toLowerCase().includes(q)).slice(0, 24);
  }, [activeScenario, countrySearch, nationList]);

  const activeCount = mpMode === 'SOLO' ? 1 : mpMode === 'HOTSEAT' ? hotseatCount : 1;
  const currentSeatIdx = Math.min(editingSeatIdx, activeCount - 1);
  const currentSeat = seatConfigs[currentSeatIdx];

  const myOnlineSeat = onlineLobby?.seats.find((s) => s.seatId === onlineSeatId) ?? null;

  const updateSeat = (patch: Partial<PlayerSetupConfig>) => {
    if (mpMode === 'ONLINE' && onlineLobby) {
      onUpdateOnlineSeat(patch);
      return;
    }
    setSeatConfigs((prev) =>
      prev.map((s, idx) => (idx === currentSeatIdx ? { ...s, ...patch } : s))
    );
  };

  const editedOriginId =
    mpMode === 'ONLINE' && myOnlineSeat ? myOnlineSeat.originId : currentSeat.originId;
  const editedNationId =
    mpMode === 'ONLINE' && myOnlineSeat
      ? myOnlineSeat.startingNationId ?? 'brazil'
      : currentSeat.startingNationId ?? 'brazil';
  const editedCombatStyle =
    mpMode === 'ONLINE' && myOnlineSeat ? myOnlineSeat.combatStyle : currentSeat.combatStyle;

  const takenBlitzNations = useMemo(() => {
    if (mpMode === 'ONLINE' && onlineLobby) {
      return new Set(
        onlineLobby.seats
          .filter((s) => s.seatId !== onlineSeatId)
          .map((s) => s.startingNationId)
          .filter(Boolean)
      );
    }
    return new Set(
      seatConfigs
        .slice(0, activeCount)
        .filter((_, idx) => idx !== currentSeatIdx)
        .map((s) => s.startingNationId)
        .filter(Boolean)
    );
  }, [activeCount, currentSeatIdx, mpMode, onlineLobby, onlineSeatId, seatConfigs]);

  const defaultOnlineName =
    authUser?.displayName?.trim().slice(0, 24) || seatConfigs[0].name;

  const copyLobbyValue = (kind: 'code' | 'link', text: string) => {
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(text);
    }
    setCopiedBanner(kind);
    window.setTimeout(() => setCopiedBanner((prev) => (prev === kind ? null : prev)), 2000);
  };

  return (
    <div className="min-h-screen bg-[#0C1017] text-[#EEF2F6] flex flex-col">
      <div className="relative w-full min-h-[300px] lg:min-h-[330px] flex items-end border-b border-slate-800/80 overflow-hidden">
        <img
          src="/src/assets/images/war_room_backdrop_1794740655670.jpg"
          alt="Tactical war room strategy map table"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover object-center opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0C1017] via-[#0C1017]/65 to-[#0C1017]/30" />

        <div className="relative z-10 max-w-7xl w-full mx-auto px-6 py-7 lg:py-9">
          <div className="flex flex-wrap items-center gap-3 text-xs font-medium tracking-wide text-slate-300 mb-2">
            <span>Global Revolutionary Strategy</span>
            <span aria-hidden="true">·</span>
            <span>705 Provinces</span>
            <span aria-hidden="true">·</span>
            <span>197 Real Nations</span>
            <span aria-hidden="true">·</span>
            <span>Classic & Blitz Modes</span>
            <span aria-hidden="true">·</span>
            <span>Up to 4 Humans</span>
          </div>
          <h1
            className="text-5xl lg:text-6xl font-bold tracking-tight text-white max-w-2xl"
            style={{ fontFamily: 'var(--font-display)', textWrap: 'balance' }}
          >
            Vanguard: World Uprising
          </h1>
          <p className="mt-2.5 text-sm lg:text-base text-slate-300 max-w-3xl leading-relaxed">
            Wage a clandestine revolution in Classic Mode or command an entire country
            at double speed in Blitz Mode. Form alliances that answer your call to arms,
            navigate inter-AI wars, and compete across 4-human multiplayer.
          </p>
        </div>
      </div>

      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-7 space-y-7">
        {/* Mode + Players Selector Bar */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Classic vs Blitz */}
          <div className="lg:col-span-6 bg-[#121822] border border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-white">
                01. Select Campaign Ruleset
              </h2>
              <span className="text-xs text-slate-400">Classic or Blitz</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={Boolean(onlineLobby && onlineLobby.hostSeatId !== onlineSeatId)}
                onClick={() => {
                  setGameVariant('CLASSIC');
                  if (onlineLobby) onUpdateOnlineSettings({ gameVariant: 'CLASSIC' });
                }}
                className={`p-3.5 rounded-md border text-left transition-colors cursor-pointer ${
                  activeVariant === 'CLASSIC'
                    ? 'bg-[#171F2C] border-red-500/80 ring-1 ring-red-500/40'
                    : 'bg-[#0C1017] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  Classic Mode
                </div>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Start hidden as 1 underground cell. Standard 1× income and 1 province attack per staging ground.
                </p>
              </button>

              <button
                type="button"
                disabled={Boolean(onlineLobby && onlineLobby.hostSeatId !== onlineSeatId)}
                onClick={() => {
                  setGameVariant('BLITZ');
                  if (onlineLobby) onUpdateOnlineSettings({ gameVariant: 'BLITZ' });
                }}
                className={`p-3.5 rounded-md border text-left transition-colors cursor-pointer ${
                  activeVariant === 'BLITZ'
                    ? 'bg-[#171F2C] border-amber-500/80 ring-1 ring-amber-500/40'
                    : 'bg-[#0C1017] border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <Zap className="w-4 h-4 text-amber-400" />
                  Blitz Mode
                </div>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  Start owning an entire real country, gain <strong className="text-amber-300">2× Resources</strong>, and launch <strong className="text-amber-300">2× Attacks</strong> per turn.
                </p>
              </button>
            </div>
          </div>

          {/* Solo / Hotseat / Online */}
          <div className="lg:col-span-6 bg-[#121822] border border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-base font-semibold text-white">
                02. Players & Multiplayer
              </h2>
              <span className="text-xs text-slate-400">1–4 Human Commanders</span>
            </div>

            <div className="grid grid-cols-3 gap-2 p-1 bg-[#0C1017] border border-slate-800 rounded-md">
              <button
                type="button"
                onClick={() => {
                  if (onlineLobby) onLeaveOnlineRoom();
                  setMpMode('SOLO');
                  setEditingSeatIdx(0);
                }}
                className={`py-2 px-3 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  mpMode === 'SOLO'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Solo (1P)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onlineLobby) onLeaveOnlineRoom();
                  setMpMode('HOTSEAT');
                }}
                className={`py-2 px-3 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 ${
                  mpMode === 'HOTSEAT'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Hotseat (2–4P)
              </button>
              <button
                type="button"
                onClick={() => setMpMode('ONLINE')}
                className={`py-2 px-3 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap flex items-center justify-center gap-1.5 ${
                  mpMode === 'ONLINE'
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                Online Room
              </button>
            </div>

            {mpMode === 'HOTSEAT' && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-400">Human Commanders:</span>
                  <div className="flex items-center gap-1.5">
                    {[2, 3, 4].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => {
                          setHotseatCount(cnt);
                          if (editingSeatIdx >= cnt) setEditingSeatIdx(cnt - 1);
                        }}
                        className={`px-3 py-1 rounded text-xs font-mono cursor-pointer ${
                          hotseatCount === cnt
                            ? 'bg-slate-200 text-slate-900 font-semibold'
                            : 'bg-[#0C1017] border border-slate-800 text-slate-300'
                        }`}
                      >
                        {cnt}P
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {seatConfigs.slice(0, hotseatCount).map((seat, idx) => (
                    <button
                      key={seat.id}
                      type="button"
                      onClick={() => setEditingSeatIdx(idx)}
                      className={`p-2 rounded border text-left text-xs cursor-pointer transition-colors ${
                        currentSeatIdx === idx
                          ? 'bg-[#171F2C] border-slate-400'
                          : 'bg-[#0C1017] border-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-white truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: PLAYER_COLORS[idx] }}
                        />
                        <span className="truncate">{seat.name}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate mt-0.5">
                        {COMBAT_STYLES[seat.combatStyle].name.split(' ')[0]}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {mpMode === 'ONLINE' && (
              <div className="space-y-2.5">
                {onlineError && (
                  <div className="px-3 py-1.5 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-200">
                    {onlineError}
                  </div>
                )}

                {!authReady ? (
                  <div className="px-3 py-3 bg-[#0C1017] border border-slate-800 rounded text-xs text-slate-400">
                    Checking account session...
                  </div>
                ) : !authUser ? (
                  <div className="p-3 bg-[#0C1017] border border-slate-800 rounded flex flex-wrap items-center justify-between gap-3">
                    <div className="text-xs text-slate-300 leading-relaxed max-w-sm">
                      Sign in with Google to create or join shared cloud lobbies across any account or shared app link.
                    </div>
                    <button
                      type="button"
                      onClick={onGoogleSignIn}
                      className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      Sign in with Google
                    </button>
                  </div>
                ) : !onlineLobby ? (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400 bg-[#0C1017] border border-slate-800 rounded px-3 py-1.5">
                      <span className="truncate">
                        Signed in as{' '}
                        <strong className="text-slate-200">
                          {authUser.displayName || authUser.email || 'Commander'}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={onGoogleSignOut}
                        className="text-slate-400 hover:text-white flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        <LogOut className="w-3 h-3" />
                        Switch Account
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={onlineBusy}
                        onClick={() =>
                          onCreateOnlineRoom({
                            name: defaultOnlineName,
                            gameVariant,
                            scenarioId:
                              gameVariant === 'BLITZ' ? scenarioId : 'modern_2026',
                            difficulty,
                            originId: seatConfigs[0].originId,
                            startingNationId: seatConfigs[0].startingNationId,
                            combatStyle: seatConfigs[0].combatStyle,
                          })
                        }
                        className="py-2 px-3 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-45 text-white text-xs font-semibold rounded cursor-pointer"
                      >
                        {onlineBusy ? 'Creating...' : 'Create 4P Online Room'}
                      </button>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={joinCode}
                          onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                          placeholder="CODE"
                          maxLength={5}
                          className="w-24 bg-[#0C1017] border border-slate-700 rounded px-2.5 py-2 text-xs font-mono text-white uppercase"
                        />
                        <input
                          type="text"
                          value={joinName}
                          onChange={(e) => setJoinName(e.target.value)}
                          placeholder="Your Name"
                          className="flex-1 min-w-0 bg-[#0C1017] border border-slate-700 rounded px-2.5 py-2 text-xs text-white"
                        />
                        <button
                          type="button"
                          disabled={onlineBusy || joinCode.trim().length < 5}
                          onClick={() => onJoinOnlineRoom(joinCode, joinName)}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-medium rounded cursor-pointer"
                        >
                          {onlineBusy ? '...' : 'Join'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-[#0C1017] border border-slate-800 rounded space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-white font-semibold">
                          Room Code:{' '}
                          <span className="text-amber-300">{onlineLobby.code}</span>
                          {' · '}
                          {onlineLobby.seats.length}/4 Players
                        </span>
                        <button
                          type="button"
                          onClick={() => copyLobbyValue('code', onlineLobby.code)}
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                          title="Copy 5-character room code"
                        >
                          <Copy className="w-3 h-3" />
                          {copiedBanner === 'code' ? 'Copied' : 'Code'}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            copyLobbyValue(
                              'link',
                              `${window.location.origin}/?room=${onlineLobby.code}`
                            )
                          }
                          className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] flex items-center gap-1 cursor-pointer"
                          title="Copy direct invite URL"
                        >
                          <Link2 className="w-3 h-3" />
                          {copiedBanner === 'link' ? 'Copied' : 'Invite Link'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        {myOnlineSeat && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdateOnlineSeat({ ready: !myOnlineSeat.ready })
                            }
                            className={`px-2.5 py-1 rounded text-xs font-medium cursor-pointer ${
                              myOnlineSeat.ready
                                ? 'bg-emerald-700 text-white'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {myOnlineSeat.ready ? 'Ready' : 'Mark Ready'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={onLeaveOnlineRoom}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-red-700 text-slate-200 rounded text-xs cursor-pointer"
                        >
                          Leave
                        </button>
                      </div>
                    </div>

                    {myOnlineSeat && (
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-slate-400 whitespace-nowrap">
                          Your Callsign:
                        </label>
                        <input
                          type="text"
                          value={myOnlineSeat.name}
                          onChange={(e) => updateSeat({ name: e.target.value })}
                          maxLength={24}
                          className="flex-1 bg-[#121822] border border-slate-700 rounded px-2.5 py-1 text-xs text-white"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {onlineLobby.seats.map((s, idx) => (
                        <div
                          key={s.seatId}
                          className={`p-2 rounded border text-xs ${
                            s.seatId === onlineSeatId
                              ? 'bg-[#171F2C] border-slate-500'
                              : 'bg-[#101621] border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-semibold text-white truncate">
                            <span
                              className="w-2.5 h-2.5 rounded-sm shrink-0"
                              style={{ backgroundColor: PLAYER_COLORS[idx] }}
                            />
                            <span className="truncate">{s.name}</span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {s.ready ? 'Ready' : 'Configuring'}
                            {s.seatId === onlineLobby.hostSeatId ? ' · Host' : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {mpMode === 'SOLO' && (
              <div className="flex items-center gap-2 pt-1">
                <label className="text-xs text-slate-400 whitespace-nowrap">
                  Commander Name:
                </label>
                <input
                  type="text"
                  value={currentSeat.name}
                  onChange={(e) => updateSeat({ name: e.target.value })}
                  className="flex-1 bg-[#0C1017] border border-slate-800 rounded px-3 py-1.5 text-xs text-white"
                />
              </div>
            )}

            {mpMode === 'HOTSEAT' && (
              <div className="flex items-center gap-2">
                <label className="text-xs text-slate-400 whitespace-nowrap">
                  Editing Player {currentSeatIdx + 1} Name:
                </label>
                <input
                  type="text"
                  value={currentSeat.name}
                  onChange={(e) => updateSeat({ name: e.target.value })}
                  className="flex-1 bg-[#0C1017] border border-slate-800 rounded px-3 py-1.5 text-xs text-white"
                />
              </div>
            )}
          </div>
        </section>

        {/* Blitz Historical Scenario Selector */}
        {activeVariant === 'BLITZ' && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800 pb-2.5">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-400" />
                02B. Select Historical Theater Scenario
              </h2>
              <span className="text-xs text-slate-400">
                Reshapes borders, Great Power armies, navies, air wings & starting wars
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {SCENARIO_LIST.map((sc) => {
                const isSelected = activeScenario === sc.id;
                return (
                  <button
                    key={sc.id}
                    type="button"
                    disabled={Boolean(
                      onlineLobby && onlineLobby.hostSeatId !== onlineSeatId
                    )}
                    onClick={() => {
                      setScenarioId(sc.id);
                      if (onlineLobby) onUpdateOnlineSettings({ scenarioId: sc.id });
                      // Reset invalid seat countries to scenario featured defaults
                      setSeatConfigs((prev) =>
                        prev.map((seat, idx) => ({
                          ...seat,
                          startingNationId:
                            sc.featuredCountries[idx] ?? sc.featuredCountries[0],
                        }))
                      );
                    }}
                    className={`text-left p-4 rounded-lg border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#171F2C] border-amber-500/80 ring-1 ring-amber-500/40'
                        : 'bg-[#121822] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white">
                        {sc.name}
                      </span>
                      <span className="text-xs font-mono text-amber-300">
                        {sc.yearLabel}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-300 leading-relaxed">
                      {sc.summary}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Starting Territory Selection (Underground Cell in Classic OR Entire Country in Blitz) */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-800 pb-2.5">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              {activeVariant === 'BLITZ' ? (
                <>
                  <Globe className="w-4 h-4 text-amber-400" />
                  03. Choose Starting Country ({SCENARIOS[activeScenario]?.yearLabel} ·{' '}
                  {mpMode === 'ONLINE'
                    ? myOnlineSeat?.name ?? 'Your Seat'
                    : currentSeat.name}
                  )
                </>
              ) : (
                <>
                  03. Choose Underground Starting Cell (
                  {mpMode === 'ONLINE'
                    ? myOnlineSeat?.name ?? 'Your Seat'
                    : currentSeat.name}
                  )
                </>
              )}
            </h2>
            {activeVariant === 'BLITZ' ? (
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={countrySearch}
                  onChange={(e) => setCountrySearch(e.target.value)}
                  placeholder={`Search ${nationList.length} countries...`}
                  className="w-full bg-[#121822] border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-500"
                />
              </div>
            ) : (
              <span className="text-xs text-slate-400">
                Begin hidden inside a small state before launching your coup
              </span>
            )}
          </div>

          {activeVariant === 'BLITZ' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {filteredNations.map((nation) => {
                const active = editedNationId === nation.id;
                const taken = takenBlitzNations.has(nation.id);
                const provs = provinceCountByNation[nation.id] ?? 1;
                return (
                  <button
                    key={nation.id}
                    type="button"
                    disabled={taken}
                    onClick={() => updateSeat({ startingNationId: nation.id })}
                    className={`text-left p-3.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-35 ${
                      active
                        ? 'bg-[#171F2C] border-amber-500/80 ring-1 ring-amber-500/40'
                        : 'bg-[#121822] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-white truncate">
                        {nation.name}
                      </span>
                      <span
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: nation.color }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {getScenarioBlocLabel(activeScenario, nation.bloc2026)}
                    </div>
                    <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-300">
                      <span>{provs} Provinces</span>
                      <span>Tier {nation.gdpTier}</span>
                    </div>
                    {taken && (
                      <div className="text-[11px] text-amber-400 mt-1">
                        Claimed by another commander
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CAMPAIGN_ORIGINS.map((origin) => {
                const active = editedOriginId === origin.id;
                return (
                  <button
                    key={origin.id}
                    type="button"
                    onClick={() => updateSeat({ originId: origin.id })}
                    className={`text-left p-4 rounded-lg border transition-colors cursor-pointer flex flex-col justify-between ${
                      active
                        ? 'bg-[#171F2C] border-red-500/80 ring-1 ring-red-500/40'
                        : 'bg-[#121822] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {origin.name}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Host: {origin.hostCountryName}
                      </div>
                      <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                        {origin.summary}
                      </p>
                      <p className="mt-2 text-[11px] text-amber-400/90 leading-relaxed">
                        {origin.challengeNote}
                      </p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 grid grid-cols-2 gap-y-1 text-[11px] font-mono tabular-nums text-slate-300">
                      <span>Funds: ${origin.startingFunds}</span>
                      <span>Manpower: {origin.startingManpower}</span>
                      <span>Steel: {origin.startingMaterials}</span>
                      <span>Fighters: {origin.startingTroops}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Step 4: Combat Style + Launch & Saves */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-8 space-y-3">
            <div className="flex items-baseline justify-between border-b border-slate-800 pb-2.5">
              <h2 className="text-lg font-semibold text-white">
                04. Combat Style (
                {mpMode === 'ONLINE'
                  ? myOnlineSeat?.name ?? 'Your Seat'
                  : currentSeat.name}
                )
              </h2>
              <span className="text-xs text-slate-400">
                Locked for the campaign — upgrade specific pros via Doctrine
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(COMBAT_STYLES) as CombatStyleId[]).map((id) => {
                const style = COMBAT_STYLES[id];
                const active = editedCombatStyle === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => updateSeat({ combatStyle: id })}
                    className={`text-left p-4 rounded-lg border transition-colors cursor-pointer space-y-3 ${
                      active
                        ? 'bg-[#171F2C] border-red-500/80 ring-1 ring-red-500/40'
                        : 'bg-[#121822] border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {style.name}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{style.summary}</p>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      {style.pros.map((pro, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-1.5 text-emerald-300"
                        >
                          <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{pro}</span>
                        </div>
                      ))}
                      {style.cons.map((con, idx) => (
                        <div
                          key={idx}
                          className="flex items-start gap-1.5 text-amber-300/90"
                        >
                          <Minus className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{con}</span>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="lg:col-span-4 bg-[#121822] border border-slate-800 rounded-lg p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold text-white">
                05. Launch & Saves
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-2 p-1 bg-[#0C1017] rounded-md border border-slate-800">
                {(['Standard', 'Brutal'] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={Boolean(
                      onlineLobby && onlineLobby.hostSeatId !== onlineSeatId
                    )}
                    onClick={() => {
                      setDifficulty(d);
                      if (onlineLobby) onUpdateOnlineSettings({ difficulty: d });
                    }}
                    className={`py-2 px-3 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                      activeDifficulty === d
                        ? 'bg-red-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {d} Mode
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                {activeDifficulty === 'Standard'
                  ? 'Balanced concealment, resource scaling, and coalition pressure.'
                  : '25% less starting cash, +20% foreign garrisons, fierce backstabs.'}
              </p>
            </div>

            <div className="p-3 bg-[#0C1017] border border-slate-800 rounded text-xs text-slate-300 flex items-start gap-2">
              {activeVariant === 'BLITZ' ? (
                <>
                  <Flame className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Blitz Mode active: Start owning an entire nation, earn 2× Resources,
                    and strike 2× provinces per turn!
                  </span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Keep global Suspicion below 100% until your fighters outnumber the host
                    government—then launch your coup!
                  </span>
                </>
              )}
            </div>

            <div className="space-y-2.5 pt-1">
              {mpMode === 'ONLINE' ? (
                onlineLobby ? (
                  onlineLobby.hostSeatId === onlineSeatId ? (
                    <button
                      type="button"
                      onClick={onStartOnlineRoom}
                      className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer"
                    >
                      Launch Online Match ({onlineLobby.seats.length} Players)
                    </button>
                  ) : (
                    <div className="w-full py-3 px-4 bg-slate-800 text-slate-300 text-xs font-medium rounded-md text-center">
                      Waiting for Host to Launch Online Match...
                    </div>
                  )
                ) : (
                  <div className="w-full py-3 px-4 bg-slate-800/70 text-slate-400 text-xs rounded-md text-center">
                    Create or Join an Online Room above to begin
                  </div>
                )
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    onStartCampaign(
                      seatConfigs.slice(0, mpMode === 'HOTSEAT' ? hotseatCount : 1),
                      gameVariant,
                      difficulty,
                      mpMode,
                      gameVariant === 'BLITZ' ? scenarioId : 'modern_2026'
                    )
                  }
                  className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer"
                >
                  {mpMode === 'HOTSEAT'
                    ? `Start ${hotseatCount}-Player ${
                        gameVariant === 'BLITZ'
                          ? `Blitz (${SCENARIOS[scenarioId]?.yearLabel})`
                          : 'Classic'
                      }`
                    : `Start ${
                        gameVariant === 'BLITZ'
                          ? `Blitz (${SCENARIOS[scenarioId]?.yearLabel})`
                          : 'Classic'
                      } Campaign`}
                </button>
              )}

              {latestSave && (
                <button
                  type="button"
                  onClick={onContinueLatest}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded-md transition-colors cursor-pointer truncate"
                >
                  Continue: {latestSave.name} (T{latestSave.turn})
                </button>
              )}

              <button
                type="button"
                onClick={onOpenSaveManager}
                className="w-full py-2.5 px-4 bg-[#0C1017] hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
                Load / Manage Saves ({saveCount})
              </button>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};
