import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Teacher, AssistantSlot, AssistantSchedule } from '../types.ts';
import { DAYS_OF_WEEK } from '../constants.ts';
import { PrintIcon } from './icons/PrintIcon.tsx';
import { TrashIcon } from './icons/TrashIcon.tsx';

// ─── Constants ────────────────────────────────────────────────────────────────

export const ASSISTANT_TIME_SLOTS = [
  '7.00–7.30', '7.30–8.00', '8.00–8.45', '8.45–8.55',
  '8.55–9.40', '9.40–9.55', '9.55–10.40', '10.40–10.50',
  '10.50–11.35', '11.35–11.50', '11.50–12.35', '12.35–12.50',
  '12.50–13.35', '13.35–13.45', '13.45–14.30', '14.30–14.35',
  '14.35–15.35', '15.35–16.00',
];

export const DEFAULT_LOCATIONS = [
  'Óvoda', 'Fejl.', 'AÖ', 'K9-10', 'K11-12',
  '1.o.', '2/a', '2/b', '3.o', '4.o.', '6/b', 'Koll.', 'Szakiskola',
];

export const ASSISTANT_SCHEDULE_KEY = 'assistantScheduleState';

// ─── Time helpers ─────────────────────────────────────────────────────────────
/** Parse 'H.MM' or 'HH.MM' string into total minutes from midnight */
const parseHM = (t: string): number => {
  const [h, m] = t.split('.').map(Number);
  return h * 60 + (m || 0);
};

/** Duration in minutes for each time slot (matches ASSISTANT_TIME_SLOTS order) */
export const ASSISTANT_SLOT_DURATIONS: number[] = ASSISTANT_TIME_SLOTS.map(slot => {
  const [start, end] = slot.split('\u2013'); // '–' en-dash
  return parseHM(end) - parseHM(start);
});

/** Format total minutes as 'X ó Y p' (or just 'Y p' if under an hour) */
const formatMinutes = (total: number): string => {
  if (total <= 0) return '0 p';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} p`;
  if (m === 0) return `${h} ó`;
  return `${h} ó ${m} p`;
};

// ─── Drag data type ────────────────────────────────────────────────────────────
const DRAG_ASSISTANT = 'application/assistant-id';
const DRAG_SLOT      = 'application/assistant-slot';

// ─── Helper ───────────────────────────────────────────────────────────────────
const genId = () => Math.random().toString(36).slice(2, 10);

// ─── Colour helper (same palette as teacher cards) ───────────────────────────
const PASTEL_COLORS = [
  'bg-red-200 text-red-900 border-red-300',
  'bg-orange-200 text-orange-900 border-orange-300',
  'bg-amber-200 text-amber-900 border-amber-300',
  'bg-yellow-200 text-yellow-900 border-yellow-300',
  'bg-lime-200 text-lime-900 border-lime-300',
  'bg-green-200 text-green-900 border-green-300',
  'bg-teal-200 text-teal-900 border-teal-300',
  'bg-cyan-200 text-cyan-900 border-cyan-300',
  'bg-sky-200 text-sky-900 border-sky-300',
  'bg-blue-200 text-blue-900 border-blue-300',
  'bg-indigo-200 text-indigo-900 border-indigo-300',
  'bg-violet-200 text-violet-900 border-violet-300',
  'bg-purple-200 text-purple-900 border-purple-300',
  'bg-fuchsia-200 text-fuchsia-900 border-fuchsia-300',
  'bg-pink-200 text-pink-900 border-pink-300',
  'bg-rose-200 text-rose-900 border-rose-300',
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface AssistantScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAssistants: Teacher[];
  allTeachers: Teacher[];
}

// ─── Component ────────────────────────────────────────────────────────────────
export const AssistantScheduleModal: React.FC<AssistantScheduleModalProps> = ({
  isOpen, onClose, selectedAssistants, allTeachers,
}) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [activeDay, setActiveDay] = useState(0);
  const [slots, setSlots] = useState<AssistantSlot[]>([]);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [isEditingLocations, setIsEditingLocations] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [dragOverCell, setDragOverCell] = useState<{ ts: number; loc: number } | null>(null);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<string[]>([]);
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);

  // colour map: assistantId → class string
  const colorMap = useRef<Record<string, string>>({});
  const getColor = (id: string) => {
    if (!colorMap.current[id]) {
      const idx = Object.keys(colorMap.current).length % PASTEL_COLORS.length;
      colorMap.current[id] = PASTEL_COLORS[idx];
    }
    return colorMap.current[id];
  };

  // ── Load from localStorage on open ─────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem(ASSISTANT_SCHEDULE_KEY);
      if (raw) {
        const saved: AssistantSchedule = JSON.parse(raw);
        setSlots(saved.slots ?? []);
        setLocations(saved.locations?.length ? saved.locations : DEFAULT_LOCATIONS);
        setSelectedAssistantIds(saved.selectedAssistantIds ?? []);
      } else {
        setSelectedAssistantIds(selectedAssistants.map(a => a.id));
      }
    } catch {
      setSelectedAssistantIds(selectedAssistants.map(a => a.id));
    }
    // build colour map for all selected assistants
    selectedAssistants.forEach((a, i) => {
      colorMap.current[a.id] = PASTEL_COLORS[i % PASTEL_COLORS.length];
    });
  }, [isOpen, selectedAssistants]);

  // ── Conflict detection ──────────────────────────────────────────────────────
  useEffect(() => {
    const newConflicts = new Set<string>();
    // group by (assistantId, day, timeSlotIndex)
    const map: Record<string, AssistantSlot[]> = {};
    slots.forEach(s => {
      const key = `${s.assistantId}-${s.day}-${s.timeSlotIndex}`;
      if (!map[key]) map[key] = [];
      map[key].push(s);
    });
    Object.values(map).forEach(group => {
      if (group.length > 1) {
        group.forEach(s => newConflicts.add(s.id));
      }
    });
    setConflicts(newConflicts);
  }, [slots]);

  // ── Save to localStorage ────────────────────────────────────────────────────
  const save = useCallback((newSlots: AssistantSlot[], newLocations: string[], newSelectedIds: string[]) => {
    const state: AssistantSchedule = {
      slots: newSlots,
      locations: newLocations,
      selectedAssistantIds: newSelectedIds,
    };
    localStorage.setItem(ASSISTANT_SCHEDULE_KEY, JSON.stringify(state));
  }, []);

  // ── Derive current visible assistants ──────────────────────────────────────
  const visibleAssistants = allTeachers.filter(t => selectedAssistantIds.includes(t.id));

  // ── Drag handlers: source (sidebar assistant chip) ─────────────────────────
  const handleDragStartAssistant = (e: React.DragEvent, assistantId: string) => {
    e.dataTransfer.setData(DRAG_ASSISTANT, assistantId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // ── Drag handlers: source (existing slot on the grid) ─────────────────────
  const handleDragStartSlot = (e: React.DragEvent, slotId: string) => {
    e.dataTransfer.setData(DRAG_SLOT, slotId);
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  };

  // ── Drag handlers: cell (target) ──────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent, ts: number, loc: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setDragOverCell({ ts, loc });
  };

  const handleDragLeave = () => setDragOverCell(null);

  const handleDrop = (e: React.DragEvent, ts: number, loc: number) => {
    e.preventDefault();
    setDragOverCell(null);

    const assistantId = e.dataTransfer.getData(DRAG_ASSISTANT);
    const slotId      = e.dataTransfer.getData(DRAG_SLOT);

    if (assistantId) {
      // PREVENT DUPLICATE: skip if this exact (assistant, day, timeslot, location) already exists
      const alreadyExists = slots.some(
        s => s.assistantId === assistantId &&
             s.day === activeDay &&
             s.timeSlotIndex === ts &&
             s.locationIndex === loc
      );
      if (alreadyExists) return;

      // New slot from sidebar
      const newSlot: AssistantSlot = {
        id: genId(),
        assistantId,
        day: activeDay,
        timeSlotIndex: ts,
        locationIndex: loc,
      };
      const updated = [...slots, newSlot];
      setSlots(updated);
      save(updated, locations, selectedAssistantIds);
    } else if (slotId) {
      // Move existing slot – also prevent duplicate at destination
      const movingSlot = slots.find(s => s.id === slotId);
      if (!movingSlot) return;
      const alreadyExists = slots.some(
        s => s.id !== slotId &&
             s.assistantId === movingSlot.assistantId &&
             s.day === activeDay &&
             s.timeSlotIndex === ts &&
             s.locationIndex === loc
      );
      if (alreadyExists) return;

      const updated = slots.map(s =>
        s.id === slotId ? { ...s, day: activeDay, timeSlotIndex: ts, locationIndex: loc } : s
      );
      setSlots(updated);
      save(updated, locations, selectedAssistantIds);
    }
  };

  const handleRemoveSlot = (slotId: string) => {
    const updated = slots.filter(s => s.id !== slotId);
    setSlots(updated);
    save(updated, locations, selectedAssistantIds);
  };

  const handleClearDay = () => {
    const updated = slots.filter(s => s.day !== activeDay);
    setSlots(updated);
    save(updated, locations, selectedAssistantIds);
  };

  const handleClearAll = () => {
    if (window.confirm('Biztosan törlöd az összes asszisztens beosztást?')) {
      setSlots([]);
      save([], locations, selectedAssistantIds);
    }
  };

  // ── Copy active day's slots to another day ─────────────────────────────────
  const handleCopyDayTo = (targetDay: number) => {
    setIsCopyMenuOpen(false);
    if (targetDay === activeDay) return;
    // Get current day's slots
    const sourceDaySlots = slots.filter(s => s.day === activeDay);
    if (sourceDaySlots.length === 0) return;
    // Remove existing slots for target day, then add copies
    const withoutTarget = slots.filter(s => s.day !== targetDay);
    const copies: AssistantSlot[] = sourceDaySlots.map(s => ({
      ...s,
      id: genId(),
      day: targetDay,
    }));
    const updated = [...withoutTarget, ...copies];
    setSlots(updated);
    save(updated, locations, selectedAssistantIds);
  };

  // ── Location management ────────────────────────────────────────────────────
  const handleAddLocation = () => {
    const trimmed = locationDraft.trim();
    if (!trimmed || locations.includes(trimmed)) return;
    const updated = [...locations, trimmed];
    setLocations(updated);
    setLocationDraft('');
    save(slots, updated, selectedAssistantIds);
  };

  const handleRemoveLocation = (idx: number) => {
    const updated = locations.filter((_, i) => i !== idx);
    // Remove slots that referenced this index; shift higher indices
    const updatedSlots = slots
      .filter(s => s.locationIndex !== idx)
      .map(s => ({ ...s, locationIndex: s.locationIndex > idx ? s.locationIndex - 1 : s.locationIndex }));
    setLocations(updated);
    setSlots(updatedSlots);
    save(updatedSlots, updated, selectedAssistantIds);
  };

  const handleMoveLocation = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= locations.length) return;
    const updated = [...locations];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    const updatedSlots = slots.map(s => {
      if (s.locationIndex === idx) return { ...s, locationIndex: newIdx };
      if (s.locationIndex === newIdx) return { ...s, locationIndex: idx };
      return s;
    });
    setLocations(updated);
    setSlots(updatedSlots);
    save(updatedSlots, updated, selectedAssistantIds);
  };

  // ── Helper: slots for a given cell on the active day ──────────────────────
  const getCellSlots = (ts: number, loc: number) =>
    slots.filter(s => s.day === activeDay && s.timeSlotIndex === ts && s.locationIndex === loc);

  const conflictCount = conflicts.size > 0
    ? slots.filter(s => s.day === activeDay && conflicts.has(s.id)).length
    : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-2">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col"
           style={{ width: '98vw', height: '96vh', maxWidth: '1800px' }}
           onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👤</span>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Asszisztens Beosztás</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Fogd és vidd az asszisztenst a kívánt cellába</p>
            </div>
            {conflictCount > 0 && (
              <span className="px-3 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-bold rounded-full animate-pulse">
                ⚠️ {conflictCount} ütközés ezen a napon!
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsEditingLocations(v => !v)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${isEditingLocations ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
              title="Helyszínek szerkesztése">
              ✏️ Helyszínek
            </button>
            {/* ── Copy day button with dropdown ── */}
            <div className="relative">
              <button
                onClick={() => setIsCopyMenuOpen(v => !v)}
                disabled={slots.filter(s => s.day === activeDay).length === 0}
                className="px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Nap beosztásának másolása más napra">
                📋 Másolás napra…
              </button>
              {isCopyMenuOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-10 overflow-hidden">
                  {DAYS_OF_WEEK.map((dayName, dIdx) => (
                    dIdx === activeDay ? null : (
                      <button
                        key={dIdx}
                        onClick={() => handleCopyDayTo(dIdx)}
                        className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors">
                        → {dayName} (felülírja)
                      </button>
                    )
                  ))}
                  <button
                    onClick={() => setIsCopyMenuOpen(false)}
                    className="block w-full text-left px-4 py-2 text-xs text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-100 dark:border-gray-700">
                    Mégse
                  </button>
                </div>
              )}
            </div>
            <button onClick={handleClearDay}
              className="px-3 py-1.5 text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 rounded-lg hover:bg-orange-200 transition-colors"
              title="Mai nap beosztásának törlése">
              🗑 Nap törlése
            </button>
            <button onClick={handleClearAll}
              className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 rounded-lg hover:bg-red-200 transition-colors"
              title="Összes beosztás törlése">
              🗑 Összes törlése
            </button>
            <button onClick={() => window.print()}
              className="p-2 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
              title="Nyomtatás">
              <PrintIcon className="w-4 h-4" />
            </button>
            <button onClick={onClose}
              className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors ml-1">
              Bezárás
            </button>
          </div>
        </div>

        {/* ── Location editor (collapsible) ── */}
        {isEditingLocations && (
          <div className="px-5 py-3 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800 shrink-0">
            <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-2">✏️ Helyszínek szerkesztése</h3>
            <div className="flex flex-wrap gap-2 mb-3">
              {locations.map((loc, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-600 rounded-lg px-2 py-1 text-xs">
                  <button onClick={() => handleMoveLocation(idx, -1)} disabled={idx === 0}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-20 font-bold">◀</button>
                  <span className="font-semibold text-gray-800 dark:text-gray-200 min-w-[40px] text-center">{loc}</span>
                  <button onClick={() => handleMoveLocation(idx, 1)} disabled={idx === locations.length - 1}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-20 font-bold">▶</button>
                  <button onClick={() => handleRemoveLocation(idx)}
                    className="text-red-400 hover:text-red-600 ml-1 font-bold">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={locationDraft} onChange={e => setLocationDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddLocation()}
                placeholder="Új helyszín neve…"
                className="px-3 py-1.5 text-sm border border-amber-300 dark:border-amber-600 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-400 w-48"/>
              <button onClick={handleAddLocation}
                className="px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600 transition-colors">
                + Hozzáad
              </button>
              <button onClick={() => setIsEditingLocations(false)}
                className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-lg hover:bg-gray-300 transition-colors ml-auto">
                Kész
              </button>
            </div>
          </div>
        )}

        {/* ── Day selector ── */}
        <div className="flex gap-1 px-5 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0">
          {DAYS_OF_WEEK.map((day, dIdx) => {
            const dayConflicts = slots.filter(s => s.day === dIdx && conflicts.has(s.id)).length;
            return (
              <button key={dIdx} onClick={() => setActiveDay(dIdx)}
                className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center gap-1.5 ${
                  activeDay === dIdx
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}>
                {day}
                {dayConflicts > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {dayConflicts}
                  </span>
                )}
              </button>
            );
          })}
          <div className="ml-4 text-xs text-gray-400 dark:text-gray-500 self-center">
            {slots.filter(s => s.day === activeDay).length} beosztás ezen a napon
          </div>
        </div>

        {/* ── Main content: grid + sidebar ── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── Grid ── */}
          <div className="flex-1 overflow-auto p-3">
            <table className="border-collapse w-full text-xs" style={{ minWidth: `${100 + locations.length * 90}px` }}>
              <thead>
                <tr className="bg-teal-50 dark:bg-teal-950/40">
                  <th className="border border-gray-300 dark:border-gray-600 p-2 font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap bg-teal-100 dark:bg-teal-900/40"
                      style={{ minWidth: '90px' }}>
                    Idő/nap
                  </th>
                  {locations.map((loc, lIdx) => (
                    <th key={lIdx}
                        className="border border-gray-300 dark:border-gray-600 p-2 font-bold text-teal-800 dark:text-teal-300 text-center whitespace-nowrap"
                        style={{ minWidth: '88px' }}>
                      {loc}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ASSISTANT_TIME_SLOTS.map((ts, tsIdx) => (
                  <tr key={tsIdx} className={tsIdx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}>
                    <td className="border border-gray-300 dark:border-gray-600 p-1.5 font-semibold text-gray-600 dark:text-gray-400 whitespace-nowrap text-center bg-teal-50 dark:bg-teal-950/20">
                      {ts}
                    </td>
                    {locations.map((_, locIdx) => {
                      const cellSlots = getCellSlots(tsIdx, locIdx);
                      const isDragOver = dragOverCell?.ts === tsIdx && dragOverCell?.loc === locIdx;
                      const hasConflict = cellSlots.some(s => conflicts.has(s.id));

                      return (
                        <td key={locIdx}
                            onDragOver={e => handleDragOver(e, tsIdx, locIdx)}
                            onDragLeave={handleDragLeave}
                            onDrop={e => handleDrop(e, tsIdx, locIdx)}
                            className={`border border-gray-300 dark:border-gray-600 p-1 align-top transition-colors cursor-default ${
                              isDragOver
                                ? 'bg-teal-100 dark:bg-teal-800/40 ring-2 ring-teal-400'
                                : hasConflict
                                ? 'bg-red-50 dark:bg-red-950/30'
                                : ''
                            }`}
                            style={{ minHeight: '36px', verticalAlign: 'top' }}>
                          <div className="flex flex-col gap-0.5">
                            {cellSlots.map(slot => {
                              const assistant = allTeachers.find(t => t.id === slot.assistantId);
                              const isConflict = conflicts.has(slot.id);
                              const colorClass = getColor(slot.assistantId);

                              return (
                                <div key={slot.id}
                                     draggable
                                     onDragStart={e => handleDragStartSlot(e, slot.id)}
                                     className={`flex items-center justify-between gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border cursor-grab active:cursor-grabbing ${
                                       isConflict
                                         ? 'bg-red-200 text-red-900 border-red-400 dark:bg-red-800/60 dark:text-red-200'
                                         : colorClass
                                     }`}
                                     title={isConflict ? '⚠️ Ütközés! Ez az asszisztens már máshol is be van osztva ebben az idősávban.' : assistant?.name}>
                                  <span className="truncate max-w-[60px]">
                                    {isConflict && '⚠️ '}
                                    {assistant?.name.split(' ').pop() ?? '?'}
                                  </span>
                                  <button
                                    onClick={() => handleRemoveSlot(slot.id)}
                                    className="shrink-0 text-current opacity-60 hover:opacity-100 leading-none"
                                    title="Törlés">
                                    ×
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── Sidebar: assistants ── */}
          <div className="w-52 shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                👤 Asszisztensek
              </h3>
              <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Húzd a cellába</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {visibleAssistants.length === 0 && (
                <p className="text-xs text-gray-400 dark:text-gray-500 italic p-2 text-center">
                  Nincs kiválasztott asszisztens.<br/>
                  Zárd be és válassz a listából.
                </p>
              )}
              {visibleAssistants.map(assistant => {
                const colorClass = getColor(assistant.id);
                const daySlots = slots.filter(s => s.day === activeDay && s.assistantId === assistant.id);
                const hasConflictToday = daySlots.some(s => conflicts.has(s.id));

                // Calculate total working time from slot durations
                const totalMinutes = daySlots.reduce(
                  (sum, s) => sum + (ASSISTANT_SLOT_DURATIONS[s.timeSlotIndex] ?? 0),
                  0
                );

                return (
                  <div key={assistant.id}
                       draggable
                       onDragStart={e => handleDragStartAssistant(e, assistant.id)}
                       className={`px-2.5 py-2 rounded-lg border font-semibold text-xs cursor-grab active:cursor-grabbing select-none shadow-xs transition-all hover:shadow-md ${colorClass} ${
                         hasConflictToday ? 'ring-2 ring-red-400' : ''
                       }`}
                       title={hasConflictToday ? '⚠️ Ütkozés van ezen a napon!' : 'Hüzd a táblára'}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{assistant.name}</span>
                      {hasConflictToday && <span title="Ütkozés!">⚠️</span>}
                    </div>
                    {daySlots.length > 0 ? (
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[9px] opacity-70">
                          {daySlots.length}× beosztás
                        </span>
                        <span className="text-[9px] font-bold opacity-80 bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded">
                          ⏱ {formatMinutes(totalMinutes)}
                        </span>
                      </div>
                    ) : (
                      <div className="text-[9px] opacity-50 mt-0.5">Nincs beosztás</div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* Conflict legend */}
            {conflicts.size > 0 && (
              <div className="px-3 py-2 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 shrink-0">
                <p className="text-[10px] text-red-700 dark:text-red-300 font-semibold">
                  ⚠️ Ugyanabban az idősávban egy asszisztens több helyen is szerepel!
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
