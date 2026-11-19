import { onAuthStateChanged, Unsubscribe as AuthUnsubscribe } from 'firebase/auth';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BattleModal } from './components/BattleModal';
import { DiplomacyView } from './components/DiplomacyView';
import { DoctrineView } from './components/DoctrineView';
import { EndScreen } from './components/EndScreen';
import { EventModal } from './components/EventModal';
import { IndustryView } from './components/IndustryView';
import { PoliticsView } from './components/PoliticsView';
import { ResearchView } from './components/ResearchView';
import { ResourceStrip } from './components/ResourceStrip';
import { SaveLoadModal } from './components/SaveLoadModal';
import { TacticalBattleModal } from './components/TacticalBattleModal';
import {
  AuthUserSummary,
  OnlineLobbyState,
  OnlineSeatInfo,
  TitleScreen,
} from './components/TitleScreen';
import { TopBar } from './components/TopBar';
import { WorldMapView } from './components/WorldMapView';
import {
  applyGameAction,
  calculateNetIncome,
  createMultiplayerGame,
  getActivePlayerId,
  getPlayerRegions,
} from './engine/gameEngine';
import { auth, signInWithGoogle, signOutUser } from './firebase';
import {
  createOnlineRoom,
  dispatchOnlineAction,
  findLatestJoinedRoom,
  joinOnlineRoom,
  leaveOnlineRoom,
  startOnlineRoom,
  subscribeToOnlineRoom,
  updateOnlineSeat,
  updateOnlineSettings,
} from './services/multiplayerService';
import {
  ActiveTab,
  CombatStyleId,
  Difficulty,
  GameAction,
  GameState,
  GameVariant,
  MultiplayerType,
  PlayerSetupConfig,
  SaveSlotMeta,
  ScenarioId,
} from './types/game';
import { soundFX } from './utils/audio';
import {
  listSaveSlots,
  loadFromSlot,
  saveAutosave,
} from './utils/saveSystem';
import { Shield, Users } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [saveSlots, setSaveSlots] = useState<SaveSlotMeta[]>(() =>
    listSaveSlots()
  );
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('MAP');
  const [selectedRegionId, setSelectedRegionId] = useState<string>('guatemala_1');
  const [muted, setMuted] = useState(false);

  // Cloud Firestore Online Multiplayer State
  const [authReady, setAuthReady] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUserSummary | null>(null);
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [onlineLobby, setOnlineLobby] = useState<OnlineLobbyState | null>(null);
  const [onlineSeatId, setOnlineSeatId] = useState<string | null>(null);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [onlineBusy, setOnlineBusy] = useState(false);
  const [initialJoinCode] = useState<string>(() => {
    const param = new URLSearchParams(window.location.search).get('room') ?? '';
    return param.trim().toUpperCase().slice(0, 5);
  });

  const onlineSyncRef = useRef<{
    state: GameState | null;
    revision: number;
    lobby: OnlineLobbyState | null;
    queue: Promise<void>;
  }>({
    state: null,
    revision: 0,
    lobby: null,
    queue: Promise.resolve(),
  });

  const refreshSaves = useCallback(() => {
    setSaveSlots(listSaveSlots());
  }, []);

  const focusPlayerRegion = useCallback((state: GameState) => {
    const activeId = getActivePlayerId(state);
    const owned = getPlayerRegions(state, activeId);
    const targetId =
      owned[0]?.id ?? state.cellRegionId ?? state.capitalRegionId ?? 'guatemala_1';
    setSelectedRegionId(targetId);
  }, []);

  // Persist Autosave whenever solo/hotseat game is active
  useEffect(() => {
    if (!gameState) return;
    if (
      gameState.mode === 'PLAYING' &&
      gameState.multiplayerType !== 'ONLINE'
    ) {
      saveAutosave(gameState);
      refreshSaves();
    }
  }, [gameState, refreshSaves]);

  // Listen to Firebase Auth state & auto-rejoin an active room if present
  useEffect(() => {
    const unsub: AuthUnsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser({
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
        });
        setAuthReady(true);
        if (!initialJoinCode) {
          void findLatestJoinedRoom(user.uid).then((found) => {
            if (found) {
              setActiveRoomCode((prev) => prev ?? found.code);
              setOnlineSeatId((prev) => prev ?? found.seatId);
            }
          });
        }
      } else {
        setAuthUser(null);
        setAuthReady(true);
        setActiveRoomCode(null);
        setOnlineLobby(null);
        setOnlineSeatId(null);
      }
    });
    return () => unsub();
  }, [initialJoinCode]);

  // Subscribe to active Firestore room & match state
  useEffect(() => {
    if (!activeRoomCode || !authUser) return;

    const unsub = subscribeToOnlineRoom(activeRoomCode, {
      onLobby: (lobby) => {
        if (!lobby) {
          setOnlineLobby(null);
          setActiveRoomCode(null);
          setOnlineSeatId(null);
          onlineSyncRef.current.lobby = null;
          return;
        }
        onlineSyncRef.current.lobby = lobby;
        setOnlineLobby(lobby);
        const mySeat = lobby.seats.find((s) => s.uid === authUser.uid);
        if (mySeat) {
          setOnlineSeatId(mySeat.seatId);
        }
      },
      onState: (nextState, revision) => {
        onlineSyncRef.current.state = nextState;
        onlineSyncRef.current.revision = revision;
        setGameState((prev) => {
          if (
            !prev ||
            prev.turn !== nextState.turn ||
            prev.activePlayerIndex !== nextState.activePlayerIndex
          ) {
            focusPlayerRegion(nextState);
          }
          return nextState;
        });
      },
      onError: (msg) => {
        setOnlineError(msg);
      },
    });

    return () => unsub();
  }, [activeRoomCode, authUser, focusPlayerRegion]);

  const handleGoogleSignIn = async () => {
    setOnlineError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setOnlineError(
        err instanceof Error ? err.message : 'Google Sign-In was cancelled or failed.'
      );
    }
  };

  const handleGoogleSignOut = async () => {
    if (activeRoomCode && authUser && onlineLobby && !onlineLobby.started) {
      await leaveOnlineRoom(activeRoomCode, authUser.uid).catch(() => {});
    }
    setActiveRoomCode(null);
    setOnlineLobby(null);
    setOnlineSeatId(null);
    setOnlineError(null);
    await signOutUser();
  };

  const handleCreateOnlineRoom = async (cfg: {
    name: string;
    gameVariant: GameVariant;
    scenarioId: ScenarioId;
    difficulty: Difficulty;
    originId: string;
    startingNationId?: string;
    combatStyle: CombatStyleId;
  }) => {
    if (!authUser) {
      setOnlineError('Please sign in with Google first.');
      return;
    }
    setOnlineError(null);
    setOnlineBusy(true);
    try {
      const res = await createOnlineRoom(authUser.uid, cfg);
      setOnlineSeatId(res.seatId);
      setActiveRoomCode(res.code);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Failed to create online lobby.');
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleJoinOnlineRoom = async (roomCode: string, name: string) => {
    if (!authUser) {
      setOnlineError('Please sign in with Google first.');
      return;
    }
    setOnlineError(null);
    setOnlineBusy(true);
    try {
      const res = await joinOnlineRoom(authUser.uid, roomCode, name);
      setOnlineSeatId(res.seatId);
      setActiveRoomCode(res.code);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : 'Failed to join lobby.');
    } finally {
      setOnlineBusy(false);
    }
  };

  const handleUpdateOnlineSeat = (patch: Partial<OnlineSeatInfo>) => {
    if (!activeRoomCode || !authUser) return;
    void updateOnlineSeat(activeRoomCode, authUser.uid, patch).catch((err) => {
      setOnlineError(err instanceof Error ? err.message : 'Failed to update seat.');
    });
  };

  const handleUpdateOnlineSettings = (patch: {
    gameVariant?: GameVariant;
    scenarioId?: ScenarioId;
    difficulty?: Difficulty;
  }) => {
    if (!activeRoomCode || !authUser) return;
    void updateOnlineSettings(activeRoomCode, authUser.uid, patch).catch((err) => {
      setOnlineError(err instanceof Error ? err.message : 'Failed to update settings.');
    });
  };

  const handleStartOnlineRoom = () => {
    if (!activeRoomCode || !authUser) return;
    setOnlineError(null);
    void startOnlineRoom(activeRoomCode, authUser.uid).catch((err) => {
      setOnlineError(err instanceof Error ? err.message : 'Failed to start match.');
    });
  };

  const handleLeaveOnlineRoom = () => {
    const code = activeRoomCode;
    const uid = authUser?.uid;
    const isWaiting = onlineLobby && !onlineLobby.started;
    setActiveRoomCode(null);
    setOnlineLobby(null);
    setOnlineSeatId(null);
    setOnlineError(null);
    onlineSyncRef.current = {
      state: null,
      revision: 0,
      lobby: null,
      queue: Promise.resolve(),
    };
    if (code && uid && isWaiting) {
      void leaveOnlineRoom(code, uid).catch(() => {});
    }
  };

  const netIncome = useMemo(
    () => (gameState ? calculateNetIncome(gameState) : null),
    [gameState]
  );

  const handleStartCampaign = (
    players: PlayerSetupConfig[],
    variant: GameVariant,
    difficulty: Difficulty,
    multiplayerType: MultiplayerType,
    scenarioId: ScenarioId = 'modern_2026'
  ) => {
    soundFX.playClick();
    const fresh = createMultiplayerGame(
      players,
      variant,
      difficulty,
      multiplayerType,
      undefined,
      scenarioId
    );
    setGameState(fresh);
    focusPlayerRegion(fresh);
    setActiveTab('MAP');
  };

  const handleContinueLatest = () => {
    const latest = saveSlots[0];
    if (!latest) return;
    const loaded = loadFromSlot(latest.id);
    if (!loaded) {
      refreshSaves();
      return;
    }
    soundFX.playClick();
    setGameState(loaded);
    focusPlayerRegion(loaded);
    setActiveTab('MAP');
  };

  const handleLoadState = (loaded: GameState) => {
    soundFX.playClick();
    if (loaded.multiplayerType === 'ONLINE') {
      loaded = { ...loaded, multiplayerType: 'HOTSEAT' };
    }
    setGameState(loaded);
    focusPlayerRegion(loaded);
    setActiveTab('MAP');
    refreshSaves();
  };

  const handleToggleMute = () => {
    const next = !muted;
    soundFX.muted = next;
    setMuted(next);
  };

  const handleResetToMenu = () => {
    soundFX.playClick();
    handleLeaveOnlineRoom();
    setGameState(null);
    refreshSaves();
  };

  const activePlayerId = gameState ? getActivePlayerId(gameState) : 'player';
  const isOnlineMatch = gameState?.multiplayerType === 'ONLINE';
  const isMyOnlineTurn =
    !isOnlineMatch || (Boolean(onlineSeatId) && activePlayerId === onlineSeatId);

  const playActionSfx = (action: GameAction, next: GameState) => {
    if (action.type === 'END_TURN') {
      if (next.mode === 'VICTORY') {
        soundFX.playVictory();
      } else if (next.activeEvent || next.lastBattle?.playerWon === false) {
        soundFX.playAlert();
      } else {
        soundFX.playClick();
      }
    } else if (action.type === 'FINISH_BATTLE') {
      if (next.mode === 'VICTORY') {
        soundFX.playVictory();
      } else if (action.battle.winner === 'player') {
        soundFX.playBattleWin();
      } else {
        soundFX.playBattleLoss();
      }
    } else if (
      action.type === 'UNLOCK_TECH' ||
      action.type === 'UNLOCK_DOCTRINE' ||
      action.type === 'RESEARCH_UNIT'
    ) {
      soundFX.playResearch();
    } else if (action.type === 'RECRUIT_UNIT' || action.type === 'BUILD_STRUCTURE' || action.type === 'BORROW_NATION') {
      soundFX.playBuild();
    } else if (
      action.type === 'START_ATTACK' ||
      action.type === 'LAUNCH_UPRISING' ||
      action.type === 'DECLARE_WAR' ||
      action.type === 'DECLARE_WAR_HUMAN' ||
      action.type === 'COVERT_OP' ||
      action.type === 'DEFAULT_LOAN'
    ) {
      soundFX.playAlert();
    } else {
      soundFX.playClick();
    }
  };

  const dispatchAction = (action: GameAction) => {
    if (!gameState) return;

    if (isOnlineMatch) {
      if (!isMyOnlineTurn || !activeRoomCode || !authUser) return;
      const roomCodeSnapshot = activeRoomCode;
      const uidSnapshot = authUser.uid;

      onlineSyncRef.current.queue = onlineSyncRef.current.queue
        .then(async () => {
          const curLobby = onlineSyncRef.current.lobby;
          const curState = onlineSyncRef.current.state;
          const curRev = onlineSyncRef.current.revision;
          if (!curLobby || !curState || curLobby.activeUid !== uidSnapshot) return;

          const optimisticNext = applyGameAction(curState, action);
          playActionSfx(action, optimisticNext);
          setGameState(optimisticNext);

          try {
            const committed = await dispatchOnlineAction(
              roomCodeSnapshot,
              uidSnapshot,
              curLobby,
              curState,
              curRev,
              action
            );
            onlineSyncRef.current.state = committed;
            onlineSyncRef.current.revision = curRev + 1;
            if (committed.activePlayerIndex !== curState.activePlayerIndex) {
              focusPlayerRegion(committed);
            }
          } catch (err) {
            onlineSyncRef.current.state = curState;
            setGameState(curState);
            setOnlineError(
              err instanceof Error ? err.message : 'Failed to sync action to room.'
            );
          }
        })
        .catch(() => {});
      return;
    }

    const prevIdx = gameState.activePlayerIndex;
    const next = applyGameAction(gameState, action);
    playActionSfx(action, next);

    setGameState(next);
    if (next.activePlayerIndex !== prevIdx) {
      focusPlayerRegion(next);
    }
  };

  if (!gameState) {
    return (
      <>
        <TitleScreen
          latestSave={saveSlots[0] ?? null}
          saveCount={saveSlots.length}
          onStartCampaign={handleStartCampaign}
          onContinueLatest={handleContinueLatest}
          onOpenSaveManager={() => {
            refreshSaves();
            setShowSaveModal(true);
          }}
          onlineLobby={onlineLobby}
          onlineSeatId={onlineSeatId}
          onlineError={onlineError}
          onlineBusy={onlineBusy}
          authReady={authReady}
          authUser={authUser}
          initialJoinCode={initialJoinCode}
          onGoogleSignIn={handleGoogleSignIn}
          onGoogleSignOut={handleGoogleSignOut}
          onCreateOnlineRoom={handleCreateOnlineRoom}
          onJoinOnlineRoom={handleJoinOnlineRoom}
          onUpdateOnlineSeat={handleUpdateOnlineSeat}
          onUpdateOnlineSettings={handleUpdateOnlineSettings}
          onStartOnlineRoom={handleStartOnlineRoom}
          onLeaveOnlineRoom={handleLeaveOnlineRoom}
        />
        {showSaveModal && (
          <SaveLoadModal
            currentState={null}
            onLoadState={handleLoadState}
            onClose={() => {
              refreshSaves();
              setShowSaveModal(false);
            }}
          />
        )}
      </>
    );
  }

  if (gameState.mode === 'VICTORY' || gameState.mode === 'DEFEAT') {
    return <EndScreen state={gameState} onPlayAgain={handleResetToMenu} />;
  }

  const activePlayer = gameState.players?.[gameState.activePlayerIndex];

  return (
    <div className="h-screen flex flex-col bg-[#0C1017] text-[#EEF2F6] overflow-hidden">
      <TopBar
        activeTab={activeTab}
        onSelectTab={(tab) => {
          soundFX.playClick();
          setActiveTab(tab);
        }}
        onEndTurn={() => dispatchAction({ type: 'END_TURN' })}
        disabledEndTurn={
          Boolean(gameState.activeEvent || gameState.pendingBattle) ||
          !isMyOnlineTurn
        }
        endTurnLabel={
          isOnlineMatch && !isMyOnlineTurn
            ? `${activePlayer?.name ?? 'Ally'}'s Turn`
            : 'End Turn'
        }
      />

      {netIncome && (
        <ResourceStrip
          state={gameState}
          net={netIncome}
          muted={muted}
          onToggleMute={handleToggleMute}
          onOpenSaves={() => {
            refreshSaves();
            setShowSaveModal(true);
          }}
          onResetGame={handleResetToMenu}
        />
      )}

      {/* Online Turn Lock Banner */}
      {isOnlineMatch && !isMyOnlineTurn && activePlayer && (
        <div className="bg-[#141D2B] border-b border-slate-800 px-6 py-2 text-xs text-slate-200 flex items-center justify-between gap-4 shrink-0">
          <span className="flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-sky-400" />
            <span>
              Room <strong className="font-mono">{gameState.roomCode}</strong> · Waiting for{' '}
              <strong style={{ color: activePlayer.color }}>
                {activePlayer.name}
              </strong>{' '}
              to finish their turn.
            </span>
          </span>
          <span className="text-slate-400 font-mono">Spectating Live Map</span>
        </div>
      )}

      {/* Local Hotseat Handoff Screen */}
      {gameState.awaitingHandoff && activePlayer ? (
        <div className="flex-1 flex items-center justify-center p-6 bg-[#090D14]">
          <div className="bg-[#121822] border border-slate-700/80 rounded-lg max-w-md w-full p-7 text-center space-y-5">
            <div className="flex justify-center">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center border border-slate-700"
                style={{ backgroundColor: `${activePlayer.color}25` }}
              >
                <Shield
                  className="w-6 h-6"
                  style={{ color: activePlayer.color }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-mono text-slate-400">
                Turn {gameState.turn} · Hotseat Handoff
              </div>
              <h2
                className="text-2xl font-bold text-white"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Pass Command to {activePlayer.name}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ensure other human commanders look away before revealing your
                resources, alliances, and tactical plans.
              </p>
            </div>
            <button
              type="button"
              onClick={() => dispatchAction({ type: 'CONFIRM_HANDOFF' })}
              className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-md transition-colors cursor-pointer"
            >
              Assume Command ({activePlayer.name})
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`flex-1 flex flex-col min-h-0 ${
            isOnlineMatch && !isMyOnlineTurn ? 'pointer-events-none opacity-85' : ''
          }`}
        >
          {activeTab === 'MAP' && (
            <WorldMapView
              state={gameState}
              selectedRegionId={selectedRegionId}
              onSelectRegion={(id) => {
                soundFX.playClick();
                setSelectedRegionId(id);
              }}
              onRecruitUnit={(regionId, unitType) =>
                dispatchAction({ type: 'RECRUIT_UNIT', regionId, unitType })
              }
              onBuild={(regionId, buildingType) =>
                dispatchAction({ type: 'BUILD_STRUCTURE', regionId, buildingType })
              }
              onPacify={(regionId) =>
                dispatchAction({ type: 'PACIFY_REGION', regionId })
              }
              onAttack={(fromId, toId, commitFraction) =>
                dispatchAction({
                  type: 'START_ATTACK',
                  fromId,
                  toId,
                  commitFraction,
                })
              }
              onTransfer={(fromId, toId, fraction) =>
                dispatchAction({
                  type: 'TRANSFER_TROOPS',
                  fromId,
                  toId,
                  fraction,
                })
              }
              onCovertOp={(targetId, op) =>
                dispatchAction({ type: 'COVERT_OP', targetId, op })
              }
              onLaunchUprising={() => dispatchAction({ type: 'LAUNCH_UPRISING' })}
            />
          )}

          {activeTab === 'INDUSTRY' && netIncome && (
            <IndustryView
              state={gameState}
              net={netIncome}
              onSetTaxPolicy={(policy) =>
                dispatchAction({ type: 'SET_TAX_POLICY', policy })
              }
              onTakeLoan={() => dispatchAction({ type: 'TAKE_EMERGENCY_LOAN' })}
              onBuild={(regionId, buildingType) =>
                dispatchAction({ type: 'BUILD_STRUCTURE', regionId, buildingType })
              }
              onPacify={(regionId) =>
                dispatchAction({ type: 'PACIFY_REGION', regionId })
              }
              onRepayLoan={(loanId) =>
                dispatchAction({ type: 'REPAY_LOAN', loanId })
              }
              onDefaultLoan={(loanId) =>
                dispatchAction({ type: 'DEFAULT_LOAN', loanId })
              }
            />
          )}

          {activeTab === 'RESEARCH' && (
            <ResearchView
              state={gameState}
              onUnlockTech={(techId) =>
                dispatchAction({ type: 'UNLOCK_TECH', techId })
              }
              onResearchUnit={(unitType) =>
                dispatchAction({ type: 'RESEARCH_UNIT', unitType })
              }
            />
          )}

          {activeTab === 'DOCTRINE' && (
            <DoctrineView
              state={gameState}
              onUnlockDoctrine={(upgradeId) =>
                dispatchAction({ type: 'UNLOCK_DOCTRINE', upgradeId })
              }
            />
          )}

          {activeTab === 'POLITICS' && (
            <PoliticsView
              state={gameState}
              onSwitchIdeology={(ideologyId) =>
                dispatchAction({ type: 'SWITCH_IDEOLOGY', ideologyId })
              }
              onTogglePolicy={(policyId) =>
                dispatchAction({ type: 'TOGGLE_POLICY', policyId })
              }
              onAppeaseFaction={(pillar) =>
                dispatchAction({ type: 'APPEASE_FACTION', pillar })
              }
            />
          )}

          {activeTab === 'DIPLOMACY' && (
            <DiplomacyView
              state={gameState}
              onSignPact={(nationId) =>
                dispatchAction({ type: 'SIGN_PACT', nationId })
              }
              onFormAlliance={(nationId) =>
                dispatchAction({ type: 'FORM_ALLIANCE', nationId })
              }
              onDeclareWar={(nationId) =>
                dispatchAction({ type: 'DECLARE_WAR', nationId })
              }
              onToggleHumanAlly={(targetPlayerId) =>
                dispatchAction({ type: 'TOGGLE_HUMAN_ALLY', targetPlayerId })
              }
              onDeclareWarHuman={(targetPlayerId) =>
                dispatchAction({ type: 'DECLARE_WAR_HUMAN', targetPlayerId })
              }
              onBorrow={(nationId) =>
                dispatchAction({ type: 'BORROW_NATION', nationId })
              }
              onRepayLoan={(loanId) =>
                dispatchAction({ type: 'REPAY_LOAN', loanId })
              }
              onDefaultLoan={(loanId) =>
                dispatchAction({ type: 'DEFAULT_LOAN', loanId })
              }
              onCourtNation={(nationId) =>
                dispatchAction({ type: 'COURT_NATION', nationId })
              }
            />
          )}
        </div>
      )}

      {gameState.pendingBattle && isMyOnlineTurn && !gameState.awaitingHandoff && (
        <TacticalBattleModal
          state={gameState}
          battle={gameState.pendingBattle}
          onUpdateBattle={(battle) =>
            dispatchAction({ type: 'UPDATE_BATTLE', battle })
          }
          onFinishBattle={(battle) =>
            dispatchAction({ type: 'FINISH_BATTLE', battle })
          }
        />
      )}

      {!gameState.pendingBattle &&
        gameState.activeEvent &&
        isMyOnlineTurn &&
        !gameState.awaitingHandoff && (
          <EventModal
            event={gameState.activeEvent}
            onChoose={(choice) =>
              dispatchAction({ type: 'EVENT_CHOICE', choice })
            }
          />
        )}

      {!gameState.pendingBattle &&
        !gameState.activeEvent &&
        gameState.lastBattle &&
        isMyOnlineTurn &&
        !gameState.awaitingHandoff && (
          <BattleModal
            report={gameState.lastBattle}
            onClose={() => dispatchAction({ type: 'CLOSE_BATTLE_REPORT' })}
          />
        )}

      {showSaveModal && (
        <SaveLoadModal
          currentState={gameState}
          onLoadState={handleLoadState}
          onClose={() => {
            refreshSaves();
            setShowSaveModal(false);
          }}
        />
      )}
    </div>
  );
}
