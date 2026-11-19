import React from 'react';
import { EventChoice, WorldEvent } from '../types/game';
import { AlertOctagon } from 'lucide-react';

interface EventModalProps {
  event: WorldEvent;
  onChoose: (choice: EventChoice) => void;
}

export const EventModal: React.FC<EventModalProps> = ({ event, onChoose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#121822] border border-slate-700 rounded-lg max-w-lg w-full p-6 space-y-5 shadow-2xl">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-400">
            <AlertOctagon className="w-4 h-4" />
            <span>World Event · {event.category}</span>
          </div>
          <h2
            className="text-2xl font-bold text-white tracking-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {event.title}
          </h2>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">{event.description}</p>

        <div className="space-y-2.5 pt-2">
          {event.choices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              onClick={() => onChoose(choice)}
              className="w-full text-left p-3.5 bg-[#0C1017] hover:bg-[#192231] border border-slate-700 hover:border-slate-500 rounded-md transition-colors cursor-pointer"
            >
              <div className="text-sm font-semibold text-white">{choice.label}</div>
              <div className="text-xs text-slate-400 mt-1 font-mono">
                {choice.effectHint}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
