import React, { useMemo, useRef, useState } from 'react';
import { getScenarioBlocLabel, SCENARIOS } from '../data/scenarios';
import { BUILDINGS, getUnitEffectiveStats, UNITS } from '../data/techAndBuildings';
import { SEA_LANES, UNIT_BRANCH_ORDER } from '../data/worldMap';
import { sumUnits } from '../engine/battleEngine';
import {
  estimateCombatOdds,
  getActivePlayerId,
  getBuildingCost,
  getCovertOpCost,
  getMaxAttacksPerRegion,
  getOwnerColor,
  getOwnerDisplayName,
  getPlayerRegions,
  getUnitRecruitCost,
  isHumanOwner,
  splitUnitsByFraction,
} from '../engine/gameEngine';
import { BuildingType, GameState, Region, UnitBranch, UnitComposition, UnitType } from '../types/game';
import {
  renderLogoFrame,
  renderUnitInsigniaGlyph,
  UNIT_LOGO_PALETTES,
  UnitLogo,
} from './UnitLogo';
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  Crosshair,
  Eye,
  EyeOff,
  Flame,
  LocateFixed,
  Maximize2,
  Shield,
  Swords,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface WorldMapViewProps {
  state: GameState;
  selectedRegionId: string;
  onSelectRegion: (id: string) => void;
  onRecruitUnit: (regionId: string, unitType: UnitType) => void;
  onBuild: (regionId: string, bType: BuildingType) => void;
  onPacify: (regionId: string) => void;
  onAttack: (fromId: string, toId: string, commitFraction: number) => void;
  onTransfer: (fromId: string, toId: string, fraction: number) => void;
  onCovertOp: (targetId: string, op: 'sabotage' | 'incite') => void;
  onLaunchUprising: () => void;
}

const MAP_W = 1200;
const MAP_H = 580;

const getDominantUnitType = (units: Partial<UnitComposition> | undefined): UnitType => {
  let best: UnitType = 'riflemen';
  let bestCount = -1;
  if (!units) return best;
  for (const [k, val] of Object.entries(units)) {
    const count = val ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = k as UnitType;
    }
  }
  return best;
};

const UnitBadgeIcon: React.FC<{ type: UnitType; className?: string }> = ({
  type,
  className = 'w-4 h-4',
}) => <UnitLogo type={type} size="xs" className={className} />;

export const WorldMapView: React.FC<WorldMapViewProps> = ({
  state,
  selectedRegionId,
  onSelectRegion,
  onRecruitUnit,
  onBuild,
  onPacify,
  onAttack,
  onTransfer,
  onCovertOp,
  onLaunchUprising,
}) => {
  const [attackSourceId, setAttackSourceId] = useState<string>('');
  const [sendFraction, setSendFraction] = useState<number>(0.75);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeBranch, setActiveBranch] = useState<UnitBranch>('Army');

  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({ active: false, moved: false, startX: 0, startY: 0, origX: 0, origY: 0 });

  const activePlayerId = getActivePlayerId(state);
  const allRegions = useMemo(() => Object.values(state.regions), [state.regions]);
  const selected = state.regions[selectedRegionId] ?? allRegions[0];
  const isPlayerOwned = selected.ownerId === activePlayerId;
  const isCellRegion = selected.id === state.cellRegionId;
  const playerRegions = useMemo(
    () => getPlayerRegions(state, activePlayerId),
    [state, activePlayerId]
  );
  const playerRegionCount = playerRegions.length;
  const isUndergroundCellView =
    (state.phase === 'UNDERGROUND' || playerRegionCount === 0) &&
    isCellRegion &&
    !isPlayerOwned;

  const selectedNation =
    !isHumanOwner(state, selected.ownerId) && selected.ownerId !== 'rebels'
      ? state.nations[selected.ownerId] ?? null
      : null;

  const ownerLabel = useMemo(() => {
    if (selected.ownerId === activePlayerId) return 'Your Territory';
    return getOwnerDisplayName(state, selected.ownerId);
  }, [selected.ownerId, activePlayerId, state]);

  const ownerColor = (ownerId: string) => getOwnerColor(state, ownerId);

  const maxAttacks = getMaxAttacksPerRegion(state);

  const adjacentPlayerRegions = useMemo(() => {
    return selected.adjacentIds
      .map((id) => state.regions[id])
      .filter(
        (r): r is Region =>
          Boolean(r && r.ownerId === activePlayerId && r.troops > 1)
      );
  }, [selected, state.regions, activePlayerId]);

  const activeSource = useMemo(() => {
    if (
      attackSourceId &&
      adjacentPlayerRegions.some((r) => r.id === attackSourceId)
    ) {
      return state.regions[attackSourceId];
    }
    return adjacentPlayerRegions[0] ?? null;
  }, [attackSourceId, adjacentPlayerRegions, state.regions]);

  const committedUnits = useMemo(() => {
    if (!activeSource) return null;
    return splitUnitsByFraction(activeSource.units, sendFraction);
  }, [activeSource, sendFraction]);

  const troopsToCommit = committedUnits ? sumUnits(committedUnits) : 0;

  const combatPreview = useMemo(() => {
    if (isUndergroundCellView) {
      return estimateCombatOdds(state, selected, state.undergroundUnits);
    }
    if (!activeSource || isPlayerOwned || !committedUnits || troopsToCommit < 1) {
      return null;
    }
    return estimateCombatOdds(state, selected, committedUnits);
  }, [
    activeSource,
    committedUnits,
    isPlayerOwned,
    isUndergroundCellView,
    selected,
    state,
    troopsToCommit,
  ]);

  const bordersPlayer = selected.adjacentIds.some(
    (id) => state.regions[id]?.ownerId === activePlayerId
  );

  const sabotageCost = getCovertOpCost(state, 'sabotage');
  const inciteCost = getCovertOpCost(state, 'incite');

  const clampPan = (px: number, py: number, z: number) => {
    const maxX = Math.max(0, (MAP_W - MAP_W / z) / 2 + 40);
    const maxY = Math.max(0, (MAP_H - MAP_H / z) / 2 + 30);
    return {
      x: Math.max(-maxX, Math.min(maxX, px)),
      y: Math.max(-maxY, Math.min(maxY, py)),
    };
  };

  const adjustZoom = (delta: number) => {
    setZoom((prev) => {
      const next = Math.max(1, Math.min(8, Number((prev + delta).toFixed(2))));
      if (next <= 1) {
        setPan({ x: 0, y: 0 });
      } else {
        setPan((p) => clampPan(p.x, p.y, next));
      }
      return next;
    });
  };

  const focusOnRegion = (targetRegion: Region | undefined, targetZoom = 3.2) => {
    if (!targetRegion) return;
    const z = Math.max(zoom, targetZoom);
    const desiredPan = clampPan(
      MAP_W / 2 - targetRegion.labelPos[0],
      MAP_H / 2 - targetRegion.labelPos[1],
      z
    );
    setZoom(z);
    setPan(desiredPan);
    onSelectRegion(targetRegion.id);
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    draggingRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!draggingRef.current.active) return;
    const dx = e.clientX - draggingRef.current.startX;
    const dy = e.clientY - draggingRef.current.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      draggingRef.current.moved = true;
    }
    if (zoom > 1) {
      const rect = svgRef.current?.getBoundingClientRect();
      const vw = MAP_W / zoom;
      const vh = MAP_H / zoom;
      const scaleX = rect && rect.width > 0 ? vw / rect.width : 1 / zoom;
      const scaleY = rect && rect.height > 0 ? vh / rect.height : 1 / zoom;
      setPan(
        clampPan(
          draggingRef.current.origX + dx * scaleX,
          draggingRef.current.origY + dy * scaleY,
          zoom
        )
      );
    }
  };

  const handleMouseUp = () => {
    draggingRef.current.active = false;
  };

  const viewWidth = MAP_W / zoom;
  const viewHeight = MAP_H / zoom;
  const viewX = (MAP_W - viewWidth) / 2 - pan.x;
  const viewY = (MAP_H - viewHeight) / 2 - pan.y;

  const hoveredRegion = hoveredId ? state.regions[hoveredId] : null;
  const hoveredNation =
    hoveredRegion &&
    !isHumanOwner(state, hoveredRegion.ownerId) &&
    hoveredRegion.ownerId !== 'rebels'
      ? state.nations[hoveredRegion.ownerId]
      : null;

  const labelScale = 1 / Math.pow(zoom, 0.78);
  const homeFocusRegion =
    playerRegions[0] ?? state.regions[state.cellRegionId] ?? selected;

  const displayedUnits = isUndergroundCellView
    ? state.undergroundUnits
    : selected.units;

  const renderRecruitButtons = (isCell: boolean) => {
    const branchGroup =
      UNIT_BRANCH_ORDER.find((b) => b.branch === activeBranch) ??
      UNIT_BRANCH_ORDER[0];
    const isCoastal = selected.terrain === 'Coastal';

    return (
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            {isCell ? 'Smuggle Underground Units' : 'Recruit Military Units'}
          </h3>
          <div className="flex items-center gap-1 bg-[#0C1017] border border-slate-800 rounded p-0.5 text-[11px]">
            {UNIT_BRANCH_ORDER.map((grp) => (
              <button
                key={grp.branch}
                type="button"
                onClick={() => setActiveBranch(grp.branch)}
                className={`px-2 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                  activeBranch === grp.branch
                    ? 'bg-red-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {grp.branch === 'Air Force' ? 'Air' : grp.branch}
              </button>
            ))}
          </div>
        </div>

        {activeBranch === 'Navy' && !isCoastal && !isCell && (
          <div className="text-[11px] text-amber-400 bg-[#0C1017] border border-amber-900/50 rounded px-2.5 py-1.5">
            Inland province: Select a Coastal province to commission warships.
          </div>
        )}
        {isCell && activeBranch !== 'Army' && (
          <div className="text-[11px] text-amber-400 bg-[#0C1017] border border-amber-900/50 rounded px-2.5 py-1.5">
            Underground cells can only operate Army squads. Launch your coup to deploy{' '}
            {activeBranch}.
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {branchGroup.types.map((ut) => {
            const def = UNITS[ut];
            const unitLevel = state.unitLevels?.[ut] ?? 1;
            const lockedTech = unitLevel < 1;
            const eff = getUnitEffectiveStats(ut, Math.max(1, unitLevel));
            const cost = getUnitRecruitCost(state, ut);
            const blockedPhase = def.requiresExposed && state.phase === 'UNDERGROUND';
            const blockedCoastal = def.requiresCoastal && !isCoastal;
            const hasMp = (state.resources.manpower ?? 0) >= cost.manpower;
            const canAfford =
              !lockedTech &&
              !blockedPhase &&
              !blockedCoastal &&
              hasMp &&
              state.resources.materials >= cost.materials &&
              state.resources.energy >= cost.energy &&
              state.resources.funds - cost.funds >= -150;

            return (
              <button
                key={ut}
                type="button"
                onClick={() => onRecruitUnit(selected.id, ut)}
                disabled={!canAfford}
                title={`${def.unitClass} · ${eff.designation} (Atk ${eff.attack} / Def ${eff.defense}) · ${def.strengths}`}
                className="py-2 px-2.5 bg-slate-800/90 hover:bg-slate-700 disabled:opacity-35 text-white text-xs rounded text-left cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between gap-1 font-medium">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <UnitBadgeIcon type={ut} />
                    <span className="truncate">
                      +{cost.count} {def.shortName}
                    </span>
                  </span>
                  <span
                    className={`text-[10px] font-mono shrink-0 ${
                      lockedTech ? 'text-amber-400' : 'text-teal-300'
                    }`}
                  >
                    {lockedTech ? 'Locked (Tech)' : `Lv.${unitLevel}`}
                  </span>
                </div>
                <div className="text-[10px] text-slate-300 font-mono mt-0.5">
                  {cost.manpower}MP · ${cost.funds} · {cost.materials}St
                  {cost.energy > 0 ? ` · ${cost.energy}Fl` : ''} · {eff.attack}A/{eff.defense}D
                </div>
                <div className="text-[10px] text-emerald-300/85 truncate mt-0.5">
                  {lockedTech
                    ? 'Research Lv.1 in Research Tab'
                    : blockedPhase
                    ? 'Requires Exposed Regime'
                    : blockedCoastal
                    ? 'Requires Coastal Port'
                    : !hasMp
                    ? 'Need Manpower'
                    : def.strengths}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 grid grid-cols-1 xl:grid-cols-12 min-h-0">
      {/* Left/Center: 197-Country / 705-Province Organic Natural Earth Map */}
      <div className="xl:col-span-8 bg-[#090D14] relative flex flex-col border-b xl:border-b-0 xl:border-r border-slate-800 min-h-[420px]">
        <div className="px-5 py-2.5 bg-[#0E141D] border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-300">
          <div className="flex flex-wrap items-center gap-4">
            {state.players && state.players.length > 1 ? (
              state.players.map((p) => (
                <span
                  key={p.id}
                  className={`flex items-center gap-1.5 ${
                    p.id === activePlayerId ? 'text-white font-semibold' : 'text-slate-400'
                  } ${p.eliminated ? 'line-through opacity-50' : ''}`}
                >
                  <span
                    className="w-3 h-3 rounded-sm inline-block"
                    style={{ backgroundColor: p.color }}
                  />
                  {p.name}
                </span>
              ))
            ) : (
              <>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-red-600 inline-block" />
                  Your Regime
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm border border-dashed border-amber-400 bg-amber-500/20 inline-block" />
                  Underground Cell
                </span>
              </>
            )}
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-3 h-3 rounded-sm bg-blue-600 inline-block" />
              197 Nations ({allRegions.length} Prov)
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => focusOnRegion(homeFocusRegion, 3.2)}
              title="Center on Your Cell / Capital"
              className="px-2.5 py-1.5 bg-[#151E2B] hover:bg-slate-700 border border-slate-700 rounded text-slate-200 flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap cursor-pointer mr-1"
            >
              <LocateFixed className="w-3.5 h-3.5 text-amber-400" />
              Focus Cell
            </button>
            <button
              type="button"
              onClick={() => adjustZoom(-0.5)}
              title="Zoom Out"
              className="p-1.5 bg-[#151E2B] hover:bg-slate-700 border border-slate-700 rounded text-slate-200 cursor-pointer"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] text-slate-300 w-10 text-center">
              {zoom.toFixed(1)}×
            </span>
            <button
              type="button"
              onClick={() => adjustZoom(0.5)}
              title="Zoom In"
              className="p-1.5 bg-[#151E2B] hover:bg-slate-700 border border-slate-700 rounded text-slate-200 cursor-pointer"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={resetView}
              title="Reset Map View"
              className="p-1.5 bg-[#151E2B] hover:bg-slate-700 border border-slate-700 rounded text-slate-200 cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="relative flex-1 flex items-center justify-center p-2 lg:p-3 overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              handleMouseUp();
              setHoveredId(null);
            }}
            onWheel={(e) => {
              e.preventDefault();
              adjustZoom(e.deltaY < 0 ? 0.35 : -0.35);
            }}
            className={`w-full h-full max-h-[620px] select-none ${
              zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
            }`}
            role="img"
            aria-label="Strategic Natural Earth World Map"
          >
            <defs>
              <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path
                  d="M 40 0 L 0 0 0 40"
                  fill="none"
                  stroke="#121B29"
                  strokeWidth="0.6"
                />
              </pattern>
            </defs>

            <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="#091019" />
            <rect x="0" y="0" width={MAP_W} height={MAP_H} fill="url(#grid)" />

            {/* Maritime Sea Lanes */}
            {SEA_LANES.map(([aId, bId]) => {
              const a = state.regions[aId];
              const b = state.regions[bId];
              if (!a || !b) return null;
              const isPacificWrap = Math.abs(a.labelPos[0] - b.labelPos[0]) > 650;
              if (isPacificWrap) {
                return (
                  <g key={`${aId}-${bId}`} opacity="0.45">
                    <line
                      x1={a.labelPos[0]}
                      y1={a.labelPos[1]}
                      x2={a.labelPos[0] < MAP_W / 2 ? 0 : MAP_W}
                      y2={a.labelPos[1]}
                      stroke="#475569"
                      strokeWidth={0.9 / Math.sqrt(zoom)}
                      strokeDasharray="3 3"
                    />
                    <line
                      x1={b.labelPos[0]}
                      y1={b.labelPos[1]}
                      x2={b.labelPos[0] < MAP_W / 2 ? 0 : MAP_W}
                      y2={b.labelPos[1]}
                      stroke="#475569"
                      strokeWidth={0.9 / Math.sqrt(zoom)}
                      strokeDasharray="3 3"
                    />
                  </g>
                );
              }
              return (
                <line
                  key={`${aId}-${bId}`}
                  x1={a.labelPos[0]}
                  y1={a.labelPos[1]}
                  x2={b.labelPos[0]}
                  y2={b.labelPos[1]}
                  stroke="#334155"
                  strokeWidth={0.85 / Math.sqrt(zoom)}
                  strokeDasharray="3 3"
                />
              );
            })}

            {/* 705 Organic Province Polygons */}
            {allRegions.map((region) => {
              const isSelected = region.id === selected.id;
              const isHovered = region.id === hoveredId;
              const isAdjToSelected = selected.adjacentIds.includes(region.id);
              const isHiddenCell =
                (state.phase === 'UNDERGROUND' || playerRegionCount === 0) &&
                region.id === state.cellRegionId &&
                region.ownerId !== activePlayerId;
              const fill = ownerColor(region.ownerId);

              return (
                <path
                  key={region.id}
                  d={region.svgPath}
                  fill={fill}
                  fillOpacity={
                    isSelected
                      ? 0.96
                      : isHovered
                      ? 0.88
                      : isAdjToSelected
                      ? 0.82
                      : region.ownerId === activePlayerId
                      ? 0.88
                      : 0.66
                  }
                  stroke={
                    isSelected
                      ? '#FFFFFF'
                      : isHiddenCell
                      ? '#F59E0B'
                      : isAdjToSelected
                      ? '#E2E8F0'
                      : '#0D131D'
                  }
                  strokeWidth={
                    isSelected
                      ? 1.8 / zoom
                      : isHiddenCell
                      ? 1.6 / zoom
                      : isAdjToSelected
                      ? 0.9 / zoom
                      : 0.5 / zoom
                  }
                  strokeDasharray={
                    isHiddenCell ? `${3.5 / zoom} ${2 / zoom}` : undefined
                  }
                  onMouseEnter={() => setHoveredId(region.id)}
                  onMouseLeave={() =>
                    setHoveredId((prev) => (prev === region.id ? null : prev))
                  }
                  onClick={() => {
                    if (!draggingRef.current.moved) {
                      onSelectRegion(region.id);
                    }
                  }}
                  className="cursor-pointer transition-opacity duration-100"
                />
              );
            })}

            {state.regions[state.cellRegionId] &&
              (state.phase === 'UNDERGROUND' || playerRegionCount === 0) && (
                <g
                  transform={`translate(${state.regions[state.cellRegionId].labelPos[0]}, ${state.regions[state.cellRegionId].labelPos[1]}) scale(${labelScale})`}
                  className="pointer-events-none"
                >
                  <circle
                    r="7"
                    fill="none"
                    stroke="#F59E0B"
                    strokeWidth="1.5"
                    strokeDasharray="3 2"
                  />
                  <circle r="2.2" fill="#F59E0B" />
                </g>
              )}

            {/* LOD Labels & Garrison Counters */}
            {allRegions.map((region) => {
              const isSelected = region.id === selected.id;
              const isAdjToSelected = selected.adjacentIds.includes(region.id);
              const isHiddenCell =
                (state.phase === 'UNDERGROUND' || playerRegionCount === 0) &&
                region.id === state.cellRegionId &&
                region.ownerId !== activePlayerId;
              const showDetail =
                zoom >= 2.2 ||
                isSelected ||
                isHiddenCell ||
                (zoom >= 1.35 &&
                  (region.ownerId === activePlayerId || isAdjToSelected));

              if (!showDetail) return null;

              const highUnrest =
                region.ownerId === activePlayerId && region.unrest >= 65;
              const domUnit = getDominantUnitType(
                isHiddenCell ? state.undergroundUnits : region.units
              );
              const domPal = UNIT_LOGO_PALETTES[domUnit];

              return (
                <g
                  key={`lbl-${region.id}`}
                  transform={`translate(${region.labelPos[0]}, ${region.labelPos[1]}) scale(${labelScale})`}
                  className="pointer-events-none"
                >
                  <text
                    x={0}
                    y={-3}
                    textAnchor="middle"
                    fontSize="7.4"
                    className="fill-slate-100 font-semibold"
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
                  >
                    {region.name}
                  </text>

                  <rect
                    x={-8}
                    y={1}
                    width="22"
                    height="11"
                    rx="2"
                    fill="#0A0F17"
                    fillOpacity="0.9"
                    stroke={
                      isHiddenCell
                        ? '#F59E0B'
                        : highUnrest
                        ? '#EF4444'
                        : '#334155'
                    }
                    strokeWidth="0.8"
                  />
                  {/* Dominant Unit Emblem */}
                  <g transform="translate(-20, 0.5) scale(0.5)">
                    {renderLogoFrame(domPal.shape, domPal.bg, domPal.border)}
                    {renderUnitInsigniaGlyph(domUnit, domPal.ink, domPal.accent)}
                  </g>
                  <text
                    x={3}
                    y={9}
                    textAnchor="middle"
                    fontSize="7.6"
                    className="fill-white font-mono font-semibold"
                  >
                    {region.troops}
                  </text>

                  {isHiddenCell && (
                    <text
                      x={0}
                      y={-12}
                      textAnchor="middle"
                      fontSize="7.2"
                      className="fill-amber-300 font-mono font-bold"
                      style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
                    >
                      Cell: {state.undergroundTroops}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Hover Tooltip */}
          {hoveredRegion && (
            <div className="pointer-events-none absolute bottom-4 left-4 bg-[#0D131C]/95 border border-slate-700/90 rounded-md px-3 py-2 text-xs shadow-lg max-w-sm">
              <div className="font-semibold text-white">
                {hoveredRegion.name}
                <span className="text-slate-400 font-normal">
                  {' '}
                  ·{' '}
                  {hoveredRegion.ownerId === activePlayerId
                    ? 'Your Regime'
                    : getOwnerDisplayName(state, hoveredRegion.ownerId)}
                </span>
              </div>
              <div className="text-[11px] font-mono text-slate-300 mt-0.5 flex flex-wrap items-center gap-2">
                <span>Forces: {hoveredRegion.troops}</span>
                <span className="text-slate-600">·</span>
                <span>{hoveredRegion.terrain}</span>
                {hoveredNation && state.phase === 'EXPOSED' && (
                  <>
                    <span className="text-slate-600">·</span>
                    <span
                      className={
                        hoveredNation.relation >= 15
                          ? 'text-emerald-400'
                          : hoveredNation.atWar
                          ? 'text-red-400'
                          : 'text-slate-300'
                      }
                    >
                      Rel{' '}
                      {hoveredNation.relation >= 0
                        ? `+${hoveredNation.relation}`
                        : hoveredNation.relation}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-2.5 bg-[#0E141D] border-t border-slate-800/80 flex items-center justify-between gap-4 text-xs">
          <div className="truncate text-slate-300">
            <span className="text-slate-500 mr-2">Latest Dispatch:</span>
            {state.logs[0]?.message ?? 'Cell operational.'}
          </div>
          <span className="text-slate-500 font-mono shrink-0">
            Scroll to zoom · Drag to pan
          </span>
        </div>
      </div>

      {/* Right Side Command & Region Inspector */}
      <aside className="xl:col-span-4 bg-[#111722] flex flex-col min-h-0 overflow-y-auto">
        <div className="p-5 border-b border-slate-800 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h2
              className="text-2xl font-bold text-white tracking-tight truncate"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {selected.name}
            </h2>
            <button
              type="button"
              onClick={() => focusOnRegion(selected, 3.4)}
              title="Zoom map to this province"
              className="text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              <LocateFixed className="w-3.5 h-3.5 text-slate-400" />
              {selected.continent}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span
              className={`font-semibold ${
                isPlayerOwned
                  ? 'text-red-400'
                  : isUndergroundCellView
                  ? 'text-amber-400'
                  : 'text-sky-400'
              }`}
            >
              {ownerLabel}
            </span>
            <span aria-hidden="true">·</span>
            <span>{selected.terrain}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Garrison: {selected.troops}
            </span>
          </div>

          {selectedNation && (
            <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2">
              <span>{getScenarioBlocLabel(state.scenarioId, selectedNation.bloc2026)}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">
                {state.phase === 'UNDERGROUND'
                  ? 'Unaware of your cell'
                  : selectedNation.atWar
                  ? 'At War'
                  : `${SCENARIOS[state.scenarioId ?? 'modern_2026']?.yearLabel ?? '2026'} Rel: ${
                      selectedNation.relation >= 0
                        ? `+${selectedNation.relation}`
                        : selectedNation.relation
                    }`}
              </span>
            </div>
          )}

          {/* Active Branch & Unit Composition Strip */}
          <div className="pt-1.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-300 bg-[#0C1017] border border-slate-800/90 rounded px-2.5 py-1.5">
              {UNIT_BRANCH_ORDER.map((grp) => {
                const branchTotal = grp.types.reduce(
                  (acc, ut) => acc + (displayedUnits?.[ut] ?? 0),
                  0
                );
                return (
                  <span key={grp.branch} className="flex items-center gap-1">
                    <span className="font-sans text-slate-400">
                      {grp.branch === 'Air Force' ? 'Air' : grp.branch}:
                    </span>
                    <strong className="text-white">{branchTotal}</strong>
                  </span>
                );
              })}
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono tabular-nums">
              {Object.entries(displayedUnits ?? {})
                .filter(([, count]) => count > 0)
                .map(([ut, count]) => {
                  const uType = ut as UnitType;
                  return (
                    <div
                      key={uType}
                      title={`${UNITS[uType]?.name ?? uType} (${UNITS[uType]?.unitClass ?? ''})`}
                      className="bg-[#0C1017] border border-slate-800/90 rounded px-2 py-1 flex items-center justify-between gap-1"
                    >
                      <span className="flex items-center gap-1 min-w-0">
                        <UnitBadgeIcon type={uType} className="w-3 h-3 shrink-0" />
                        <span className="text-[10px] font-sans text-slate-300 truncate">
                          {UNITS[uType]?.shortName ?? uType}
                        </span>
                      </span>
                      <span className="text-white font-semibold shrink-0">{count}</span>
                    </div>
                  );
                })}
            </div>
          </div>

          <div className="pt-1 grid grid-cols-4 gap-2 text-xs font-mono tabular-nums">
            <div className="bg-[#0C1017] border border-slate-800 rounded p-2">
              <div className="text-[11px] font-sans text-slate-400">Funds</div>
              <div className="text-white font-semibold mt-0.5">+${selected.baseFunds}</div>
            </div>
            <div className="bg-[#0C1017] border border-slate-800 rounded p-2">
              <div className="text-[11px] font-sans text-slate-400">Steel</div>
              <div className="text-white font-semibold mt-0.5">
                +{selected.baseMaterials}
              </div>
            </div>
            <div className="bg-[#0C1017] border border-slate-800 rounded p-2">
              <div className="text-[11px] font-sans text-slate-400">Fuel</div>
              <div className="text-white font-semibold mt-0.5">+{selected.baseEnergy}</div>
            </div>
            <div className="bg-[#0C1017] border border-slate-800 rounded p-2">
              <div className="text-[11px] font-sans text-slate-400">Unrest</div>
              <div
                className={`font-semibold mt-0.5 ${
                  selected.unrest >= 70
                    ? 'text-red-400'
                    : selected.unrest >= 45
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}
              >
                {selected.unrest}%
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-6 flex-1">
          {/* UNDERGROUND CELL PANEL */}
          {isUndergroundCellView ? (
            <>
              <div className="p-3.5 bg-[#0C1017] border border-amber-800/50 rounded-md space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                    <EyeOff className="w-4 h-4" />
                    {state.phase === 'UNDERGROUND'
                      ? 'Hidden Revolutionary Gang'
                      : 'Exposed Insurgent Cell'}
                  </span>
                  <span className="font-mono text-white font-semibold">
                    {state.undergroundTroops} Fighters
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {state.phase === 'UNDERGROUND'
                    ? 'Spec Ops generate 55% less Suspicion than Armor or Artillery. Build up your force, then launch a tactical uprising.'
                    : 'Your cover is blown! Seize control of this province before security crackdowns wipe out your cell.'}
                </p>
              </div>

              {renderRecruitButtons(true)}

              <div className="space-y-2.5 pt-2 border-t border-slate-800">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Eye className="w-4 h-4 text-purple-400" />
                  Weaken Host Government
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={
                      Boolean(state.covertOpsUsedThisTurn[selected.id]) ||
                      state.resources.influence < sabotageCost
                    }
                    onClick={() => onCovertOp(selected.id, 'sabotage')}
                    className="py-2 px-3 bg-[#0C1017] hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-xs text-white rounded text-left cursor-pointer"
                  >
                    <div className="font-medium">Sabotage ({sabotageCost} Inf)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Cuts host troops · +Suspicion
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(state.covertOpsUsedThisTurn[selected.id]) ||
                      state.resources.influence < inciteCost
                    }
                    onClick={() => onCovertOp(selected.id, 'incite')}
                    className="py-2 px-3 bg-[#0C1017] hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-xs text-white rounded text-left cursor-pointer"
                  >
                    <div className="font-medium">Incite Riots ({inciteCost} Inf)</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Raises host unrest
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-slate-800">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Swords className="w-4 h-4 text-red-400" />
                  Overthrow Government
                </h3>

                {combatPreview && (
                  <div className="p-3 bg-[#0C1017] border border-slate-800 rounded space-y-1.5 text-xs">
                    <div className="flex justify-between font-mono tabular-nums">
                      <span className="text-slate-300">
                        Your Force:{' '}
                        <strong className="text-white">
                          {Math.round(combatPreview.attackPower)}
                        </strong>
                      </span>
                      <span className="text-slate-300">
                        Gov Defense:{' '}
                        <strong className="text-white">
                          {Math.round(combatPreview.defensePower)}
                        </strong>
                      </span>
                    </div>
                    {combatPreview.modifiers.map((m, i) => (
                      <div key={i} className="flex justify-between text-[11px]">
                        <span className="text-slate-400">{m.label}</span>
                        <span
                          className={`font-mono ${
                            m.positive ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {m.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  type="button"
                  disabled={state.undergroundTroops < 2}
                  onClick={onLaunchUprising}
                  className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                >
                  Launch Uprising & Enter Battle ({selected.name})
                </button>
              </div>

              <div className="space-y-2.5 pt-3 border-t border-slate-800">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  Secret Cell Infrastructure
                </h3>
                <div className="space-y-2">
                  {(Object.keys(BUILDINGS) as BuildingType[])
                    .filter((b) => b !== 'fortress')
                    .map((bType) => {
                      const def = BUILDINGS[bType];
                      const count = selected.buildings[bType] ?? 0;
                      const cost = getBuildingCost(state, bType, selected);
                      const canAfford =
                        state.resources.materials >= cost.materials &&
                        state.resources.funds - cost.funds >= -200;
                      return (
                        <div
                          key={bType}
                          className="p-2.5 bg-[#0C1017] border border-slate-800 rounded flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                              <span className="truncate">{def.name}</span>
                              <span className="font-mono text-slate-400">×{count}</span>
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {def.shortDesc}
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={!canAfford}
                            onClick={() => onBuild(selected.id, bType)}
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-red-600 disabled:opacity-35 text-white text-xs font-mono rounded whitespace-nowrap shrink-0 cursor-pointer"
                          >
                            ${cost.funds} · {cost.materials}St
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            </>
          ) : isPlayerOwned ? (
            /* OWNED PROVINCE MANAGEMENT */
            <>
              {renderRecruitButtons(false)}

              {selected.unrest > 0 && (
                <button
                  type="button"
                  onClick={() => onPacify(selected.id)}
                  disabled={state.resources.influence < 8}
                  className="w-full py-2 px-3 bg-[#17202E] hover:bg-[#1D283A] border border-slate-700 disabled:opacity-40 text-slate-100 text-xs font-medium rounded flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-emerald-400" />
                    Pacify Unrest
                  </span>
                  <span className="font-mono text-slate-400">$25-$40 · 8-12 Inf</span>
                </button>
              )}

              {selected.unrest >= 70 && (
                <div className="p-2.5 rounded bg-red-950/40 border border-red-900/60 text-xs text-red-200 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>
                    High revolt risk! Lower unrest or fortify before ending turn.
                  </span>
                </div>
              )}

              {adjacentPlayerRegions.length > 0 && (
                <div className="space-y-2.5 pt-2 border-t border-slate-800">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <ArrowRightLeft className="w-4 h-4 text-slate-400" />
                    Reinforce From Neighbor
                  </h3>
                  <div className="flex items-center gap-2">
                    <select
                      value={activeSource?.id ?? ''}
                      onChange={(e) => setAttackSourceId(e.target.value)}
                      className="flex-1 bg-[#0C1017] border border-slate-700 rounded px-2.5 py-2 text-xs text-white"
                    >
                      {adjacentPlayerRegions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.troops - 1} avail)
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        activeSource && onTransfer(activeSource.id, selected.id, 0.5)
                      }
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded whitespace-nowrap cursor-pointer"
                    >
                      Move Half
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3 pt-2 border-t border-slate-800">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  Build Factories & Infrastructure
                </h3>

                <div className="space-y-2">
                  {(Object.keys(BUILDINGS) as BuildingType[]).map((bType) => {
                    const def = BUILDINGS[bType];
                    const count = selected.buildings[bType] ?? 0;
                    const cost = getBuildingCost(state, bType, selected);
                    const canAfford =
                      state.resources.materials >= cost.materials &&
                      state.resources.funds - cost.funds >= -200;

                    return (
                      <div
                        key={bType}
                        className="p-3 bg-[#0C1017] border border-slate-800 rounded-md flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-white flex items-center gap-2">
                            <span className="truncate">{def.name}</span>
                            <span className="font-mono text-slate-400 shrink-0">
                              ×{count}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {def.shortDesc}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => onBuild(selected.id, bType)}
                          disabled={!canAfford}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-red-600 disabled:opacity-35 text-white text-xs font-mono rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          ${cost.funds} · {cost.materials}St
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            /* FOREIGN PROVINCE */
            <div className="space-y-5">
              {state.phase === 'UNDERGROUND' ? (
                <div className="p-4 bg-[#0C1017] border border-slate-800 rounded text-xs text-slate-400 leading-relaxed">
                  You are currently operating underground in{' '}
                  <strong className="text-white">
                    {state.regions[state.cellRegionId]?.name}
                  </strong>
                  . Foreign nations are unaware of your movement. Seize your host
                  province first before invading neighboring territories!
                </div>
              ) : !bordersPlayer ? (
                <div className="p-4 bg-[#0C1017] border border-slate-800 rounded text-xs text-slate-400 leading-relaxed">
                  No adjacent revolutionary province. Capture a neighboring territory or
                  sea-lane bridgehead first to conduct covert ops or enter battle here.
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Swords className="w-4 h-4 text-red-400" />
                      Launch Tactical Assault
                    </h3>

                    {adjacentPlayerRegions.length === 0 ? (
                      <p className="text-xs text-amber-400">
                        Adjacent provinces only have 1 garrison unit. Recruit or redeploy
                        divisions first.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <label className="block text-xs text-slate-400">
                            Attacking Staging Ground
                          </label>
                          <select
                            value={activeSource?.id ?? ''}
                            onChange={(e) => setAttackSourceId(e.target.value)}
                            className="w-full bg-[#0C1017] border border-slate-700 rounded px-3 py-2 text-xs text-white"
                          >
                            {adjacentPlayerRegions.map((r) => {
                              const used = state.attackCountsThisTurn[r.id] ?? 0;
                              return (
                                <option key={r.id} value={r.id}>
                                  {r.name} ({r.troops - 1} avail · {used}/{maxAttacks}{' '}
                                  attacks)
                                </option>
                              );
                            })}
                          </select>
                        </div>

                        {activeSource && committedUnits && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-400">Commit Force</span>
                              <span className="font-mono text-white font-semibold">
                                {troopsToCommit} (
                                {UNIT_BRANCH_ORDER.map((grp) => {
                                  const sum = grp.types.reduce(
                                    (s, ut) => s + (committedUnits[ut] ?? 0),
                                    0
                                  );
                                  const tag =
                                    grp.branch === 'Army'
                                      ? 'Land'
                                      : grp.branch === 'Navy'
                                      ? 'Sea'
                                      : 'Air';
                                  return `${sum} ${tag}`;
                                }).join(' · ')}
                                )
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.25}
                              max={1}
                              step={0.25}
                              value={sendFraction}
                              onChange={(e) => setSendFraction(Number(e.target.value))}
                              className="w-full accent-red-600"
                            />
                          </div>
                        )}

                        {combatPreview && (
                          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded space-y-2 text-xs">
                            <div className="flex justify-between font-mono tabular-nums">
                              <span className="text-slate-300">
                                Est. Attack:{' '}
                                <strong className="text-white">
                                  {Math.round(combatPreview.attackPower)}
                                </strong>
                              </span>
                              <span className="text-slate-300">
                                Enemy Def:{' '}
                                <strong className="text-white">
                                  {Math.round(combatPreview.defensePower)}
                                </strong>
                              </span>
                            </div>
                            {combatPreview.modifiers.length > 0 && (
                              <div className="pt-1.5 border-t border-slate-800/80 space-y-1">
                                {combatPreview.modifiers.map((m, idx) => (
                                  <div
                                    key={idx}
                                    className="flex justify-between text-[11px]"
                                  >
                                    <span className="text-slate-400">{m.label}</span>
                                    <span
                                      className={`font-mono ${
                                        m.positive ? 'text-emerald-400' : 'text-amber-400'
                                      }`}
                                    >
                                      {m.value}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          disabled={
                            !activeSource ||
                            (state.attackCountsThisTurn[activeSource.id] ?? 0) >=
                              maxAttacks ||
                            troopsToCommit < 1
                          }
                          onClick={() =>
                            activeSource &&
                            onAttack(activeSource.id, selected.id, sendFraction)
                          }
                          className="w-full py-2.5 px-4 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded transition-colors flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <Crosshair className="w-4 h-4" />
                          {activeSource &&
                          (state.attackCountsThisTurn[activeSource.id] ?? 0) >=
                            maxAttacks
                            ? 'Staging Region Attacks Exhausted'
                            : `Enter Tactical Battle (${selected.name})`}
                        </button>
                      </>
                    )}
                  </div>

                  <div className="space-y-3 pt-4 border-t border-slate-800">
                    <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                      <Eye className="w-4 h-4 text-purple-400" />
                      Covert Operations
                    </h3>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        disabled={
                          Boolean(state.covertOpsUsedThisTurn[selected.id]) ||
                          state.resources.influence < sabotageCost
                        }
                        onClick={() => onCovertOp(selected.id, 'sabotage')}
                        className="py-2 px-3 bg-[#0C1017] hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-left rounded text-xs flex items-center justify-between cursor-pointer"
                      >
                        <div>
                          <div className="text-white font-medium flex items-center gap-1.5">
                            <Flame className="w-3.5 h-3.5 text-amber-400" />
                            Sabotage Supply Lines
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Destroys enemy garrison troops
                          </div>
                        </div>
                        <span className="font-mono text-purple-300">
                          {sabotageCost} Inf
                        </span>
                      </button>

                      <button
                        type="button"
                        disabled={
                          Boolean(state.covertOpsUsedThisTurn[selected.id]) ||
                          state.resources.influence < inciteCost
                        }
                        onClick={() => onCovertOp(selected.id, 'incite')}
                        className="py-2 px-3 bg-[#0C1017] hover:bg-slate-800 border border-slate-800 disabled:opacity-40 text-left rounded text-xs flex items-center justify-between cursor-pointer"
                      >
                        <div>
                          <div className="text-white font-medium flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                            Incite Local Uprising
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            Raises unrest & lowers defense
                          </div>
                        </div>
                        <span className="font-mono text-purple-300">{inciteCost} Inf</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
