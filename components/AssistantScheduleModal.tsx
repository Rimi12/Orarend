import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Teacher, AssistantSlot, AssistantSchedule } from '../types.ts';
import { DAYS_OF_WEEK } from '../constants.ts';
import { PrintIcon } from './icons/PrintIcon.tsx';
import { getActiveRoomCode, subscribeToCloudDoc, saveToCloudDoc, CLIENT_ID } from '../services/firebaseSync.ts';

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
  // ── View Mode & Selection State ─────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'daily' | 'individual'>('daily');
  const [selectedIndividualId, setSelectedIndividualId] = useState<string | null>(null);

  // ── Schedule State ──────────────────────────────────────────────────────────
  const [activeDay, setActiveDay] = useState(0);
  const [slots, setSlots] = useState<AssistantSlot[]>([]);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [isEditingLocations, setIsEditingLocations] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [dragOverCell, setDragOverCell] = useState<{ ts: number; loc: number } | null>(null);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<string[]>([]);
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);

  // Print DOM references
  const dailyPrintRef = useRef<HTMLDivElement>(null);
  const individualPrintRef = useRef<HTMLDivElement>(null);
  const allIndividualPrintRef = useRef<HTMLDivElement>(null);

  // colour map: assistantId → class string
  const colorMap = useRef<Record<string, string>>({});
  const getColor = (id: string) => {
    if (!colorMap.current[id]) {
      const idx = Object.keys(colorMap.current).length % PASTEL_COLORS.length;
      colorMap.current[id] = PASTEL_COLORS[idx];
    }
    return colorMap.current[id];
  };

  // ── Load from localStorage & Cloud on open ──────────────────────────────────
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
    selectedAssistants.forEach((a, i) => {
      colorMap.current[a.id] = PASTEL_COLORS[i % PASTEL_COLORS.length];
    });

    // Cloud Subscription for Assistant Schedule
    const roomCode = getActiveRoomCode();
    const unsubscribe = subscribeToCloudDoc<AssistantSchedule>(
      `rooms/${roomCode}/assistants/schedule`,
      (cloudSchedule, updatedBy) => {
        if (updatedBy !== CLIENT_ID && cloudSchedule) {
          if (Array.isArray(cloudSchedule.slots)) setSlots(cloudSchedule.slots);
          if (Array.isArray(cloudSchedule.locations) && cloudSchedule.locations.length) setLocations(cloudSchedule.locations);
          if (Array.isArray(cloudSchedule.selectedAssistantIds)) setSelectedAssistantIds(cloudSchedule.selectedAssistantIds);
        }
      }
    );

    return () => unsubscribe();
  }, [isOpen, selectedAssistants]);

  // Derive current visible assistants
  const visibleAssistants = allTeachers.filter(t => selectedAssistantIds.includes(t.id));

  // Set default individual selection if not set
  useEffect(() => {
    if (visibleAssistants.length > 0 && (!selectedIndividualId || !visibleAssistants.some(a => a.id === selectedIndividualId))) {
      setSelectedIndividualId(visibleAssistants[0].id);
    }
  }, [visibleAssistants, selectedIndividualId]);

  // ── Conflict detection ──────────────────────────────────────────────────────
  useEffect(() => {
    const newConflicts = new Set<string>();
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

  // ── Save to localStorage & Cloud ────────────────────────────────────────────
  const save = useCallback((newSlots: AssistantSlot[], newLocations: string[], newSelectedIds: string[]) => {
    const state: AssistantSchedule = {
      slots: newSlots,
      locations: newLocations,
      selectedAssistantIds: newSelectedIds,
    };
    localStorage.setItem(ASSISTANT_SCHEDULE_KEY, JSON.stringify(state));

    const roomCode = getActiveRoomCode();
    if (roomCode) {
      saveToCloudDoc(`rooms/${roomCode}/assistants/schedule`, state);
    }
  }, []);

  // ── Drag handlers ───────────────────────────────────────────────────────────
  const handleDragStartAssistant = (e: React.DragEvent, assistantId: string) => {
    e.dataTransfer.setData(DRAG_ASSISTANT, assistantId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragStartSlot = (e: React.DragEvent, slotId: string) => {
    e.dataTransfer.setData(DRAG_SLOT, slotId);
    e.dataTransfer.effectAllowed = 'move';
    e.stopPropagation();
  };

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
      const alreadyExists = slots.some(
        s => s.assistantId === assistantId &&
             s.day === activeDay &&
             s.timeSlotIndex === ts &&
             s.locationIndex === loc
      );
      if (alreadyExists) return;

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

  const handleCopyDayTo = (targetDay: number) => {
    setIsCopyMenuOpen(false);
    if (targetDay === activeDay) return;
    const sourceDaySlots = slots.filter(s => s.day === activeDay);
    if (sourceDaySlots.length === 0) return;
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

  // ── Cell Helpers ─────────────────────────────────────────────────────────────
  const getCellSlots = (ts: number, loc: number) =>
    slots.filter(s => s.day === activeDay && s.timeSlotIndex === ts && s.locationIndex === loc);

  const conflictCount = conflicts.size > 0
    ? slots.filter(s => s.day === activeDay && conflicts.has(s.id)).length
    : 0;

  // ── Bulletproof Print Engine ─────────────────────────────────────────────────
  const triggerPrint = (targetElement: HTMLElement) => {
    const rootElement = document.getElementById('root');
    if (!rootElement || !targetElement) return;

    // 1. Clone element to print
    const printContents = targetElement.cloneNode(true) as HTMLElement;

    // Remove interactive/no-print elements inside clone
    printContents.querySelectorAll('.no-print').forEach(el => el.remove());

    // Reset min-width inline styles so tables scale to 100% A4 width
    printContents.style.minWidth = '0';
    printContents.style.maxWidth = '100%';
    printContents.querySelectorAll('table, th, td, div').forEach(el => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.style) {
        htmlEl.style.minWidth = '0';
        htmlEl.style.maxWidth = '100%';
      }
    });

    // 2. Create printHost (#print-container)
    const printHost = document.createElement('div');
    printHost.id = 'print-container';
    printHost.appendChild(printContents);

    // 3. Hide root element & append printHost to body
    const originalDisplay = rootElement.style.display;
    rootElement.style.display = 'none';
    document.body.appendChild(printHost);

    // 4. Cleanup after print
    const cleanup = () => {
      rootElement.style.display = originalDisplay;
      if (document.body.contains(printHost)) {
        document.body.removeChild(printHost);
      }
      window.removeEventListener('afterprint', cleanup);
    };

    window.removeEventListener('afterprint', cleanup);
    window.addEventListener('afterprint', cleanup);

    // 5. Trigger print dialog
    window.print();
  };

  const handlePrintCurrentView = () => {
    if (viewMode === 'daily' && dailyPrintRef.current) {
      triggerPrint(dailyPrintRef.current);
    } else if (viewMode === 'individual' && individualPrintRef.current) {
      triggerPrint(individualPrintRef.current);
    }
  };

  const handlePrintAllIndividual = () => {
    if (allIndividualPrintRef.current) {
      triggerPrint(allIndividualPrintRef.current);
    }
  };

  if (!isOpen) return null;

  const currentIndividualAssistant = visibleAssistants.find(a => a.id === selectedIndividualId);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-2">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col"
           style={{ width: '98vw', height: '96vh', maxWidth: '1800px' }}
           onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👤</span>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Asszisztens Beosztás</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {viewMode === 'daily' ? 'Fogd és vidd az asszisztenst a kívánt helyszín cellába' : 'Dolgozó egyéni heti órarendje'}
              </p>
            </div>

            {/* ── View Switcher Toggle ── */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 ml-4">
              <button
                onClick={() => setViewMode('daily')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  viewMode === 'daily'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}>
                🏢 Helyszínes (Napi)
              </button>
              <button
                onClick={() => setViewMode('individual')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  viewMode === 'individual'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}>
                👤 Dolgozó Egyéni (Heti)
              </button>
            </div>

            {viewMode === 'daily' && conflictCount > 0 && (
              <span className="px-3 py-1 bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-bold rounded-full animate-pulse">
                ⚠️ {conflictCount} ütközés ezen a napon!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {viewMode === 'daily' && (
              <>
                <button onClick={() => setIsEditingLocations(v => !v)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${isEditingLocations ? 'bg-amber-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                  title="Helyszínek szerkesztése">
                  ✏️ Helyszínek
                </button>
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
              </>
            )}

            {viewMode === 'individual' && (
              <button onClick={handlePrintAllIndividual}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 transition-colors"
                title="Összes asszisztens egyéni órarendjének kinyomtatása">
                🖨️ Összes dolgozó nyomtatása
              </button>
            )}

            <button onClick={handlePrintCurrentView}
              className="p-2 text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
              title="Nyomtatás">
              <PrintIcon className="w-4 h-4" />
              <span>Nyomtatás</span>
            </button>

            <button onClick={onClose}
              className="px-4 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-semibold text-sm rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors ml-1">
              Bezárás
            </button>
          </div>
        </div>

        {/* ── Location editor (collapsible) ── */}
        {viewMode === 'daily' && isEditingLocations && (
          <div className="px-5 py-3 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800 shrink-0 no-print">
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

        {/* ── View 1: DAILY LOCATION MATRIX VIEW ── */}
        {viewMode === 'daily' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Day selector */}
            <div className="flex gap-1 px-5 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0 no-print">
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

            {/* Printable Daily Block */}
            <div ref={dailyPrintRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Print Header */}
              <div className="p-3 border-b text-center">
                <h2 className="text-xl font-bold text-gray-900">
                  Asszisztens Beosztás – {DAYS_OF_WEEK[activeDay]}
                </h2>
              </div>

              {/* Grid + Sidebar */}
              <div className="flex flex-1 min-h-0 overflow-hidden">
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
                                          className="shrink-0 text-current opacity-60 hover:opacity-100 leading-none no-print"
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

                {/* Sidebar */}
                <div className="w-56 shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex flex-col overflow-hidden no-print">
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                      👤 Asszisztensek
                    </h3>
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">Húzd a cellába</p>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
                    {visibleAssistants.length === 0 && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 italic p-2 text-center">
                        Nincs kiválasztott asszisztens.
                      </p>
                    )}
                    {visibleAssistants.map(assistant => {
                      const colorClass = getColor(assistant.id);
                      const daySlots = slots.filter(s => s.day === activeDay && s.assistantId === assistant.id);
                      const hasConflictToday = daySlots.some(s => conflicts.has(s.id));

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
                             title={hasConflictToday ? '⚠️ Ütközés van ezen a napon!' : 'Húzd a táblára'}>
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate">{assistant.name}</span>
                            {hasConflictToday && <span title="Ütközés!">⚠️</span>}
                          </div>
                          {daySlots.length > 0 ? (
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-[9px] opacity-70">
                                {daySlots.length}× beosztás
                              </span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                totalMinutes >= 480
                                  ? 'bg-emerald-800 text-white shadow-xs ring-1 ring-emerald-500 font-extrabold'
                                  : 'opacity-80 bg-black/10 dark:bg-white/10'
                              }`}
                              title={totalMinutes >= 480 ? 'Elérte vagy meghaladta a 8 órát!' : ''}>
                                ⏱ {formatMinutes(totalMinutes)}
                                {totalMinutes >= 480 && ' ✓'}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[9px] opacity-50 mt-0.5">Nincs beosztás</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
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
        )}

        {/* ── View 2: INDIVIDUAL WORKER WEEKLY VIEW ── */}
        {viewMode === 'individual' && (
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            {/* Assistant selector chips bar */}
            <div className="px-5 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 flex items-center gap-2 overflow-x-auto shrink-0 no-print">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide mr-2 shrink-0">
                Dolgozó:
              </span>
              {visibleAssistants.map(assistant => {
                const isSelected = assistant.id === selectedIndividualId;
                const assistantWeeklySlots = slots.filter(s => s.assistantId === assistant.id);
                const weeklyMinutes = assistantWeeklySlots.reduce(
                  (sum, s) => sum + (ASSISTANT_SLOT_DURATIONS[s.timeSlotIndex] ?? 0),
                  0
                );

                return (
                  <button
                    key={assistant.id}
                    onClick={() => setSelectedIndividualId(assistant.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-2 border ${
                      isSelected
                        ? 'bg-teal-600 text-white border-teal-600 shadow-md ring-2 ring-teal-300'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}>
                    <span>{assistant.name}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                    }`}>
                      ⏱ {formatMinutes(weeklyMinutes)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Individual Timetable View Container */}
            <div className="flex-1 overflow-auto p-4">
              {currentIndividualAssistant && (
                <div ref={individualPrintRef}>
                  {renderIndividualTimetable(currentIndividualAssistant)}
                </div>
              )}
            </div>

            {/* Hidden Container for Printing ALL Assistants */}
            <div className="hidden">
              <div ref={allIndividualPrintRef}>
                {visibleAssistants.map((assistant, index) => (
                  <div key={assistant.id} className={index < visibleAssistants.length - 1 ? 'page-break-after' : ''}>
                    {renderIndividualTimetable(assistant)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );

  // ── Helper to render a single assistant's weekly timetable block ─────────────
  function renderIndividualTimetable(assistant: Teacher) {
    const assistantWeeklySlots = slots.filter(s => s.assistantId === assistant.id);
    const weeklyMinutes = assistantWeeklySlots.reduce(
      (sum, s) => sum + (ASSISTANT_SLOT_DURATIONS[s.timeSlotIndex] ?? 0),
      0
    );

    return (
      <div className="mb-8">
        {/* Header info for assistant */}
        <div className="flex items-center justify-between mb-3 bg-teal-50 dark:bg-teal-950/40 p-3 rounded-xl border border-teal-200 dark:border-teal-800">
          <div>
            <h2 className="text-xl font-bold text-teal-900 dark:text-teal-100">
              {assistant.name} – Egyéni Heti Beosztás
            </h2>
            <p className="text-xs text-teal-700 dark:text-teal-300">
              Összes hetente beosztott munkaidő: <strong className="text-sm">{formatMinutes(weeklyMinutes)}</strong> ({assistantWeeklySlots.length} beosztott idősáv)
            </p>
          </div>
          <span className="text-xs font-bold px-3 py-1 bg-teal-600 text-white rounded-full">
            Heti Órarend
          </span>
        </div>

        {/* Weekly Grid */}
        <table className="border-collapse w-full text-xs shadow-sm rounded-lg overflow-hidden border border-gray-300 dark:border-gray-700">
          <thead>
            <tr className="bg-teal-700 text-white">
              <th className="border border-teal-800 p-2 font-bold w-24 text-center">Idősáv</th>
              {DAYS_OF_WEEK.map((dayName, dIdx) => {
                const daySlots = assistantWeeklySlots.filter(s => s.day === dIdx);
                const dayMin = daySlots.reduce(
                  (sum, s) => sum + (ASSISTANT_SLOT_DURATIONS[s.timeSlotIndex] ?? 0), 0
                );
                const isFullDay = dayMin >= 480;
                return (
                  <th key={dIdx} className={`border border-teal-800 p-2 font-bold text-center ${
                    isFullDay ? 'bg-emerald-900 text-emerald-100' : ''
                  }`}>
                    <div>{dayName}</div>
                    <div className={`text-[10px] mt-0.5 px-1 py-0.5 rounded inline-block ${
                      isFullDay ? 'bg-emerald-800 text-white font-extrabold shadow-xs' : 'font-normal opacity-90'
                    }`}>
                      {formatMinutes(dayMin)}{isFullDay && ' ✓'}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {ASSISTANT_TIME_SLOTS.map((ts, tsIdx) => (
              <tr key={tsIdx} className={tsIdx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}>
                <td className="border border-gray-300 dark:border-gray-700 p-2 font-semibold text-gray-600 dark:text-gray-400 text-center bg-gray-100 dark:bg-gray-800 whitespace-nowrap">
                  {ts}
                </td>
                {DAYS_OF_WEEK.map((_, dIdx) => {
                  const cellAssignedSlots = assistantWeeklySlots.filter(
                    s => s.day === dIdx && s.timeSlotIndex === tsIdx
                  );
                  const hasConflict = cellAssignedSlots.some(s => conflicts.has(s.id));

                  return (
                    <td key={dIdx} className={`border border-gray-300 dark:border-gray-700 p-1.5 text-center align-middle ${
                      cellAssignedSlots.length > 0
                        ? hasConflict
                          ? 'bg-red-100 dark:bg-red-950/40 text-red-900 font-bold'
                          : 'bg-teal-50 dark:bg-teal-900/30'
                        : ''
                    }`}>
                      {cellAssignedSlots.length > 0 ? (
                        <div className="flex flex-wrap justify-center gap-1">
                          {cellAssignedSlots.map(slot => (
                            <span key={slot.id} className={`px-2.5 py-1 rounded-md text-xs font-bold border shadow-xs inline-block ${
                              hasConflict
                                ? 'bg-red-200 text-red-900 border-red-400'
                                : 'bg-teal-600 text-white border-teal-700'
                            }`}>
                              {hasConflict && '⚠️ '}
                              {locations[slot.locationIndex] ?? `Hely ${slot.locationIndex + 1}`}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 font-light">-</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-teal-100 dark:bg-teal-950 font-bold text-teal-900 dark:text-teal-200">
              <td className="border border-teal-300 dark:border-teal-800 p-2 text-center">Összesen:</td>
              {DAYS_OF_WEEK.map((_, dIdx) => {
                const daySlots = assistantWeeklySlots.filter(s => s.day === dIdx);
                const dayMin = daySlots.reduce(
                  (sum, s) => sum + (ASSISTANT_SLOT_DURATIONS[s.timeSlotIndex] ?? 0), 0
                );
                const isFullDay = dayMin >= 480;
                return (
                  <td key={dIdx} className={`border border-teal-300 dark:border-teal-800 p-2 text-center text-xs ${
                    isFullDay ? 'bg-emerald-800 text-white font-extrabold' : ''
                  }`}>
                    ⏱ {formatMinutes(dayMin)}{isFullDay && ' ✓'}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    );
  }
};
