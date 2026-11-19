import React from 'react';
import { BattleReport } from '../types/game';
import { ShieldCheck, Skull, Swords } from 'lucide-react';

interface BattleModalProps {
  report: BattleReport;
  onClose: () => void;
}

export const BattleModal: React.FC<BattleModalProps> = ({ report, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#121822] border border-slate-700 rounded-lg max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-400 flex items-center gap-1.5">
              <Swords className="w-3.5 h-3.5 text-red-400" />
              <span>Turn {report.turn} Combat Report · {report.regionName}</span>
            </div>
            <h2
              className={`text-2xl font-bold mt-1 ${
                report.playerWon ? 'text-emerald-400' : 'text-red-400'
              }`}
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {report.playerWon
                ? report.captured
                  ? 'Territory Captured'
                  : 'Defense Held'
                : report.playerWasAttacker
                ? 'Offensive Repulsed'
                : 'Garrison Overrun'}
            </h2>
          </div>

          {report.playerWon ? (
            <ShieldCheck className="w-7 h-7 text-emerald-400 shrink-0" />
          ) : (
            <Skull className="w-7 h-7 text-red-400 shrink-0" />
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums">
          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded">
            <div className="font-sans text-slate-400 truncate">
              {report.attackerLabel}
            </div>
            <div className="text-white text-base font-semibold mt-1">
              {report.attackerInitial} Regiments
            </div>
            <div className="text-red-400 mt-0.5">-{report.attackerLosses} Lost</div>
          </div>
          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded">
            <div className="font-sans text-slate-400 truncate">
              {report.defenderLabel}
            </div>
            <div className="text-white text-base font-semibold mt-1">
              {report.defenderInitial} Regiments
            </div>
            <div className="text-red-400 mt-0.5">-{report.defenderLosses} Lost</div>
          </div>
        </div>

        {report.modifiers.length > 0 && (
          <div className="space-y-1.5 border-t border-slate-800 pt-3 text-xs">
            <div className="text-slate-400 font-medium">Active Tactical Modifiers</div>
            {report.modifiers.map((m, idx) => (
              <div key={idx} className="flex justify-between">
                <span className="text-slate-300">{m.label}</span>
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
          onClick={onClose}
          className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
        >
          Acknowledge Report
        </button>
      </div>
    </div>
  );
};
