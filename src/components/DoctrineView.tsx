import React from 'react';
import { COMBAT_STYLES } from '../data/techAndBuildings';
import { GameState } from '../types/game';
import { Check, Lock, Minus, Shield, Swords } from 'lucide-react';

interface DoctrineViewProps {
  state: GameState;
  onUnlockDoctrine: (upgradeId: string) => void;
}

export const DoctrineView: React.FC<DoctrineViewProps> = ({
  state,
  onUnlockDoctrine,
}) => {
  const style = COMBAT_STYLES[state.combatStyle];
  const unlockedCount = style.upgrades.filter((u) =>
    state.doctrineUpgrades.includes(u.id)
  ).length;

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-6xl w-full mx-auto space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Swords className="w-5 h-5 text-red-400" />
            <span>Military Doctrine: {style.name}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Specialize your high-command doctrine tiers using Science to amplify your style’s signature strengths and offset doctrinal weaknesses.
          </p>
        </div>
        <div className="flex items-center gap-5 text-sm font-mono tabular-nums">
          <span className="text-slate-300">
            Mastery:{' '}
            <strong className="text-white">
              {unlockedCount}/{style.upgrades.length}
            </strong>
          </span>
          <span className="text-teal-400 font-semibold">
            Available Science: {state.resources.science}
          </span>
        </div>
      </div>

      {/* Active Combat Style Profile */}
      <section className="p-5 rounded-lg bg-[#141C28] border border-slate-700/80 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          <div className="text-xs font-mono uppercase tracking-wider text-red-400 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            Active High-Command Style
          </div>
          <h3 className="text-lg font-semibold text-white">{style.name}</h3>
          <p className="text-xs text-slate-300 leading-relaxed">{style.summary}</p>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
            Doctrinal Strengths
          </div>
          <div className="space-y-1.5 text-xs">
            {style.pros.map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-emerald-300">
                <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
            Doctrinal Liabilities
          </div>
          <div className="space-y-1.5 text-xs">
            {style.cons.map((c, i) => (
              <div key={i} className="flex items-start gap-2 text-amber-300/90">
                <Minus className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3-Tier Pro Specializations */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-white border-b border-slate-800 pb-2">
          Pro Specialization Tiers
        </h3>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {style.upgrades.map((upg) => {
            const unlocked = state.doctrineUpgrades.includes(upg.id);
            const prevUnlocked =
              upg.tier === 1 ||
              style.upgrades.some(
                (u) =>
                  u.tier === upg.tier - 1 &&
                  state.doctrineUpgrades.includes(u.id)
              );
            const canUpgrade =
              !unlocked && prevUnlocked && state.resources.science >= upg.costScience;

            return (
              <div
                key={upg.id}
                className={`p-5 rounded-lg border flex flex-col justify-between transition-colors ${
                  unlocked
                    ? 'bg-[#13221D] border-emerald-700/60'
                    : prevUnlocked
                    ? 'bg-[#121822] border-slate-700'
                    : 'bg-[#0E131B] border-slate-800/70 opacity-65'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-400 font-mono">
                        Tier {upg.tier} Specialization
                      </div>
                      <h4 className="text-base font-semibold text-white mt-0.5">
                        {upg.name}
                      </h4>
                    </div>
                    {unlocked ? (
                      <span className="text-xs font-medium text-emerald-400 flex items-center gap-1 shrink-0">
                        <Check className="w-3.5 h-3.5" /> Active
                      </span>
                    ) : !prevUnlocked ? (
                      <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0">
                        <Lock className="w-3.5 h-3.5" /> Locked
                      </span>
                    ) : (
                      <span className="text-xs font-mono tabular-nums text-teal-400 shrink-0">
                        {upg.costScience} Sci
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 mt-3 leading-relaxed">
                    {upg.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-3">
                  <div className="text-xs font-medium text-emerald-300 leading-relaxed">
                    {upg.proEffect}
                  </div>
                  {!unlocked && (
                    <button
                      type="button"
                      disabled={!canUpgrade}
                      onClick={() => onUnlockDoctrine(upg.id)}
                      className="w-full py-2 px-3 bg-red-600 hover:bg-red-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                    >
                      {!prevUnlocked
                        ? `Requires Tier ${upg.tier - 1}`
                        : state.resources.science < upg.costScience
                        ? `Need ${upg.costScience} Science`
                        : `Adopt Tier ${upg.tier} (${upg.costScience} Sci)`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
