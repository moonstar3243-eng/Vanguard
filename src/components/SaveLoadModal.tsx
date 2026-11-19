import React, { useRef, useState } from 'react';
import { SCENARIOS } from '../data/scenarios';
import { GameState, SaveSlotMeta } from '../types/game';
import {
  AUTOSAVE_SLOT_ID,
  deleteSaveSlot,
  exportSaveToJson,
  listSaveSlots,
  loadFromSlot,
  MANUAL_SLOT_IDS,
  parseImportedSaveJson,
  saveToSlot,
} from '../utils/saveSystem';
import {
  Download,
  FolderOpen,
  HardDrive,
  Save,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

interface SaveLoadModalProps {
  currentState: GameState | null;
  onLoadState: (loaded: GameState) => void;
  onClose: () => void;
}

export const SaveLoadModal: React.FC<SaveLoadModalProps> = ({
  currentState,
  onLoadState,
  onClose,
}) => {
  const [slots, setSlots] = useState<SaveSlotMeta[]>(() => listSaveSlots());
  const [customName, setCustomName] = useState<string>(() => {
    if (!currentState) return '';
    const activeName =
      currentState.players?.[currentState.activePlayerIndex]?.name ?? 'Commander 1';
    const scenarioYear =
      SCENARIOS[currentState.scenarioId ?? 'modern_2026']?.yearLabel ?? '2026';
    const mode =
      currentState.gameVariant === 'BLITZ' ? `Blitz ${scenarioYear}` : 'Classic';
    return `${mode} · ${activeName} · T${currentState.turn}`;
  });
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canSaveHere =
    Boolean(currentState) &&
    currentState?.mode === 'PLAYING' &&
    currentState?.multiplayerType !== 'ONLINE';

  const handleSaveSlot = (slotId: string) => {
    if (!currentState || !canSaveHere) return;
    const res = saveToSlot(slotId, currentState, customName);
    setSlots(res.slots);
    setNotice(
      res.ok
        ? `Saved campaign to ${slotId.replace('_', ' ').toUpperCase()}.`
        : 'Storage full — try exporting a JSON backup.'
    );
  };

  const handleLoadSlot = (slotId: string) => {
    const loaded = loadFromSlot(slotId);
    if (!loaded) {
      setNotice('Could not read saved campaign data.');
      return;
    }
    onLoadState(loaded);
    onClose();
  };

  const handleDeleteSlot = (slotId: string) => {
    const next = deleteSaveSlot(slotId);
    setSlots(next);
    setNotice('Deleted save slot.');
  };

  const handleExport = () => {
    if (!currentState) return;
    exportSaveToJson(currentState, customName || undefined);
    setNotice('Exported campaign JSON file.');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseImportedSaveJson(text);
      if (!parsed) {
        setNotice('Invalid save file format.');
        return;
      }
      const next = saveToSlot('slot_1', parsed, file.name.replace(/\.json$/i, ''));
      setSlots(next.slots);
      onLoadState(parsed);
      onClose();
    } catch {
      setNotice('Failed to read selected file.');
    } finally {
      e.target.value = '';
    }
  };

  const autosaveMeta = slots.find((s) => s.id === AUTOSAVE_SLOT_ID);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Campaign Save & Load Manager"
    >
      <div className="bg-[#121822] border border-slate-700/80 rounded-lg max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <HardDrive className="w-5 h-5 text-red-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">
                Campaign Save & Load
              </h2>
              <p className="text-xs text-slate-400">
                Store up to 5 named slots locally or export/import portable JSON backups
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close save manager"
            className="p-2 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {notice && (
            <div className="px-3.5 py-2 bg-[#0C1017] border border-slate-700 rounded text-xs text-emerald-300">
              {notice}
            </div>
          )}

          {currentState?.multiplayerType === 'ONLINE' && (
            <div className="px-3.5 py-2.5 bg-[#0C1017] border border-amber-800/60 rounded text-xs text-amber-300">
              Online room games are synchronized live on the server. You can export a local JSON snapshot for offline review or solo continuation.
            </div>
          )}

          {/* Save Label + File Export/Import Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            {canSaveHere && (
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Save slot label..."
                className="flex-1 min-w-[200px] bg-[#0C1017] border border-slate-700 rounded px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-slate-500"
              />
            )}
            {currentState && (
              <button
                type="button"
                onClick={handleExport}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-sky-400" />
                Export JSON
              </button>
            )}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-medium rounded flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5 text-emerald-400" />
              Import JSON
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>

          {/* Autosave Row */}
          {autosaveMeta && (
            <div className="p-3.5 bg-[#0C1017] border border-slate-800 rounded-md flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {autosaveMeta.name}
                </div>
                <div className="text-xs font-mono tabular-nums text-slate-400 flex flex-wrap items-center gap-2">
                  <span>
                    {autosaveMeta.gameVariant === 'BLITZ'
                      ? `Blitz ${SCENARIOS[autosaveMeta.scenarioId ?? 'modern_2026']?.yearLabel ?? '2026'}`
                      : 'Classic'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>Turn {autosaveMeta.turn}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {autosaveMeta.provincesOwned}/{autosaveMeta.totalProvinces} Prov
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{new Date(autosaveMeta.savedAt).toLocaleString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleLoadSlot(AUTOSAVE_SLOT_ID)}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded flex items-center gap-1.5 cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  Load
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSlot(AUTOSAVE_SLOT_ID)}
                  aria-label="Delete autosave"
                  className="p-1.5 bg-slate-800 hover:bg-red-700 text-slate-300 rounded cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* 5 Manual Slots */}
          <div className="space-y-2.5">
            {MANUAL_SLOT_IDS.map((slotId, index) => {
              const meta = slots.find((s) => s.id === slotId);
              return (
                <div
                  key={slotId}
                  className="p-3.5 bg-[#0C1017] border border-slate-800 rounded-md flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="text-sm font-semibold text-white truncate">
                      {meta ? meta.name : `Slot ${index + 1} — Empty`}
                    </div>
                    {meta ? (
                      <div className="text-xs font-mono tabular-nums text-slate-400 flex flex-wrap items-center gap-2">
                        <span>
                          {meta.gameVariant === 'BLITZ'
                            ? `Blitz ${SCENARIOS[meta.scenarioId ?? 'modern_2026']?.yearLabel ?? '2026'}`
                            : 'Classic'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {meta.playerCount > 1
                            ? `${meta.playerCount} Humans`
                            : 'Solo'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Turn {meta.turn}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {meta.provincesOwned}/{meta.totalProvinces} Prov
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{new Date(meta.savedAt).toLocaleString()}</span>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500">
                        Available manual campaign slot
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {canSaveHere && (
                      <button
                        type="button"
                        onClick={() => handleSaveSlot(slotId)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5 text-amber-400" />
                        {meta ? 'Overwrite' : 'Save'}
                      </button>
                    )}
                    {meta && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleLoadSlot(slotId)}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs font-semibold rounded flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <FolderOpen className="w-3.5 h-3.5" />
                          Load
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlot(slotId)}
                          aria-label={`Delete ${meta.name}`}
                          className="p-1.5 bg-slate-800 hover:bg-red-700 text-slate-300 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
