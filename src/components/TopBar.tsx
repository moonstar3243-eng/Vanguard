import React from 'react';
import { ActiveTab } from '../types/game';

interface TopBarProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  onEndTurn: () => void;
  disabledEndTurn: boolean;
  endTurnLabel?: string;
}

const NAV_TABS: Array<{ id: ActiveTab; label: string }> = [
  { id: 'MAP', label: 'World Map' },
  { id: 'INDUSTRY', label: 'Industry' },
  { id: 'RESEARCH', label: 'Research' },
  { id: 'DOCTRINE', label: 'Doctrine' },
  { id: 'POLITICS', label: 'Politics' },
  { id: 'DIPLOMACY', label: 'Diplomacy' },
];

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  onSelectTab,
  onEndTurn,
  disabledEndTurn,
  endTurnLabel = 'End Turn',
}) => {
  return (
    <header className="h-14 bg-[#101620] border-b border-slate-800 px-6 flex items-center justify-between gap-6 shrink-0">
      <span
        className="text-2xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        style={{ fontFamily: 'var(--font-display)' }}
      >
        Vanguard
      </span>

      <nav className="flex items-center gap-5 overflow-x-auto">
        {NAV_TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelectTab(tab.id)}
              className={`py-1.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                isActive
                  ? 'text-white border-red-500'
                  : 'text-slate-400 border-transparent hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={onEndTurn}
        disabled={disabledEndTurn}
        className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-400 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        {endTurnLabel}
      </button>
    </header>
  );
};
