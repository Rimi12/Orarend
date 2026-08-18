import React, { useState, useMemo } from 'react';
import type { Teacher, AssistantSlot } from '../types.ts';

interface AssistantReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  allTeachers: Teacher[];
  selectedAssistantIds: string[];
  slots: AssistantSlot[];
  assistantNames: Record<string, string>;
  onApplyReplace: (
    oldAssistantId: string,
    newAssistantId: string,
    newCustomName?: string
  ) => void;
}

export const AssistantReplaceModal: React.FC<AssistantReplaceModalProps> = ({
  isOpen,
  onClose,
  allTeachers,
  selectedAssistantIds,
  slots,
  assistantNames,
  onApplyReplace,
}) => {
  const [selectedOldId, setSelectedOldId] = useState<string>('');
  const [replaceMode, setReplaceMode] = useState<'rename' | 'teacher' | 'custom'>('rename');
  const [selectedNewTeacherId, setSelectedNewTeacherId] = useState<string>('');
  const [customName, setCustomName] = useState<string>('');

  // Assistants that are currently in the schedule or list
  const activeAssistants = useMemo(() => {
    return selectedAssistantIds.map(id => {
      const teacher = allTeachers.find(t => t.id === id);
      const name = assistantNames[id] || teacher?.name || id;
      const slotCount = slots.filter(s => s.assistantId === id).length;
      return { id, name, slotCount };
    });
  }, [selectedAssistantIds, allTeachers, assistantNames, slots]);

  // Set initial selected assistant when modal opens
  React.useEffect(() => {
    if (isOpen && activeAssistants.length > 0 && !selectedOldId) {
      setSelectedOldId(activeAssistants[0].id);
    }
  }, [isOpen, activeAssistants, selectedOldId]);

  // Set initial rename value
  React.useEffect(() => {
    if (selectedOldId) {
      const current = activeAssistants.find(a => a.id === selectedOldId);
      if (current) {
        setCustomName(current.name);
      }
    }
  }, [selectedOldId, activeAssistants]);

  if (!isOpen) return null;

  const currentAssistant = activeAssistants.find(a => a.id === selectedOldId);
  const affectedSlotsCount = slots.filter(s => s.assistantId === selectedOldId).length;

  const handleConfirm = () => {
    if (!selectedOldId) return;

    if (replaceMode === 'rename') {
      const trimmed = customName.trim();
      if (!trimmed) {
        alert('Kérlek adj meg egy érvényes nevet!');
        return;
      }
      onApplyReplace(selectedOldId, selectedOldId, trimmed);
    } else if (replaceMode === 'teacher') {
      if (!selectedNewTeacherId || selectedNewTeacherId === selectedOldId) {
        alert('Kérlek válassz egy másik személyt a listából!');
        return;
      }
      onApplyReplace(selectedOldId, selectedNewTeacherId);
    } else if (replaceMode === 'custom') {
      const trimmed = customName.trim();
      if (!trimmed) {
        alert('Kérlek add meg az új dolgozó nevét!');
        return;
      }
      const newCustomId = `custom_asst_${Date.now().toString(36)}`;
      onApplyReplace(selectedOldId, newCustomId, trimmed);
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔄</span>
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Dolgozó cseréje / átnevezése
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                A beosztás idősávjai és helyszínei változatlanul megmaradnak!
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl font-bold">
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Step 1: Select Old Assistant */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
              1. Kérlek válaszd ki a módosítandó dolgozót:
            </label>
            <select
              value={selectedOldId}
              onChange={e => setSelectedOldId(e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white font-semibold text-sm focus:ring-2 focus:ring-teal-500">
              {activeAssistants.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.slotCount} beosztott idősáv)
                </option>
              ))}
            </select>
          </div>

          {/* Step 2: Choose Mode */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5 uppercase tracking-wider">
              2. Milyen műveletet szeretnél végrehajtani?
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setReplaceMode('rename')}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
                  replaceMode === 'rename'
                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100'
                }`}>
                ✏️ Név átírása
              </button>
              <button
                type="button"
                onClick={() => setReplaceMode('teacher')}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
                  replaceMode === 'teacher'
                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100'
                }`}>
                👥 Másik dolgozó
              </button>
              <button
                type="button"
                onClick={() => setReplaceMode('custom')}
                className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all ${
                  replaceMode === 'custom'
                    ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                    : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100'
                }`}>
                ➕ Új név/személy
              </button>
            </div>
          </div>

          {/* Mode-specific input */}
          {replaceMode === 'rename' && (
            <div className="bg-teal-50 dark:bg-teal-950/30 p-4 rounded-xl border border-teal-200 dark:border-teal-800 space-y-2">
              <label className="block text-xs font-bold text-teal-900 dark:text-teal-200">
                Új megjelenített név a beosztásban:
              </label>
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Pl. Kiss Erika"
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-teal-300 dark:border-teal-700 rounded-lg text-gray-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-teal-500"
              />
              <p className="text-xs text-teal-700 dark:text-teal-300">
                Ez a dolgozó ezentúl ezen a néven fog szerepelni az összes idősávban és nyomtatásban.
              </p>
            </div>
          )}

          {replaceMode === 'teacher' && (
            <div className="bg-blue-50 dark:bg-blue-950/30 p-4 rounded-xl border border-blue-200 dark:border-blue-800 space-y-2">
              <label className="block text-xs font-bold text-blue-900 dark:text-blue-200">
                Válaszd ki az új személyt a tantárgyfelosztásból:
              </label>
              <select
                value={selectedNewTeacherId}
                onChange={e => setSelectedNewTeacherId(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-blue-300 dark:border-blue-700 rounded-lg text-gray-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-blue-500">
                <option value="">-- Válassz egy kollégát --</option>
                {allTeachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {assistantNames[t.id] || t.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Az eddig berakott összes idősáv automatikusan átruházódik a kiválasztott személyre.
              </p>
            </div>
          )}

          {replaceMode === 'custom' && (
            <div className="bg-purple-50 dark:bg-purple-950/30 p-4 rounded-xl border border-purple-200 dark:border-purple-800 space-y-2">
              <label className="block text-xs font-bold text-purple-900 dark:text-purple-200">
                Új dolgozó neve:
              </label>
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="Pl. Új Asszisztens Péter"
                className="w-full px-3 py-2 bg-white dark:bg-gray-700 border border-purple-300 dark:border-purple-700 rounded-lg text-gray-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-purple-500"
              />
              <p className="text-xs text-purple-700 dark:text-purple-300">
                Létrehoz egy új asszisztenst ezzel a névvel, és az összes idősávot átrakja rá.
              </p>
            </div>
          )}

          {/* Summary Box */}
          <div className="bg-amber-50 dark:bg-amber-950/30 p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 flex items-start gap-2.5">
            <span className="text-lg">ℹ️</span>
            <div className="text-xs text-amber-800 dark:text-amber-300">
              <span className="font-bold">Beosztási adatok védelme:</span> A művelet során <strong>{affectedSlotsCount} db idősáv</strong> kerül frissítésre. Egyetlen nap, időpont vagy terem sem mozdul el a helyéről!
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-xl transition-colors">
            Mégse
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5">
            <span>💾 Végrehajtás és mentés</span>
          </button>
        </div>
      </div>
    </div>
  );
};
