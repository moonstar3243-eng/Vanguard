import React from 'react';
import { GameState } from '../types/game';
import { Award, Skull } from 'lucide-react';

interface EndScreenProps {
  state: GameState;
  onPlayAgain: () => void;
}

export const EndScreen: React.FC<EndScreenProps> = ({ state, onPlayAgain }) => {
  const isVictory = state.mode === 'VICTORY';
  const winnerPlayer = state.winnerPlayerId
    ? state.players?.find((p) => p.id === state.winnerPlayerId)
    : state.players?.[state.activePlayerIndex];

  return (
    <div className="min-h-screen bg-[#0C1017] text-[#EEF2F6] flex items-center justify-center p-6">
      <div className="bg-[#121822] border border-slate-800 rounded-lg max-w-xl w-full p-8 space-y-6">
        <div className="flex items-center gap-3">
          {isVictory ? (
            <Award className="w-9 h-9 text-amber-400 shrink-0" />
          ) : (
            <Skull className="w-9 h-9 text-red-500 shrink-0" />
          )}
          <div>
            <div className="text-xs text-slate-400 font-mono">
              Campaign Concluded · Turn {state.turn} ·{' '}
              {state.gameVariant === 'BLITZ' ? 'Blitz Mode' : 'Classic Mode'}
            </div>
            <h1
              className="text-4xl font-bold text-white tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {isVictory
                ? state.players && state.players.length > 1 && winnerPlayer
                  ? `${winnerPlayer.name} Claims Hegemony`
                  : 'Global Hegemony Achieved'
                : 'Revolution Extinguished'}
            </h1>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">
          {isVictory
            ? `${winnerPlayer?.name ?? 'Your command'} outlasted rival coalitions, disasters, and global wars across ${Object.keys(state.regions).length} provinces and 197 nations.`
            : 'Your final stronghold fell under foreign counter-offensives and internal collapse. Regroup and adapt your industrial, political, and covert strategy.'}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded">
            <div className="font-sans text-slate-400">Battles Won</div>
            <div className="text-lg font-semibold text-emerald-400 mt-1">
              {state.stats.battlesWon}
            </div>
          </div>
          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded">
            <div className="font-sans text-slate-400">Battles Lost</div>
            <div className="text-lg font-semibold text-red-400 mt-1">
              {state.stats.battlesLost}
            </div>
          </div>
          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded">
            <div className="font-sans text-slate-400">Revolts Faced</div>
            <div className="text-lg font-semibold text-amber-400 mt-1">
              {state.stats.revoltsFaced}
            </div>
          </div>
          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded">
            <div className="font-sans text-slate-400">Peak Debt</div>
            <div className="text-lg font-semibold text-white mt-1">
              ${Math.abs(state.stats.peakDebt)}
            </div>
          </div>
          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded">
            <div className="font-sans text-slate-400">Factories Built</div>
            <div className="text-lg font-semibold text-white mt-1">
              {state.stats.factoriesBuilt}
            </div>
          </div>
          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded">
            <div className="font-sans text-slate-400">Techs Researched</div>
            <div className="text-lg font-semibold text-teal-400 mt-1">
              {state.stats.techsUnlocked}
            </div>
          </div>
          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded">
            <div className="font-sans text-slate-400">Backstabs</div>
            <div className="text-lg font-semibold text-purple-400 mt-1">
              {state.stats.backstabsSurvived}
            </div>
          </div>
          <div className="p-3 bg-[#0C1017] border border-slate-800 rounded">
            <div className="font-sans text-slate-400">Disasters</div>
            <div className="text-lg font-semibold text-slate-200 mt-1">
              {state.stats.disastersEndured}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onPlayAgain}
          className="w-full py-3 px-4 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-md transition-colors cursor-pointer"
        >
          Play Again
        </button>
      </div>
    </div>
  );
};
