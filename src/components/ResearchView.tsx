import React, { useState } from 'react';
import {
  getUnitEffectiveStats,
  TECH_TREE,
  UNIT_ORDER,
  UNIT_TECH_TREE,
  UNITS,
} from '../data/techAndBuildings';
import { GameState, TechBranch, UnitBranch, UnitType } from '../types/game';
import { UnitLogo } from './UnitLogo';
import {
  Anchor,
  ArrowRight,
  Check,
  Cpu,
  Eye,
  Lock,
  Plane,
  Shield,
} from 'lucide-react';

interface ResearchViewProps {
  state: GameState;
  onUnlockTech: (techId: string) => void;
  onResearchUnit: (unitType: UnitType) => void;
}

type ResearchTab = UnitBranch | 'Economy & Intel';

const RESEARCH_TABS: Array<{
  id: ResearchTab;
  label: string;
  icon: React.ReactNode;
}> = [
  { id: 'Army', label: 'Army', icon: <Shield className="w-4 h-4 text-red-400" /> },
  { id: 'Navy', label: 'Navy', icon: <Anchor className="w-4 h-4 text-sky-400" /> },
  { id: 'Air Force', label: 'Air Force', icon: <Plane className="w-4 h-4 text-teal-400" /> },
  {
    id: 'Economy & Intel',
    label: 'Economy & Intel',
    icon: <Cpu className="w-4 h-4 text-amber-400" />,
  },
];

const ECON_BRANCHES: Array<{ id: TechBranch; title: string; icon: React.ReactNode }> = [
  { id: 'Industry', title: 'Industrial & Fiscal', icon: <Cpu className="w-4 h-4 text-amber-400" /> },
  { id: 'Intelligence', title: 'Covert & Civic', icon: <Eye className="w-4 h-4 text-purple-400" /> },
];

const TIER_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Tier I · Base Formations',
  2: 'Tier II · Specialized Systems',
  3: 'Tier III · Heavy & Capital Arms',
};

export const ResearchView: React.FC<ResearchViewProps> = ({
  state,
  onUnlockTech,
  onResearchUnit,
}) => {
  const [activeTab, setActiveTab] = useState<ResearchTab>('Army');

  const renderUnitCard = (unitType: UnitType) => {
    const def = UNITS[unitType];
    const tree = UNIT_TECH_TREE[unitType];
    const curLevel = state.unitLevels?.[unitType] ?? 0;
    const isMax = curLevel >= 4;
    const isLocked = curLevel === 0;

    const prereq = tree.prerequisite;
    const prereqMet =
      !prereq || (state.unitLevels?.[prereq.unitType] ?? 0) >= prereq.minLevel;

    const curSpec =
      curLevel >= 1
        ? tree.levels.find((l) => l.level === curLevel) ?? tree.levels[0]
        : null;
    const nextSpec = !isMax
      ? tree.levels.find((l) => l.level === curLevel + 1) ?? null
      : null;

    const curStats = getUnitEffectiveStats(unitType, Math.max(1, curLevel));
    const nextStats = nextSpec
      ? getUnitEffectiveStats(unitType, nextSpec.level)
      : null;

    const canResearch =
      Boolean(nextSpec) &&
      (curLevel > 0 || prereqMet) &&
      state.resources.science >= (nextSpec?.costScience ?? 9999);

    return (
      <div
        key={unitType}
        className={`p-4 rounded-lg border flex flex-col justify-between transition-colors ${
          isMax
            ? 'bg-[#13221D] border-emerald-700/60'
            : isLocked && !prereqMet
            ? 'bg-[#0E131B] border-slate-800/70 opacity-70'
            : isLocked
            ? 'bg-[#121822] border-amber-800/60'
            : 'bg-[#121822] border-slate-700'
        }`}
      >
        <div className="space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <UnitLogo type={unitType} size="md" className="mt-0.5" />
              <div className="min-w-0">
                <div className="text-[11px] font-mono text-slate-400">
                  {def.unitClass} · {def.branch}
                </div>
                <h4 className="text-base font-semibold text-white mt-0.5 truncate">
                  {def.name}
                </h4>
                <div className="text-xs text-slate-300 mt-0.5 truncate">
                  {curSpec ? curSpec.designation : `Prototype: ${tree.levels[0].designation}`}
                </div>
              </div>
            </div>

            {isMax ? (
              <span className="text-xs font-mono font-semibold text-emerald-400 flex items-center gap-1 shrink-0">
                <Check className="w-3.5 h-3.5" /> Lv.4 Max
              </span>
            ) : isLocked ? (
              <span className="text-xs font-mono text-amber-400 flex items-center gap-1 shrink-0">
                <Lock className="w-3.5 h-3.5" /> Locked
              </span>
            ) : (
              <span className="text-xs font-mono font-semibold text-sky-400 shrink-0">
                Lv.{curLevel} / 4
              </span>
            )}
          </div>

          {/* Prerequisite Lineage */}
          {prereq && (
            <div
              className={`text-[11px] font-mono ${
                prereqMet ? 'text-emerald-400/90' : 'text-amber-300'
              }`}
            >
              {prereqMet ? 'Prerequisite met: ' : 'Requires: '}
              {UNITS[prereq.unitType].shortName} Lv.{prereq.minLevel}
            </div>
          )}

          {/* Lv 1-4 Progression Strip */}
          <div className="grid grid-cols-4 gap-1.5">
            {tree.levels.map((lvl) => {
              const done = curLevel >= lvl.level;
              const isNext = curLevel + 1 === lvl.level;
              return (
                <div
                  key={lvl.level}
                  className={`px-2 py-1 rounded text-center border text-[11px] font-mono ${
                    done
                      ? 'bg-emerald-950/60 border-emerald-700/70 text-emerald-300'
                      : isNext
                      ? 'bg-[#192334] border-teal-600/70 text-teal-300'
                      : 'bg-[#0C1119] border-slate-800 text-slate-500'
                  }`}
                >
                  Lv.{lvl.level}
                </div>
              );
            })}
          </div>

          {/* Current / Next Combat Profile */}
          <div className="grid grid-cols-5 gap-1.5 bg-[#0C1119] border border-slate-800/80 rounded p-2 text-center">
            <div>
              <div className="text-[10px] text-slate-500">ATK</div>
              <div className="text-xs font-mono tabular-nums text-white font-semibold">
                {curStats.attack}
                {nextStats && nextStats.attack > curStats.attack && (
                  <span className="text-teal-400">→{nextStats.attack}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">DEF</div>
              <div className="text-xs font-mono tabular-nums text-white font-semibold">
                {curStats.defense}
                {nextStats && nextStats.defense > curStats.defense && (
                  <span className="text-teal-400">→{nextStats.defense}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">HP</div>
              <div className="text-xs font-mono tabular-nums text-white font-semibold">
                {curStats.hp}
                {nextStats && nextStats.hp > curStats.hp && (
                  <span className="text-teal-400">→{nextStats.hp}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">MOV</div>
              <div className="text-xs font-mono tabular-nums text-white font-semibold">
                {curStats.move}
                {nextStats && nextStats.move > curStats.move && (
                  <span className="text-teal-400">→{nextStats.move}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500">RNG</div>
              <div className="text-xs font-mono tabular-nums text-white font-semibold">
                {curStats.range}
                {nextStats && nextStats.range > curStats.range && (
                  <span className="text-teal-400">→{nextStats.range}</span>
                )}
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 leading-relaxed">
            {def.strengths}
          </div>
        </div>

        {/* Upgrade Action Footer */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2.5">
          {nextSpec ? (
            <>
              <div className="text-xs space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-slate-300 font-medium">
                  <span className="flex items-center gap-1 truncate">
                    <ArrowRight className="w-3 h-3 text-teal-400 shrink-0" />
                    <span className="truncate">
                      Lv.{nextSpec.level}: {nextSpec.designation}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums text-teal-400 shrink-0">
                    {nextSpec.costScience} Sci
                  </span>
                </div>
                <div className="text-[11px] text-amber-300/90">
                  {nextSpec.perkSummary}
                </div>
              </div>

              <button
                type="button"
                disabled={!canResearch}
                onClick={() => onResearchUnit(unitType)}
                className="w-full py-2 px-3 bg-teal-700 hover:bg-teal-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
              >
                {isLocked && !prereqMet && prereq
                  ? `Unlock ${UNITS[prereq.unitType].shortName} Lv.${prereq.minLevel} First`
                  : state.resources.science < nextSpec.costScience
                  ? `Need ${nextSpec.costScience} Science`
                  : isLocked
                  ? `Unlock Lv.1 (${nextSpec.costScience} Sci)`
                  : `Upgrade to Lv.${nextSpec.level} (${nextSpec.costScience} Sci)`}
              </button>
            </>
          ) : (
            <div className="text-xs font-medium text-emerald-400 flex items-center justify-between">
              <span>{curSpec?.perkSummary}</span>
              <span className="font-mono">Max Tier</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderUnitBranch = (branch: UnitBranch) => {
    const branchUnits = UNIT_ORDER.filter((ut) => UNIT_TECH_TREE[ut].branch === branch);
    const tiers = ([1, 2, 3] as const).filter((tier) =>
      branchUnits.some((ut) => UNIT_TECH_TREE[ut].tierOrder === tier)
    );

    return (
      <div className="space-y-6">
        {tiers.map((tier) => {
          const tierUnits = branchUnits.filter(
            (ut) => UNIT_TECH_TREE[ut].tierOrder === tier
          );
          return (
            <section key={tier} className="space-y-3">
              <h3 className="text-sm font-semibold text-white border-b border-slate-800 pb-2">
                {TIER_LABELS[tier]}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tierUnits.map(renderUnitCard)}
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  const renderEconomyAndIntel = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {ECON_BRANCHES.map((branch) => {
        const nodes = TECH_TREE.filter((t) => t.branch === branch.id).sort(
          (a, b) => a.tier - b.tier
        );
        return (
          <section key={branch.id} className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white pb-2 border-b border-slate-800">
              {branch.icon}
              <span>{branch.title}</span>
            </div>

            <div className="space-y-3">
              {nodes.map((node) => {
                const unlocked = state.unlockedTechs.includes(node.id);
                const prereqsMet = node.prerequisites.every((p) =>
                  state.unlockedTechs.includes(p)
                );
                const canResearch =
                  !unlocked && prereqsMet && state.resources.science >= node.cost;

                return (
                  <div
                    key={node.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      unlocked
                        ? 'bg-[#13221D] border-emerald-700/60'
                        : prereqsMet
                        ? 'bg-[#121822] border-slate-700'
                        : 'bg-[#0E131B] border-slate-800/70 opacity-65'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs text-slate-400 font-mono">
                          Tier {node.tier}
                        </div>
                        <h3 className="text-sm font-semibold text-white mt-0.5">
                          {node.name}
                        </h3>
                      </div>
                      {unlocked ? (
                        <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 shrink-0">
                          <Check className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : !prereqsMet ? (
                        <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0">
                          <Lock className="w-3.5 h-3.5" /> Locked
                        </span>
                      ) : (
                        <span className="text-xs font-mono tabular-nums text-teal-400 shrink-0">
                          {node.cost} Sci
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                      {node.description}
                    </p>

                    <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-amber-300/90">
                        {node.effectSummary}
                      </span>
                      {!unlocked && (
                        <button
                          type="button"
                          disabled={!canResearch}
                          onClick={() => onUnlockTech(node.id)}
                          className="px-3 py-1.5 bg-teal-700 hover:bg-teal-600 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          Research
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">
            Military Hardware & Strategic Tech Tree
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Unlock advanced divisions, warships, and aircraft, then upgrade unit models from Lv.1 to Lv.4 to boost combat firepower, range, and cost efficiency.
          </p>
        </div>
        <div className="text-sm font-mono tabular-nums text-teal-400 font-semibold">
          Available Science: {state.resources.science}
        </div>
      </div>

      {/* Research Branch Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {RESEARCH_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-md text-xs font-semibold flex items-center gap-2 border transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#192334] border-teal-500 text-white'
                  : 'bg-[#101620] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {activeTab === 'Economy & Intel'
        ? renderEconomyAndIntel()
        : renderUnitBranch(activeTab)}
    </div>
  );
};
