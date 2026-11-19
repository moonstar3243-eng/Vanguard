import React from 'react';
import { BUILDINGS } from '../data/techAndBuildings';
import { getActivePlayerId, getBuildingCost, getPlayerRegions } from '../engine/gameEngine';
import { BuildingType, GameState, NetIncome, TaxPolicy } from '../types/game';
import { Banknote, Factory, ShieldAlert } from 'lucide-react';

interface IndustryViewProps {
  state: GameState;
  net: NetIncome;
  onSetTaxPolicy: (policy: TaxPolicy) => void;
  onTakeLoan: () => void;
  onBuild: (regionId: string, bType: BuildingType) => void;
  onPacify: (regionId: string) => void;
  onRepayLoan: (loanId: string) => void;
  onDefaultLoan: (loanId: string) => void;
}

export const IndustryView: React.FC<IndustryViewProps> = ({
  state,
  net,
  onSetTaxPolicy,
  onTakeLoan,
  onBuild,
  onPacify,
  onRepayLoan,
  onDefaultLoan,
}) => {
  const owned = getPlayerRegions(state);
  const managedRegions =
    owned.length > 0
      ? owned
      : state.regions[state.cellRegionId]
      ? [state.regions[state.cellRegionId]]
      : [];

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <section className="lg:col-span-7 bg-[#121822] border border-slate-800 rounded-lg p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Factory className="w-5 h-5 text-slate-400" />
              Treasury & Supply Ledger
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              {owned.length > 0
                ? `${owned.length} Controlled Provinces`
                : 'Underground Cell Network'}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-xs font-mono tabular-nums">
            <div>
              <div className="font-sans text-slate-400">Net Funds / Turn</div>
              <div
                className={`text-lg font-semibold mt-1 ${
                  net.funds >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {net.funds >= 0 ? `+$${net.funds}` : `-$${Math.abs(net.funds)}`}
              </div>
            </div>
            <div>
              <div className="font-sans text-slate-400">Army Upkeep</div>
              <div className="text-lg font-semibold text-slate-200 mt-1">
                -${net.armyUpkeepFunds} · -{net.armyUpkeepMaterials}St
              </div>
            </div>
            <div>
              <div className="font-sans text-slate-400">Upkeep (Bldg/Unit)</div>
              <div className="text-lg font-semibold text-slate-200 mt-1">
                -${net.buildingUpkeepFunds} · -{net.buildingUpkeepEnergy + net.armyUpkeepEnergy}Fl
              </div>
            </div>
            <div>
              <div className="font-sans text-slate-400">Debt Interest</div>
              <div
                className={`text-lg font-semibold mt-1 ${
                  net.debtInterest > 0 ? 'text-red-400' : 'text-slate-400'
                }`}
              >
                -${net.debtInterest}
              </div>
            </div>
            <div>
              <div className="font-sans text-slate-400">Bilateral Loans</div>
              <div
                className={`text-lg font-semibold mt-1 ${
                  net.loanService > 0 ? 'text-amber-400' : 'text-slate-400'
                }`}
              >
                -${net.loanService}
              </div>
            </div>
          </div>

          {state.activeLoans.length > 0 && (
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-slate-300">
                Active Foreign Loans ({state.activeLoans.length}/4)
              </div>
              <div className="space-y-1.5">
                {state.activeLoans.map((loan) => (
                  <div
                    key={loan.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-[#0C1017] border border-slate-800 rounded text-xs"
                  >
                    <div className="font-mono tabular-nums text-slate-300">
                      <span className="font-sans font-semibold text-white mr-2">
                        {loan.lenderName}
                      </span>
                      ${loan.remaining} left · {(loan.interestRate * 100).toFixed(1)}%/t ·{' '}
                      {loan.turnsLeft}t
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={state.resources.funds < loan.remaining}
                        onClick={() => onRepayLoan(loan.id)}
                        className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white rounded text-[11px] font-medium cursor-pointer"
                      >
                        Repay
                      </button>
                      <button
                        type="button"
                        onClick={() => onDefaultLoan(loan.id)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-red-700 text-slate-200 rounded text-[11px] font-medium cursor-pointer"
                      >
                        Default
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {state.productionDebuffTurns > 0 && (
            <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded text-xs text-amber-200 flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Supply Disruption Active: Factory output reduced by 25% for{' '}
                {state.productionDebuffTurns} more turn(s).
              </span>
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-[#121822] border border-slate-800 rounded-lg p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-white">National Taxation Policy</h3>
            <div className="mt-2.5 grid grid-cols-3 gap-1.5 p-1 bg-[#0C1017] rounded-md border border-slate-800">
              {(['Low', 'Standard', 'War'] as TaxPolicy[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onSetTaxPolicy(p)}
                  className={`py-2 px-2 text-xs font-medium rounded transition-colors whitespace-nowrap cursor-pointer ${
                    state.taxPolicy === p
                      ? 'bg-red-600 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {p === 'War' ? 'War Taxes' : p}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {state.taxPolicy === 'Low' && '80% Tax Revenue · -3% Unrest/turn.'}
              {state.taxPolicy === 'Standard' && '100% Tax Revenue · +1% baseline Unrest/turn.'}
              {state.taxPolicy === 'War' && '135% Tax Revenue · +5% Unrest/turn & -Civic Loyalty.'}
            </p>
          </div>

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                <Banknote className="w-4 h-4 text-amber-400" />
                Black-Market Credit
              </div>
              <div className="text-xs text-slate-400 mt-0.5">
                Gain +$120 Funds immediately (-8 Influence). Visit Diplomacy to borrow from friendly 2026 nations.
              </div>
            </div>
            <button
              type="button"
              disabled={state.loanCooldown > 0}
              onClick={onTakeLoan}
              className="px-3.5 py-2 bg-slate-800 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              {state.loanCooldown > 0 ? `Cooldown (${state.loanCooldown}t)` : 'Draw Loan'}
            </button>
          </div>
        </section>
      </div>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between border-b border-slate-800 pb-3">
          <h2 className="text-lg font-semibold text-white">
            Regional Factories & Stability
          </h2>
          <span className="text-xs text-slate-400">
            Build Munitions Mills for Steel, Power Grids for Fuel, and Exchanges for Funds
          </span>
        </div>

        <div className="bg-[#121822] border border-slate-800 rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 font-medium">
                <th className="py-3 px-4">Province</th>
                <th className="py-3 px-3 font-mono">Troops</th>
                <th className="py-3 px-3 font-mono">Unrest</th>
                <th className="py-3 px-3">Steel Mill</th>
                <th className="py-3 px-3">Power Grid</th>
                <th className="py-3 px-3">Tax Hub</th>
                <th className="py-3 px-3">Lab</th>
                <th className="py-3 px-3">Broadcast</th>
                <th className="py-3 px-3">Fortress</th>
                <th className="py-3 px-4 text-right">Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {managedRegions.map((reg) => {
                const isCell = reg.ownerId !== getActivePlayerId(state);
                const buildCell = (bType: BuildingType, label: string) => {
                  const cost = getBuildingCost(state, bType, reg);
                  const blockedFort = isCell && bType === 'fortress';
                  const canAfford =
                    !blockedFort &&
                    state.resources.materials >= cost.materials &&
                    state.resources.funds - cost.funds >= -200;
                  return (
                    <td className="py-3 px-3 font-mono tabular-nums">
                      <button
                        type="button"
                        disabled={!canAfford}
                        onClick={() => onBuild(reg.id, bType)}
                        title={`${BUILDINGS[bType].name}: $${cost.funds}, ${cost.materials} Steel`}
                        className="px-2 py-1 bg-[#0C1017] hover:bg-red-600/80 disabled:opacity-35 border border-slate-800 rounded text-slate-200 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        {label} ×{reg.buildings[bType] ?? 0} (+)
                      </button>
                    </td>
                  );
                };

                return (
                  <tr key={reg.id} className="hover:bg-[#171F2C]/60">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">
                        {reg.name} {isCell ? '(Cell)' : ''}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {reg.continent} · {reg.terrain}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums text-white">
                      {isCell ? state.undergroundTroops : reg.troops}
                    </td>
                    <td className="py-3 px-3 font-mono tabular-nums">
                      <span
                        className={
                          reg.unrest >= 70
                            ? 'text-red-400 font-semibold'
                            : reg.unrest >= 45
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }
                      >
                        {reg.unrest}%
                      </span>
                    </td>
                    {buildCell('workshop', 'St')}
                    {buildCell('refinery', 'Fl')}
                    {buildCell('bank', '$')}
                    {buildCell('lab', 'Sci')}
                    {buildCell('propaganda', 'Inf')}
                    {buildCell('fortress', 'Def')}
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        disabled={
                          isCell || reg.unrest <= 0 || state.resources.influence < 8
                        }
                        onClick={() => onPacify(reg.id)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-emerald-700 disabled:opacity-35 text-white rounded text-xs font-medium whitespace-nowrap cursor-pointer"
                      >
                        Pacify
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
