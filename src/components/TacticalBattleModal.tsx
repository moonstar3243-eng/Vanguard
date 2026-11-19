import React, { useMemo, useState } from 'react';
import { UNITS } from '../data/techAndBuildings';
import {
  advanceTacticalRound,
  autoResolveTacticalBattle,
  BATTLE_COLS,
  BATTLE_ROWS,
  checkBattleCompletion,
  executeTokenAttack,
  getAttackableTokens,
  getReachableTiles,
  previewTacticalAttack,
} from '../engine/battleEngine';
import {
  BattleTileType,
  GameState,
  PendingBattle,
} from '../types/game';
import { UnitLogo } from './UnitLogo';
import {
  Flag,
  Mountain,
  Play,
  Shield,
  SkipForward,
  Swords,
  Trees,
  Waves,
} from 'lucide-react';

interface TacticalBattleModalProps {
  state: GameState;
  battle: PendingBattle;
  onUpdateBattle: (next: PendingBattle) => void;
  onFinishBattle: (finalBattle: PendingBattle) => void;
}

const TILE_META: Record<
  BattleTileType,
  { label: string; bonus: string; bg: string; border: string }
> = {
  open: {
    label: 'Open',
    bonus: 'Armor +25% Atk',
    bg: 'bg-[#101621]',
    border: 'border-slate-800/80',
  },
  ridge: {
    label: 'Ridge',
    bonus: 'High Ground +25% Atk · +20% Def',
    bg: 'bg-[#1D1914]',
    border: 'border-amber-800/50',
  },
  cover: {
    label: 'Cover',
    bonus: '+26%–35% Def Cover',
    bg: 'bg-[#111D18]',
    border: 'border-emerald-800/50',
  },
  bunker: {
    label: 'Bunker',
    bonus: '+40% Def · Art +35% Atk',
    bg: 'bg-[#1A1F28]',
    border: 'border-slate-600/80',
  },
  chokepoint: {
    label: 'Pass',
    bonus: 'Slows Armor · +15% Dmg taken',
    bg: 'bg-[#0F1B24]',
    border: 'border-sky-800/50',
  },
};

const TileIcon: React.FC<{ type: BattleTileType }> = ({ type }) => {
  if (type === 'ridge') return <Mountain className="w-3 h-3 text-amber-500/75" />;
  if (type === 'cover') return <Trees className="w-3 h-3 text-emerald-500/75" />;
  if (type === 'bunker') return <Shield className="w-3 h-3 text-slate-400" />;
  if (type === 'chokepoint') return <Waves className="w-3 h-3 text-sky-500/75" />;
  return null;
};

export const TacticalBattleModal: React.FC<TacticalBattleModalProps> = ({
  state,
  battle,
  onUpdateBattle,
  onFinishBattle,
}) => {
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(() => {
    const first = battle.tokens.find((t) => t.side === 'player' && t.hp > 0);
    return first?.id ?? null;
  });
  const [hoveredEnemyId, setHoveredEnemyId] = useState<string | null>(null);

  const selectedToken = useMemo(
    () =>
      battle.tokens.find(
        (t) => t.id === selectedTokenId && t.hp > 0 && t.side === 'player'
      ) ?? null,
    [battle.tokens, selectedTokenId]
  );

  const reachableTiles = useMemo(() => {
    if (
      battle.phase !== 'COMBAT' ||
      !selectedToken ||
      selectedToken.hasMoved ||
      selectedToken.hasActed
    ) {
      return new Set<string>();
    }
    return getReachableTiles(battle, selectedToken);
  }, [battle, selectedToken]);

  const attackableEnemyIds = useMemo(() => {
    if (battle.phase !== 'COMBAT' || !selectedToken || selectedToken.hasActed) {
      return new Set<string>();
    }
    return new Set(getAttackableTokens(battle, selectedToken).map((t) => t.id));
  }, [battle, selectedToken]);

  const hoveredEnemy = useMemo(
    () => battle.tokens.find((t) => t.id === hoveredEnemyId && t.hp > 0) ?? null,
    [battle.tokens, hoveredEnemyId]
  );

  const attackPreview = useMemo(() => {
    if (
      battle.phase !== 'COMBAT' ||
      !selectedToken ||
      !hoveredEnemy ||
      !attackableEnemyIds.has(hoveredEnemy.id)
    ) {
      return null;
    }
    return previewTacticalAttack(battle, selectedToken, hoveredEnemy, state);
  }, [attackableEnemyIds, battle, hoveredEnemy, selectedToken, state]);

  const handleTileClick = (row: number, col: number) => {
    if (battle.phase === 'COMPLETE') return;
    const occupant = battle.tokens.find(
      (t) => t.hp > 0 && t.row === row && t.col === col
    );

    // 1. Deployment Phase: click player unit, then click col 0..1 to reposition or swap
    if (battle.phase === 'DEPLOY') {
      if (occupant && occupant.side === 'player') {
        setSelectedTokenId(occupant.id);
        return;
      }
      if (selectedToken && col <= 1) {
        if (occupant && occupant.side === 'enemy') return;
        const oldR = selectedToken.row;
        const oldC = selectedToken.col;
        const nextTokens = battle.tokens.map((t) => {
          if (t.id === selectedToken.id) return { ...t, row, col };
          if (occupant && t.id === occupant.id) return { ...t, row: oldR, col: oldC };
          return t;
        });
        onUpdateBattle({ ...battle, tokens: nextTokens });
      }
      return;
    }

    // 2. Combat Phase
    if (occupant) {
      if (occupant.side === 'player') {
        setSelectedTokenId(occupant.id);
        return;
      }
      if (
        occupant.side === 'enemy' &&
        selectedToken &&
        !selectedToken.hasActed &&
        attackableEnemyIds.has(occupant.id)
      ) {
        const next = executeTokenAttack(battle, selectedToken.id, occupant.id, state);
        onUpdateBattle(next);
        // Auto-select next ready player unit if current finished
        const nextReady = next.tokens.find(
          (t) => t.side === 'player' && t.hp > 0 && !t.hasActed
        );
        if (nextReady) setSelectedTokenId(nextReady.id);
      }
      return;
    }

    // Empty tile move
    if (
      selectedToken &&
      !selectedToken.hasMoved &&
      reachableTiles.has(`${row}_${col}`)
    ) {
      const nextTokens = battle.tokens.map((t) =>
        t.id === selectedToken.id ? { ...t, row, col, hasMoved: true } : t
      );
      onUpdateBattle({
        ...battle,
        tokens: nextTokens,
      });
    }
  };

  const handleStartCombat = () => {
    onUpdateBattle({
      ...battle,
      phase: 'COMBAT',
      combatLog: [
        'Engagement began! Move squads into cover/high ground or flank enemy lines.',
        ...battle.combatLog,
      ].slice(0, 14),
    });
  };

  const handleEndRound = () => {
    const next = advanceTacticalRound(battle, state);
    onUpdateBattle(next);
    const firstReady = next.tokens.find(
      (t) => t.side === 'player' && t.hp > 0 && !t.hasActed
    );
    if (firstReady) setSelectedTokenId(firstReady.id);
  };

  const handleAutoResolve = () => {
    const resolved = autoResolveTacticalBattle(battle, state);
    onUpdateBattle(resolved);
  };

  const handleRetreat = () => {
    const retreated: PendingBattle = checkBattleCompletion({
      ...battle,
      phase: 'COMPLETE',
      winner: 'retreat',
      combatLog: ['Ordered tactical withdrawal to preserve surviving forces.', ...battle.combatLog],
    });
    onFinishBattle({ ...retreated, phase: 'COMPLETE', winner: 'retreat' });
  };

  const readyPlayerCount = battle.tokens.filter(
    (t) => t.side === 'player' && t.hp > 0 && !t.hasActed
  ).length;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-3 lg:p-6">
      <div className="bg-[#111722] border border-slate-700 rounded-lg max-w-6xl w-full max-h-[94vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Top Engagement Header */}
        <header className="px-5 py-3.5 bg-[#0D121B] border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Swords className="w-4 h-4 text-red-400" />
              <span>
                Tactical Battle · {battle.toRegionName} ({battle.terrain})
              </span>
              <span aria-hidden="true">·</span>
              <span>vs {battle.defenderName}</span>
            </div>
            <h2
              className="text-xl lg:text-2xl font-bold text-white mt-0.5"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {battle.phase === 'DEPLOY'
                ? 'Deployment & Positioning'
                : battle.phase === 'COMPLETE'
                ? battle.winner === 'player'
                  ? `Victory — ${battle.toRegionName} Captured`
                  : `Engagement Ended — ${battle.defenderName} Held`
                : `Combat Round ${battle.round} of ${battle.maxRounds}`}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">

            {battle.phase === 'DEPLOY' && (
              <>
                <button
                  type="button"
                  onClick={handleAutoResolve}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded cursor-pointer"
                >
                  Auto-Resolve
                </button>
                <button
                  type="button"
                  onClick={handleStartCombat}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Start Battle
                </button>
              </>
            )}

            {battle.phase === 'COMBAT' && (
              <>
                <button
                  type="button"
                  onClick={handleRetreat}
                  className="px-3 py-2 bg-slate-800 hover:bg-amber-700 text-slate-200 text-xs font-medium rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Retreat
                </button>
                <button
                  type="button"
                  onClick={handleAutoResolve}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded cursor-pointer"
                >
                  Auto-Resolve
                </button>
                <button
                  type="button"
                  onClick={handleEndRound}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                  {readyPlayerCount === 0 ? 'Resolve Enemy Turn' : 'End Round'}
                </button>
              </>
            )}

            {battle.phase === 'COMPLETE' && (
              <button
                type="button"
                onClick={() => onFinishBattle(battle)}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded cursor-pointer"
              >
                Confirm Battle Outcome
              </button>
            )}
          </div>
        </header>

        {/* Body: Left 6x4 Grid + Right Tactical Sidebar */}
        <div className="flex-1 overflow-y-auto grid grid-cols-1 lg:grid-cols-12 min-h-0">
          <div className="lg:col-span-8 p-4 lg:p-6 bg-[#090D14] flex flex-col justify-between gap-4 border-b lg:border-b-0 lg:border-r border-slate-800">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                {battle.phase === 'DEPLOY'
                  ? 'Click one of your squads, then click any left-side tile (Cols 1–2) to position.'
                  : battle.phase === 'COMBAT'
                  ? 'Select a ready squad -> click blue tile to Move -> click red-outlined enemy to Attack.'
                  : 'Battle concluded. Click Confirm Battle Outcome to apply casualties.'}
              </span>
              <span className="font-mono text-slate-300">
                Ready Squads: {readyPlayerCount}
              </span>
            </div>

            {/* 6x4 Tactical Grid */}
            <div className="grid grid-cols-6 gap-2 max-w-3xl w-full mx-auto">
              {Array.from({ length: BATTLE_ROWS }).map((_, r) =>
                Array.from({ length: BATTLE_COLS }).map((__, c) => {
                  const tile = battle.tiles.find((t) => t.row === r && t.col === c)!;
                  const meta = TILE_META[tile.type];
                  const occupant = battle.tokens.find(
                    (t) => t.hp > 0 && t.row === r && t.col === c
                  );
                  const isDeployZone = battle.phase === 'DEPLOY' && c <= 1;
                  const isReachable = reachableTiles.has(`${r}_${c}`);
                  const isAttackTarget =
                    occupant && attackableEnemyIds.has(occupant.id);
                  const isSelected = occupant && occupant.id === selectedToken?.id;

                  return (
                    <button
                      key={`${r}_${c}`}
                      type="button"
                      onClick={() => handleTileClick(r, c)}
                      onMouseEnter={() =>
                        setHoveredEnemyId(
                          occupant && occupant.side === 'enemy' ? occupant.id : null
                        )
                      }
                      onMouseLeave={() => setHoveredEnemyId(null)}
                      title={`${meta.label}: ${meta.bonus}`}
                      className={`relative aspect-[1/0.92] rounded-md border p-1.5 flex flex-col justify-between text-left transition-all cursor-pointer ${
                        meta.bg
                      } ${
                        isSelected
                          ? 'border-white ring-2 ring-white/50'
                          : isAttackTarget
                          ? 'border-red-500 ring-2 ring-red-500/60 bg-red-950/30'
                          : isReachable
                          ? 'border-sky-400 ring-1 ring-sky-400/50 bg-sky-950/25'
                          : isDeployZone
                          ? 'border-dashed border-amber-500/50'
                          : meta.border
                      }`}
                    >
                      {/* Tile Header */}
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span className="text-[10px] font-medium text-slate-400 leading-none">
                          {meta.label}
                        </span>
                        <TileIcon type={tile.type} />
                      </div>

                      {/* Occupant Squad Token */}
                      {occupant ? (
                        <div
                          className={`mt-1 rounded p-1.5 border flex flex-col gap-1 ${
                            occupant.side === 'player'
                              ? occupant.hasActed && battle.phase === 'COMBAT'
                                ? 'bg-red-950/60 border-red-800/60 opacity-65'
                                : 'bg-red-900/75 border-red-500/80'
                              : 'bg-blue-950/80 border-blue-500/70'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 text-white">
                            <UnitLogo
                              type={occupant.unitType}
                              size="xs"
                              faction={occupant.side}
                            />
                            <span className="text-[10px] font-mono font-bold tabular-nums">
                              {occupant.count}
                            </span>
                          </div>
                          <div className="text-[10px] font-semibold text-white truncate leading-tight">
                            {occupant.label}
                          </div>
                          <div className="w-full h-1.5 bg-black/60 rounded overflow-hidden">
                            <div
                              className={`h-full ${
                                occupant.side === 'player' ? 'bg-emerald-400' : 'bg-sky-400'
                              }`}
                              style={{
                                width: `${Math.max(
                                  5,
                                  Math.round((occupant.hp / occupant.maxHp) * 100)
                                )}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex items-center justify-center">
                          {isReachable && (
                            <span className="w-2 h-2 rounded-full bg-sky-400/80" />
                          )}
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Compact Terrain Legend */}
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-[11px] text-slate-400 pt-2 border-t border-slate-800/80">
              <span><strong className="text-amber-300">Ridge:</strong> +25% Atk, +20% Def</span>
              <span><strong className="text-emerald-300">Cover:</strong> -26%/-35% Dmg</span>
              <span><strong className="text-slate-200">Bunker:</strong> -40% Dmg (Art +35%)</span>
              <span><strong className="text-sky-300">Pass:</strong> Slows Armor</span>
              <span><strong className="text-red-300">Flanking:</strong> Ally adj or rear +32%–45%</span>
            </div>
          </div>

          {/* Right Side Tactical Telemetry & Log */}
          <aside className="lg:col-span-4 p-5 space-y-5 overflow-y-auto bg-[#111722]">
            {selectedToken ? (
              <div className="p-4 bg-[#0C1017] border border-slate-800 rounded-md space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <UnitLogo
                      type={selectedToken.unitType}
                      size="sm"
                      faction="player"
                    />
                    <span>Your {selectedToken.label}</span>
                  </div>
                  <span className="text-xs font-mono text-emerald-400">
                    HP {selectedToken.hp}/{selectedToken.maxHp}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>
                    {selectedToken.branch} · {selectedToken.unitClass}
                  </span>
                </div>

                <div className="grid grid-cols-4 gap-2 text-xs font-mono tabular-nums text-slate-300 pt-1">
                  <div>
                    <div className="text-[10px] font-sans text-slate-500">Troops</div>
                    <div className="text-white font-semibold">{selectedToken.count}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-sans text-slate-500">Atk/Def</div>
                    <div className="text-white font-semibold">
                      {selectedToken.attack}/{selectedToken.defense}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-sans text-slate-500">Move</div>
                    <div className="text-white font-semibold">{selectedToken.move}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-sans text-slate-500">Range</div>
                    <div className="text-white font-semibold">{selectedToken.range}</div>
                  </div>
                </div>

                {UNITS[selectedToken.unitType] && (
                  <div className="text-[11px] space-y-0.5 pt-1 border-t border-slate-800/80">
                    <div className="text-emerald-300">
                      + {UNITS[selectedToken.unitType].strengths}
                    </div>
                    <div className="text-amber-300/90">
                      - {UNITS[selectedToken.unitType].weaknesses}
                    </div>
                  </div>
                )}

                <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                  Standing on:{' '}
                  <strong className="text-slate-200">
                    {
                      TILE_META[
                        battle.tiles.find(
                          (t) =>
                            t.row === selectedToken.row && t.col === selectedToken.col
                        )?.type ?? 'open'
                      ].label
                    }
                  </strong>{' '}
                  ·{' '}
                  {
                    TILE_META[
                      battle.tiles.find(
                        (t) =>
                          t.row === selectedToken.row && t.col === selectedToken.col
                      )?.type ?? 'open'
                    ].bonus
                  }
                </div>
              </div>
            ) : (
              <div className="p-4 bg-[#0C1017] border border-slate-800 rounded-md text-xs text-slate-400">
                Select one of your squads on the battlefield to move or attack.
              </div>
            )}

            {/* Attack Preview on Hover */}
            {attackPreview && hoveredEnemy && (
              <div className="p-4 bg-[#171216] border border-red-800/70 rounded-md space-y-2 text-xs">
                <div className="font-semibold text-red-300 flex items-center justify-between">
                  <span>Target: Enemy {hoveredEnemy.label}</span>
                  <span className="font-mono text-white">
                    HP {hoveredEnemy.hp}/{hoveredEnemy.maxHp}
                  </span>
                </div>
                <div className="flex justify-between font-mono tabular-nums text-slate-200">
                  <span>
                    Est. Hit:{' '}
                    <strong className="text-emerald-400">
                      -{attackPreview.damageToTarget} HP
                    </strong>
                  </span>
                  <span>
                    Return Fire:{' '}
                    <strong
                      className={
                        attackPreview.retaliationDamage > 0
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      }
                    >
                      {attackPreview.retaliationDamage > 0
                        ? `-${attackPreview.retaliationDamage} HP`
                        : 'None (Out of Range)'}
                    </strong>
                  </span>
                </div>
                {attackPreview.notes.length > 0 && (
                  <div className="pt-1.5 border-t border-red-900/50 space-y-1 text-[11px] text-amber-200">
                    {attackPreview.notes.map((n, i) => (
                      <div key={i}>• {n}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Combat Log */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300 border-b border-slate-800 pb-1.5">
                Tactical Feed
              </div>
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto text-xs text-slate-300 leading-relaxed">
                {battle.combatLog.map((line, i) => (
                  <div
                    key={i}
                    className={`py-1 border-b border-slate-800/50 last:border-b-0 ${
                      i === 0 ? 'text-white font-medium' : 'text-slate-400'
                    }`}
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};
