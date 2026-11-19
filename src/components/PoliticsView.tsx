import React from 'react';
import { IDEOLOGIES, POLICIES } from '../data/techAndBuildings';
import {
  FactionLoyalty,
  GameState,
  IdeologyId,
  PolicyId,
} from '../types/game';
import { Check, Landmark, ShieldCheck, Users } from 'lucide-react';

interface PoliticsViewProps {
  state: GameState;
  onSwitchIdeology: (id: IdeologyId) => void;
  onTogglePolicy: (id: PolicyId) => void;
  onAppeaseFaction: (pillar: keyof FactionLoyalty) => void;
}

const PILLAR_META: Array<{
  key: keyof FactionLoyalty;
  label: string;
  desc: string;
}> = [
  {
    key: 'military',
    label: 'Military Command',
    desc: 'Generals & frontline officers. Boosted by victories and Military Junta doctrine.',
  },
  {
    key: 'industry',
    label: 'Industrial Syndicates',
    desc: 'Factory directors & trade unions. Drops if Treasury remains deep in debt.',
  },
  {
    key: 'civic',
    label: 'Civic Assembly',
    desc: 'Local councils & citizens. Drops under War Taxes, Conscription, or Martial Law.',
  },
];

export const PoliticsView: React.FC<PoliticsViewProps> = ({
  state,
  onSwitchIdeology,
  onTogglePolicy,
  onAppeaseFaction,
}) => {
  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
      {/* Section 1: Internal Factions */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-400" />
              Regime Stability & Power Pillars
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Keep loyalty above 35% across all three pillars to prevent cabinet walkouts
              and political crises.
            </p>
          </div>
          <span className="text-xs font-mono text-purple-300">
            Influence Available: {state.resources.influence}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PILLAR_META.map((pillar) => {
            const val = state.factionLoyalty[pillar.key];
            const critical = val < 35;
            return (
              <div
                key={pillar.key}
                className="bg-[#121822] border border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">
                      {pillar.label}
                    </h3>
                    <span
                      className={`text-sm font-mono font-semibold tabular-nums ${
                        critical
                          ? 'text-red-400'
                          : val >= 65
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {val}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-[#0C1017] rounded overflow-hidden mt-2">
                    <div
                      className={`h-full transition-all duration-200 ${
                        critical
                          ? 'bg-red-500'
                          : val >= 65
                          ? 'bg-emerald-500'
                          : 'bg-amber-500'
                      }`}
                      style={{ width: `${val}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-400 mt-3 leading-relaxed">
                    {pillar.desc}
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    val >= 100 ||
                    state.resources.funds < 45 ||
                    state.resources.influence < 8
                  }
                  onClick={() => onAppeaseFaction(pillar.key)}
                  className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors cursor-pointer"
                >
                  Grant Concessions (+18% · $45 · 8 Inf)
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 2: Governance Ideology */}
      <section className="space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Landmark className="w-5 h-5 text-slate-400" />
            Governance Ideology
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Reshape your revolutionary state apparatus. Switching doctrine shifts faction
            loyalties and costs 22 Influence.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(Object.keys(IDEOLOGIES) as IdeologyId[]).map((id) => {
            const def = IDEOLOGIES[id];
            const active = state.ideology === id;
            return (
              <div
                key={id}
                className={`p-5 rounded-lg border flex flex-col justify-between gap-4 ${
                  active
                    ? 'bg-[#171F2C] border-red-500/80'
                    : 'bg-[#121822] border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-base font-semibold text-white">{def.name}</h3>
                    {active && (
                      <span className="text-xs font-medium text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    {def.summary}
                  </p>
                  <div className="mt-3 text-xs font-medium text-amber-300/90">
                    {def.effectsText}
                  </div>
                </div>

                {!active && (
                  <button
                    type="button"
                    disabled={state.resources.influence < def.switchInfluenceCost}
                    onClick={() => onSwitchIdeology(id)}
                    className="py-2 px-3 bg-slate-800 hover:bg-red-600 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors self-start cursor-pointer"
                  >
                    Adopt Doctrine ({def.switchInfluenceCost} Inf)
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3: Active Edicts & Laws */}
      <section className="space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-slate-400" />
            Political Edicts & Laws
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Toggle active state decrees to suppress Suspicion, curb revolts, or slash
            recruitment costs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(POLICIES) as PolicyId[]).map((pId) => {
            const p = POLICIES[pId];
            const active = state.activePolicies.includes(pId);
            const phaseBlocked = Boolean(p.minPhase && p.minPhase !== state.phase);

            return (
              <div
                key={pId}
                className={`p-4 rounded-lg border flex flex-col justify-between gap-4 ${
                  active
                    ? 'bg-[#13221D] border-emerald-700/70'
                    : phaseBlocked
                    ? 'bg-[#0E131B] border-slate-800/60 opacity-50'
                    : 'bg-[#121822] border-slate-800'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-white">{p.name}</h3>
                    <span className="text-[11px] font-mono text-slate-400">
                      ${p.upkeepFunds}/t · {p.upkeepInfluence} Inf/t
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                    {p.description}
                  </p>
                  <div className="mt-2.5 text-xs text-amber-300/90 font-medium">
                    {p.effectSummary}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={phaseBlocked}
                  onClick={() => onTogglePolicy(pId)}
                  className={`w-full py-2 px-3 text-xs font-semibold rounded transition-colors cursor-pointer ${
                    active
                      ? 'bg-emerald-700 hover:bg-emerald-600 text-white'
                      : 'bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200'
                  }`}
                >
                  {phaseBlocked
                    ? `Requires ${p.minPhase === 'UNDERGROUND' ? 'Underground' : 'Exposed'} Phase`
                    : active
                    ? 'Repeal Edict'
                    : 'Enact Edict'}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
