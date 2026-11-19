import React, { useMemo, useState } from 'react';
import { getScenarioBlocLabel, SCENARIOS } from '../data/scenarios';
import { BLOC_LABELS_2026 } from '../data/worldMap';
import { getActivePlayerId, getLenderOffer } from '../engine/gameEngine';
import { Bloc2026, GameState } from '../types/game';
import {
  AlertTriangle,
  Banknote,
  EyeOff,
  Flame,
  Handshake,
  ScrollText,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Swords,
  Users,
} from 'lucide-react';

interface DiplomacyViewProps {
  state: GameState;
  onSignPact: (nationId: string) => void;
  onFormAlliance: (nationId: string) => void;
  onDeclareWar: (nationId: string) => void;
  onToggleHumanAlly: (targetPlayerId: string) => void;
  onDeclareWarHuman: (targetPlayerId: string) => void;
  onBorrow: (nationId: string) => void;
  onRepayLoan: (loanId: string) => void;
  onDefaultLoan: (loanId: string) => void;
  onCourtNation: (nationId: string) => void;
}

type FilterMode = 'all' | 'allies' | 'friendly' | 'war';

export const DiplomacyView: React.FC<DiplomacyViewProps> = ({
  state,
  onSignPact,
  onFormAlliance,
  onDeclareWar,
  onToggleHumanAlly,
  onDeclareWarHuman,
  onBorrow,
  onRepayLoan,
  onDefaultLoan,
  onCourtNation,
}) => {
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [blocFilter, setBlocFilter] = useState<'all' | Bloc2026>('all');

  const activePlayerId = getActivePlayerId(state);
  const activePlayer = state.players?.[state.activePlayerIndex];
  const scenarioYear = SCENARIOS[state.scenarioId ?? 'modern_2026']?.yearLabel ?? '2026';

  const regionStatsByOwner = useMemo(() => {
    const map: Record<string, { count: number; troops: number }> = {};
    for (const r of Object.values(state.regions)) {
      if (!map[r.ownerId]) map[r.ownerId] = { count: 0, troops: 0 };
      map[r.ownerId].count += 1;
      map[r.ownerId].troops += r.troops;
    }
    return map;
  }, [state.regions]);

  const allNations = useMemo(() => {
    return Object.values(state.nations).sort((a, b) => {
      if (a.eliminated !== b.eliminated) return a.eliminated ? 1 : -1;
      if (Boolean(a.allied) !== Boolean(b.allied)) return a.allied ? -1 : 1;
      if (a.atWar !== b.atWar) return a.atWar ? -1 : 1;
      if (b.relation !== a.relation) return b.relation - a.relation;
      return a.name.localeCompare(b.name);
    });
  }, [state.nations]);

  const alliedCount = useMemo(
    () => allNations.filter((n) => !n.eliminated && n.allied).length,
    [allNations]
  );

  const friendlyCount = useMemo(
    () =>
      allNations.filter(
        (n) => !n.eliminated && !n.atWar && n.relation >= 15
      ).length,
    [allNations]
  );

  const atWarCount = useMemo(
    () => allNations.filter((n) => !n.eliminated && n.atWar).length,
    [allNations]
  );

  const filteredNations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allNations.filter((n) => {
      if (q && !n.name.toLowerCase().includes(q)) return false;
      if (blocFilter !== 'all' && n.bloc2026 !== blocFilter) return false;
      if (filterMode === 'allies') return !n.eliminated && Boolean(n.allied);
      if (filterMode === 'friendly') {
        return !n.eliminated && !n.atWar && n.relation >= 15;
      }
      if (filterMode === 'war') {
        return !n.eliminated && n.atWar;
      }
      return true;
    });
  }, [allNations, blocFilter, filterMode, search]);

  const otherHumans = useMemo(
    () => (state.players ?? []).filter((p) => p.id !== activePlayerId),
    [state.players, activePlayerId]
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <section className="lg:col-span-8 space-y-5">
        {/* Human Commanders Diplomacy (when playing 2-4 Humans) */}
        {otherHumans.length > 0 && activePlayer && (
          <div className="bg-[#121822] border border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                Human Commanders Coalition
              </h2>
              <span className="text-xs text-slate-400">
                Allied commanders join your wars automatically
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {otherHumans.map((h) => {
                const st = regionStatsByOwner[h.id] ?? { count: 0, troops: 0 };
                const isAllied = activePlayer.humanAllies.includes(h.id);
                const isAtWar = activePlayer.humanWars.includes(h.id);
                return (
                  <div
                    key={h.id}
                    className="p-3.5 bg-[#0C1017] border border-slate-800 rounded-md flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: h.color }}
                        />
                        <span className="truncate">{h.name}</span>
                      </div>
                      <div className="text-xs font-mono tabular-nums text-slate-400 mt-0.5">
                        Prov: {st.count} · Forces: {st.troops} ·{' '}
                        <span
                          className={
                            h.eliminated
                              ? 'text-slate-500'
                              : isAtWar
                              ? 'text-red-400 font-semibold'
                              : isAllied
                              ? 'text-emerald-400 font-semibold'
                              : 'text-slate-300'
                          }
                        >
                          {h.eliminated
                            ? 'Eliminated'
                            : isAtWar
                            ? 'At War'
                            : isAllied
                            ? 'Allied'
                            : 'Neutral'}
                        </span>
                      </div>
                    </div>

                    {!h.eliminated && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={!isAllied && state.resources.influence < 15}
                          onClick={() => onToggleHumanAlly(h.id)}
                          className={`px-2.5 py-1.5 text-xs font-medium rounded cursor-pointer disabled:opacity-40 ${
                            isAllied
                              ? 'bg-emerald-800 hover:bg-slate-700 text-white'
                              : 'bg-slate-800 hover:bg-emerald-700 text-slate-100'
                          }`}
                        >
                          {isAllied ? 'Allied' : 'Ally (15 Inf)'}
                        </button>
                        {!isAtWar && (
                          <button
                            type="button"
                            onClick={() => onDeclareWarHuman(h.id)}
                            className="px-2.5 py-1.5 bg-red-800/80 hover:bg-red-600 text-white text-xs font-medium rounded cursor-pointer"
                          >
                            War
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Inter-AI Global Conflicts */}
        {state.aiWars && state.aiWars.length > 0 && (
          <div className="bg-[#121822] border border-slate-800 rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-orange-400" />
                Active Inter-AI Wars ({state.aiWars.length})
              </span>
              <span className="text-slate-400">
                AI nations battle and seize territory each turn
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
              {state.aiWars.slice(0, 8).map(([aId, bId]) => {
                const aName = state.nations[aId]?.name ?? aId;
                const bName = state.nations[bId]?.name ?? bId;
                return (
                  <span key={`${aId}-${bId}`} className="flex items-center gap-1.5">
                    <span className="text-red-300 font-medium">{aName}</span>
                    <span className="text-slate-500">vs</span>
                    <span className="text-amber-300 font-medium">{bName}</span>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        {/* Active Bilateral Loans & Credit Standing */}
        <div className="bg-[#121822] border border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Banknote className="w-4 h-4 text-emerald-400" />
                {scenarioYear} Sovereign Borrowing & Credit Lines
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Nations aligned with your regime (Relation +15 or higher) extend bilateral
                loans based on their GDP tier and {scenarioYear} bloc trust.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-300">
              Active Loans: {state.activeLoans.length}/4
            </span>
          </div>

          {state.creditFreezeTurns > 0 && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded text-xs text-red-200 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>
                Sovereign Credit Freeze active for {state.creditFreezeTurns} more turn(s)
                due to default or attacking a creditor.
              </span>
            </div>
          )}

          {state.activeLoans.length === 0 ? (
            <div className="text-xs text-slate-400 py-1">
              {state.phase === 'UNDERGROUND'
                ? `Underground cells cannot sign sovereign loans. Launch your coup first to unlock ${scenarioYear} bloc credit.`
                : 'No active foreign loans. Filter by "On Your Side" below to borrow from sympathetic nations.'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {state.activeLoans.map((loan) => {
                const canRepay = state.resources.funds >= loan.remaining;
                return (
                  <div
                    key={loan.id}
                    className="p-3.5 bg-[#0C1017] border border-slate-800 rounded-md space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-white">
                          {loan.lenderName}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {getScenarioBlocLabel(state.scenarioId, loan.bloc2026)}
                        </div>
                      </div>
                      <span className="text-xs font-mono text-amber-300">
                        {loan.turnsLeft}t left
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-300">
                      <span>Remaining: ${loan.remaining}</span>
                      <span>{(loan.interestRate * 100).toFixed(1)}%/turn</span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!canRepay}
                        onClick={() => onRepayLoan(loan.id)}
                        className="flex-1 py-1.5 px-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-medium rounded cursor-pointer"
                      >
                        Repay (${loan.remaining})
                      </button>
                      <button
                        type="button"
                        onClick={() => onDefaultLoan(loan.id)}
                        title="Refuse repayment: triggers war with lender and freezes credit for 5 turns"
                        className="py-1.5 px-2.5 bg-slate-800 hover:bg-red-700 text-slate-200 text-xs font-medium rounded cursor-pointer"
                      >
                        Default
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 197 World Nations Directory */}
        <div className="space-y-3">
          <div className="border-b border-slate-800 pb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold text-white">
                World Nations ({allNations.length})
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {state.phase === 'UNDERGROUND'
                  ? 'While your cell remains Underground, sovereign countries are unaware of your existence.'
                  : 'Form Military Alliances so partners answer your war calls, sign pacts, or declare war.'}
              </p>
            </div>
          </div>

          {state.phase === 'UNDERGROUND' && (
            <div className="p-4 bg-[#121822] border border-teal-800/50 rounded-lg text-xs text-teal-200 flex items-start gap-2.5">
              <EyeOff className="w-4 h-4 text-teal-400 shrink-0 mt-0.5" />
              <span>
                Diplomacy & sovereign borrowing are locked during the Underground Phase
                (Suspicion: {state.suspicion}%). Launch your uprising (or play Blitz Mode)
                to engage in full geopolitics.
              </span>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search 197 countries..."
                className="w-full bg-[#121822] border border-slate-800 rounded-md pl-8 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-slate-600"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 bg-[#121822] border border-slate-800 rounded-md p-1 text-xs">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-2.5 py-1 rounded whitespace-nowrap cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-red-600 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                All ({allNations.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('allies')}
                className={`px-2.5 py-1 rounded whitespace-nowrap cursor-pointer ${
                  filterMode === 'allies'
                    ? 'bg-sky-700 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Allies ({alliedCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('friendly')}
                className={`px-2.5 py-1 rounded whitespace-nowrap cursor-pointer ${
                  filterMode === 'friendly'
                    ? 'bg-emerald-700 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                On Your Side ({friendlyCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('war')}
                className={`px-2.5 py-1 rounded whitespace-nowrap cursor-pointer ${
                  filterMode === 'war'
                    ? 'bg-amber-700 text-white font-medium'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                At War ({atWarCount})
              </button>
            </div>

            <select
              value={blocFilter}
              onChange={(e) => setBlocFilter(e.target.value as 'all' | Bloc2026)}
              className="bg-[#121822] border border-slate-800 rounded-md px-2.5 py-2 text-xs text-slate-200"
            >
              <option value="all">All {scenarioYear} Blocs</option>
              {(Object.keys(BLOC_LABELS_2026) as Bloc2026[]).map((b) => (
                <option key={b} value={b}>
                  {getScenarioBlocLabel(state.scenarioId, b)}
                </option>
              ))}
            </select>
          </div>

          {/* Nation List */}
          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
            {filteredNations.length === 0 ? (
              <div className="p-6 bg-[#121822] border border-slate-800 rounded-lg text-center text-xs text-slate-400">
                No countries match your current search or filter.
              </div>
            ) : (
              filteredNations.map((nation) => {
                const stats = regionStatsByOwner[nation.id] ?? { count: 0, troops: 0 };
                const offer = getLenderOffer(state, nation);
                const canPact =
                  state.phase === 'EXPOSED' &&
                  !nation.eliminated &&
                  nation.pactTurns === 0 &&
                  state.resources.influence >= 16 &&
                  state.resources.funds - 50 >= -120;
                const canAlly =
                  state.phase === 'EXPOSED' &&
                  !nation.eliminated &&
                  !nation.atWar &&
                  !nation.allied &&
                  nation.relation >= 40 &&
                  state.resources.influence >= 24 &&
                  state.resources.funds - 70 >= -120;
                const canCourt =
                  state.phase === 'EXPOSED' &&
                  !nation.eliminated &&
                  !nation.atWar &&
                  nation.relation < 100 &&
                  state.resources.influence >= 10;

                return (
                  <div
                    key={nation.id}
                    className={`p-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      nation.eliminated
                        ? 'bg-[#0E131B] border-slate-800/60 opacity-45'
                        : 'bg-[#121822] border-slate-800'
                    }`}
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-sm shrink-0"
                          style={{ backgroundColor: nation.color }}
                        />
                        <h3 className="text-sm font-semibold text-white truncate">
                          {nation.name}
                        </h3>
                        <span className="text-[11px] text-slate-400">
                          · {getScenarioBlocLabel(state.scenarioId, nation.bloc2026)} · Tier {nation.gdpTier}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono tabular-nums text-slate-300">
                        {nation.eliminated ? (
                          <span className="text-slate-500 font-sans">
                            Government Toppled
                          </span>
                        ) : (
                          <>
                            <span>Prov: {stats.count}</span>
                            <span className="text-slate-600">·</span>
                            <span>Forces: {stats.troops}</span>
                            <span className="text-slate-600">·</span>
                            <span
                              className={
                                state.phase === 'UNDERGROUND'
                                  ? 'text-teal-400 font-sans'
                                  : nation.atWar
                                  ? 'text-red-400 font-sans font-semibold flex items-center gap-1'
                                  : nation.allied
                                  ? 'text-sky-400 font-sans font-semibold flex items-center gap-1'
                                  : nation.pactTurns > 0
                                  ? 'text-emerald-400 font-sans font-medium flex items-center gap-1'
                                  : nation.relation >= 15
                                  ? 'text-emerald-300 font-sans font-medium'
                                  : 'text-slate-400 font-sans'
                              }
                            >
                              {state.phase === 'UNDERGROUND' ? (
                                'Unaware'
                              ) : nation.atWar ? (
                                <>
                                  <Swords className="w-3.5 h-3.5" /> At War
                                </>
                              ) : nation.allied ? (
                                <>
                                  <Shield className="w-3.5 h-3.5" /> Allied (+
                                  {nation.relation})
                                </>
                              ) : nation.pactTurns > 0 ? (
                                <>
                                  <Handshake className="w-3.5 h-3.5" /> Pact (
                                  {nation.pactTurns}t)
                                </>
                              ) : nation.relation >= 15 ? (
                                `Friendly (${
                                  nation.relation >= 0
                                    ? `+${nation.relation}`
                                    : nation.relation
                                })`
                              ) : (
                                `Wary (${nation.relation})`
                              )}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span className="text-amber-400/90 font-sans flex items-center gap-1">
                              <ShieldAlert className="w-3.5 h-3.5" />
                              Betrayal:{' '}
                              {nation.betrayalTendency >= 0.45
                                ? 'High'
                                : nation.betrayalTendency >= 0.35
                                ? 'Med'
                                : 'Low'}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {!nation.eliminated && state.phase === 'EXPOSED' && (
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={!offer.eligible}
                          onClick={() => onBorrow(nation.id)}
                          title={
                            offer.alreadyBorrowing
                              ? 'Active loan already open with this country'
                              : nation.relation < 15
                              ? 'Requires Relation +15 or higher to borrow'
                              : state.creditFreezeTurns > 0
                              ? 'Credit frozen after default'
                              : `Borrow $${offer.maxAmount} over 8 turns`
                          }
                          className="px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-800 disabled:opacity-40 text-white text-xs font-mono rounded transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {offer.alreadyBorrowing
                            ? 'Loan Active'
                            : `Borrow $${offer.maxAmount} (${(
                                offer.interestRate * 100
                              ).toFixed(1)}%)`}
                        </button>

                        {!nation.atWar && (
                          <button
                            type="button"
                            disabled={!canCourt}
                            onClick={() => onCourtNation(nation.id)}
                            title="Send Envoy: +22 Relation (10 Influence)"
                            className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-medium rounded flex items-center gap-1 whitespace-nowrap cursor-pointer"
                          >
                            <Send className="w-3 h-3 text-sky-400" />
                            Envoy
                          </button>
                        )}

                        {!nation.atWar && !nation.allied && (
                          <button
                            type="button"
                            disabled={!canAlly}
                            onClick={() => onFormAlliance(nation.id)}
                            title="Form Military Alliance (Req: +40 Relation · $70 · 24 Inf). Allies may join your wars!"
                            className="px-2.5 py-1.5 bg-sky-800 hover:bg-sky-700 disabled:bg-slate-800 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Ally ($70 · 24 Inf)
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={!canPact || nation.pactTurns > 0}
                          onClick={() => onSignPact(nation.id)}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer"
                        >
                          {nation.pactTurns > 0
                            ? `Pact (${nation.pactTurns}t)`
                            : 'Pact ($50 · 16 Inf)'}
                        </button>

                        {!nation.atWar && (
                          <button
                            type="button"
                            onClick={() => onDeclareWar(nation.id)}
                            title="Declare War — Calls your Military Allies to arms!"
                            className="px-2.5 py-1.5 bg-red-800/80 hover:bg-red-600 text-white text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer"
                          >
                            Declare War
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      <section className="lg:col-span-4 bg-[#121822] border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <ScrollText className="w-4 h-4 text-slate-400" />
            Campaign Chronicle
          </h2>
          <span className="text-xs font-mono text-slate-400">
            Last {state.logs.length} dispatches
          </span>
        </div>

        <div className="space-y-2.5 max-h-[680px] overflow-y-auto pr-1">
          {state.logs.map((entry) => (
            <div
              key={entry.id}
              className="py-2 border-b border-slate-800/60 last:border-b-0 text-xs leading-relaxed"
            >
              <span className="font-mono text-slate-500 mr-2">T{entry.turn}</span>
              <span
                className={
                  entry.type === 'revolt' || entry.type === 'event'
                    ? 'text-amber-300'
                    : entry.type === 'war'
                    ? 'text-red-300'
                    : entry.type === 'tech'
                    ? 'text-teal-300'
                    : entry.type === 'politics'
                    ? 'text-sky-300'
                    : entry.type === 'diplomacy'
                    ? 'text-purple-300'
                    : 'text-slate-300'
                }
              >
                {entry.message}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
