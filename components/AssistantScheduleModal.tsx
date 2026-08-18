import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import type { Teacher, AssistantSlot, AssistantSchedule } from '../types.ts';
import { DAYS_OF_WEEK } from '../constants.ts';
import { PrintIcon } from './icons/PrintIcon.tsx';
import { getActiveRoomCode, subscribeToCloudDoc, saveToCloudDoc, CLIENT_ID } from '../services/firebaseSync.ts';
import { AssistantReplaceModal } from './AssistantReplaceModal.tsx';

// ─── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_ASSISTANT_TIME_SLOTS = [
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

/** Parse 'H.MM', 'HH.MM', 'H:MM', or 'HH:MM' string into total minutes from midnight */
export const parseHM = (t: string): number => {
  if (!t) return 0;
  const clean = t.trim().replace(':', '.');
  const [h, m] = clean.split('.').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Calculate duration in minutes for a time slot string e.g. "7.00–7.30" or "07:00 - 08:00" */
export const calculateSlotDuration = (slotStr: string): number => {
  if (!slotStr) return 45;
  const parts = slotStr.split(/[\u2013\u2014\-]/); // en-dash, em-dash, hyphen
  if (parts.length >= 2) {
    const startMin = parseHM(parts[0]);
    const endMin = parseHM(parts[1]);
    if (endMin > startMin) {
      return endMin - startMin;
    }
  }
  return 45;
};

/** Get the exact working duration of an assistant slot */
export const getSlotWorkingMinutes = (slot: AssistantSlot, timeSlotsList: string[]): number => {
  if (slot.customStartTime && slot.customEndTime) {
    const s = parseHM(slot.customStartTime);
    const e = parseHM(slot.customEndTime);
    if (e > s) return e - s;
  }
  if (typeof slot.customDurationMinutes === 'number' && slot.customDurationMinutes > 0) {
    return slot.customDurationMinutes;
  }
  const standardSlot = timeSlotsList[slot.timeSlotIndex];
  return calculateSlotDuration(standardSlot);
};

/** Format total minutes as 'X ó Y p' (or just 'Y p' if under an hour) */
export const formatMinutes = (total: number): string => {
  if (total <= 0) return '0 p';
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} p`;
  if (m === 0) return `${h} ó`;
  return `${h} ó ${m} p`;
};

// ─── Drag data types ──────────────────────────────────────────────────────────
const DRAG_ASSISTANT = 'application/assistant-id';
const DRAG_SLOT = 'application/assistant-slot';

const genId = () => Math.random().toString(36).slice(2, 10);

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

interface AssistantScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedAssistants: Teacher[];
  allTeachers: Teacher[];
}

export const AssistantScheduleModal: React.FC<AssistantScheduleModalProps> = ({
  isOpen,
  onClose,
  selectedAssistants,
  allTeachers,
}) => {
  // ── View Mode & Selection State ─────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<'daily' | 'individual'>('daily');
  const [selectedIndividualId, setSelectedIndividualId] = useState<string | null>(null);

  // ── Schedule State ──────────────────────────────────────────────────────────
  const [activeDay, setActiveDay] = useState(0);
  const [slots, setSlots] = useState<AssistantSlot[]>([]);
  const [locations, setLocations] = useState<string[]>(DEFAULT_LOCATIONS);
  const [timeSlots, setTimeSlots] = useState<string[]>(DEFAULT_ASSISTANT_TIME_SLOTS);
  const [assistantNames, setAssistantNames] = useState<Record<string, string>>({});
  const [selectedAssistantIds, setSelectedAssistantIds] = useState<string[]>([]);

  // ── Modals & Drawers ────────────────────────────────────────────────────────
  const [isEditingLocations, setIsEditingLocations] = useState(false);
  const [locationDraft, setLocationDraft] = useState('');
  const [isEditingTimeSlots, setIsEditingTimeSlots] = useState(false);
  const [timeSlotDraft, setTimeSlotDraft] = useState('');
  const [isReplaceModalOpen, setIsReplaceModalOpen] = useState(false);
  const [isCopyMenuOpen, setIsCopyMenuOpen] = useState(false);
  const [selectedSlotForDetail, setSelectedSlotForDetail] = useState<AssistantSlot | null>(null);

  // Drag & Conflict states
  const [dragOverCell, setDragOverCell] = useState<{ ts: number; loc: number } | null>(null);
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());

  // Refs
  const importFileRef = useRef<HTMLInputElement>(null);
  const dailyPrintRef = useRef<HTMLDivElement>(null);
  const individualPrintRef = useRef<HTMLDivElement>(null);
  const allIndividualPrintRef = useRef<HTMLDivElement>(null);

  // Color map
  const colorMap = useRef<Record<string, string>>({});
  const getColor = (id: string) => {
    if (!colorMap.current[id]) {
      const idx = Object.keys(colorMap.current).length % PASTEL_COLORS.length;
      colorMap.current[id] = PASTEL_COLORS[idx];
    }
    return colorMap.current[id];
  };

  // Helper for resolved assistant name
  const getAssistantName = useCallback((id: string) => {
    if (assistantNames[id]) return assistantNames[id];
    const found = allTeachers.find(t => t.id === id);
    return found ? found.name : id;
  }, [assistantNames, allTeachers]);

  // ── Load from localStorage & Cloud on open ──────────────────────────────────
  const loadFromStorage = useCallback(() => {
    try {
      const raw = localStorage.getItem(ASSISTANT_SCHEDULE_KEY);
      if (raw) {
        const saved: AssistantSchedule = JSON.parse(raw);
        if (Array.isArray(saved.slots)) setSlots(saved.slots);
        if (Array.isArray(saved.locations) && saved.locations.length) setLocations(saved.locations);
        if (Array.isArray(saved.timeSlots) && saved.timeSlots.length) setTimeSlots(saved.timeSlots);
        if (saved.assistantNames) setAssistantNames(saved.assistantNames);
        if (Array.isArray(saved.selectedAssistantIds)) {
          setSelectedAssistantIds(saved.selectedAssistantIds);
        }
      } else {
        setSelectedAssistantIds(selectedAssistants.map(a => a.id));
      }
    } catch {
      setSelectedAssistantIds(selectedAssistants.map(a => a.id));
    }
    selectedAssistants.forEach((a, i) => {
      colorMap.current[a.id] = PASTEL_COLORS[i % PASTEL_COLORS.length];
    });
  }, [selectedAssistants]);

  useEffect(() => {
    if (!isOpen) return;
    loadFromStorage();

    // Listen for custom assistant schedule update events
    const handleCustomUpdate = () => loadFromStorage();
    window.addEventListener('assistantScheduleUpdated', handleCustomUpdate);

    // Cloud Subscription for Assistant Schedule
    const roomCode = getActiveRoomCode();
    const unsubscribe = subscribeToCloudDoc<AssistantSchedule>(
      `rooms/${roomCode}/assistants/schedule`,
      (cloudSchedule, updatedBy) => {
        if (updatedBy !== CLIENT_ID && cloudSchedule) {
          if (Array.isArray(cloudSchedule.slots)) setSlots(cloudSchedule.slots);
          if (Array.isArray(cloudSchedule.locations) && cloudSchedule.locations.length) setLocations(cloudSchedule.locations);
          if (Array.isArray(cloudSchedule.timeSlots) && cloudSchedule.timeSlots.length) setTimeSlots(cloudSchedule.timeSlots);
          if (cloudSchedule.assistantNames) setAssistantNames(cloudSchedule.assistantNames);
          if (Array.isArray(cloudSchedule.selectedAssistantIds)) setSelectedAssistantIds(cloudSchedule.selectedAssistantIds);
        }
      }
    );

    return () => {
      window.removeEventListener('assistantScheduleUpdated', handleCustomUpdate);
      unsubscribe();
    };
  }, [isOpen, loadFromStorage]);

  // Derived list of visible assistants
  const visibleAssistants = useMemo(() => {
    // Collect all IDs: from selectedAssistantIds + any assistantId referenced in existing slots
    const allIds = Array.from(new Set([...selectedAssistantIds, ...slots.map(s => s.assistantId)]));
    return allIds.map(id => {
      const teacher = allTeachers.find(t => t.id === id);
      return {
        id,
        name: getAssistantName(id),
        availability: teacher?.availability ?? [],
        color: teacher?.color ?? '',
      } as Teacher;
    });
  }, [selectedAssistantIds, slots, allTeachers, getAssistantName]);

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
  const save = useCallback((
    newSlots: AssistantSlot[],
    newLocations: string[],
    newSelectedIds: string[],
    newTimeSlots?: string[],
    newAssistantNames?: Record<string, string>
  ) => {
    const state: AssistantSchedule = {
      slots: newSlots,
      locations: newLocations,
      selectedAssistantIds: newSelectedIds,
      timeSlots: newTimeSlots || timeSlots,
      assistantNames: newAssistantNames || assistantNames,
    };
    localStorage.setItem(ASSISTANT_SCHEDULE_KEY, JSON.stringify(state));

    const roomCode = getActiveRoomCode();
    if (roomCode) {
      saveToCloudDoc(`rooms/${roomCode}/assistants/schedule`, state);
    }
  }, [timeSlots, assistantNames]);

  // ── Export to JSON File ─────────────────────────────────────────────────────
  const handleExportJson = () => {
    const exportData = {
      app: 'Orarendkeszito',
      version: '3.1.0',
      exportedAt: new Date().toISOString(),
      assistantSchedule: {
        slots,
        locations,
        timeSlots,
        selectedAssistantIds,
        assistantNames,
      },
      assistants: visibleAssistants.map(a => ({
        id: a.id,
        name: a.name,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10);
    a.download = `asszisztens_beosztas_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Import from JSON File ───────────────────────────────────────────────────
  const handleImportJsonFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        const schedule = parsed.assistantSchedule || parsed;

        if (!schedule || !Array.isArray(schedule.slots)) {
          throw new Error('A fájl nem tartalmaz érvényes asszisztens beosztást.');
        }

        if (window.confirm('Biztosan be szeretnéd tölteni ezt az asszisztens beosztást? A jelenlegi nézet felülíródik.')) {
          const newSlots = schedule.slots || [];
          const newLocations = schedule.locations?.length ? schedule.locations : locations;
          const newTimeSlots = schedule.timeSlots?.length ? schedule.timeSlots : timeSlots;
          const newNames = schedule.assistantNames || assistantNames;
          const newSelectedIds = schedule.selectedAssistantIds || selectedAssistantIds;

          setSlots(newSlots);
          setLocations(newLocations);
          setTimeSlots(newTimeSlots);
          setAssistantNames(newNames);
          setSelectedAssistantIds(newSelectedIds);

          save(newSlots, newLocations, newSelectedIds, newTimeSlots, newNames);
          alert('Az asszisztens beosztás sikeresen betöltve!');
        }
      } catch (err: any) {
        console.error(err);
        alert(`Hiba a beosztás betöltésekor: ${err.message || 'Érvénytelen fájlformátum'}`);
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  // ── Paste from JSON text / clipboard ───────────────────────────────────────
  const handlePasteJsonText = () => {
    const text = prompt('Illeszd be ide a korábbi beosztás JSON szövegét (Ctrl+V):');
    if (!text) return;
    try {
      const parsed = JSON.parse(text.trim());
      const schedule = parsed.assistantSchedule || parsed;
      if (!schedule || !Array.isArray(schedule.slots)) {
        throw new Error('A beillesztett szöveg nem tartalmaz érvényes asszisztens beosztást.');
      }
      const newSlots = schedule.slots || [];
      const newLocations = schedule.locations?.length ? schedule.locations : locations;
      const newTimeSlots = schedule.timeSlots?.length ? schedule.timeSlots : timeSlots;
      const newNames = schedule.assistantNames || assistantNames;
      const newSelectedIds = schedule.selectedAssistantIds || selectedAssistantIds;

      setSlots(newSlots);
      setLocations(newLocations);
      setTimeSlots(newTimeSlots);
      setAssistantNames(newNames);
      setSelectedAssistantIds(newSelectedIds);

      save(newSlots, newLocations, newSelectedIds, newTimeSlots, newNames);
      alert('Az asszisztens beosztás sikeresen beillesztve és elmentve!');
    } catch (err: any) {
      alert(`Hiba a beillesztés során: ${err.message || 'Érvénytelen JSON formátum'}`);
    }
  };

  // ── Export to Excel (.xlsx) ─────────────────────────────────────────────────
  const handleExportExcel = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Daily Matrix Table for each day
      const dailyData: any[][] = [];
      DAYS_OF_WEEK.forEach((dayName, dIdx) => {
        dailyData.push([`=== ASSZISZTENS BEOSZTÁS – ${dayName.toUpperCase()} ===`]);
        const headerRow = ['Idősáv', ...locations];
        dailyData.push(headerRow);

        timeSlots.forEach((ts, tsIdx) => {
          const row = [ts];
          locations.forEach((_, locIdx) => {
            const cellSlots = slots.filter(
              s => s.day === dIdx && s.timeSlotIndex === tsIdx && s.locationIndex === locIdx
            );
            if (cellSlots.length > 0) {
              const names = cellSlots.map(s => {
                const name = getAssistantName(s.assistantId);
                const extra = s.customStartTime && s.customEndTime ? ` (${s.customStartTime}-${s.customEndTime})` : '';
                return `${name}${extra}`;
              }).join(', ');
              row.push(names);
            } else {
              row.push('');
            }
          });
          dailyData.push(row);
        });

        dailyData.push([]); // blank separator line
      });

      const wsDaily = XLSX.utils.aoa_to_sheet(dailyData);
      XLSX.utils.book_append_sheet(wb, wsDaily, 'Napi helyszínes');

      // Sheet 2: Individual weekly schedules with hours sum
      const individualData: any[][] = [];
      visibleAssistants.forEach(assistant => {
        const assistantWeeklySlots = slots.filter(s => s.assistantId === assistant.id);
        const weeklyMinutes = assistantWeeklySlots.reduce(
          (sum, s) => sum + getSlotWorkingMinutes(s, timeSlots), 0
        );

        individualData.push([`DOLGOZÓ: ${assistant.name}`, `Heti összidő: ${formatMinutes(weeklyMinutes)}`]);
        const headerRow = ['Idősáv', ...DAYS_OF_WEEK];
        individualData.push(headerRow);

        timeSlots.forEach((ts, tsIdx) => {
          const row = [ts];
          DAYS_OF_WEEK.forEach((_, dIdx) => {
            const cellAssigned = assistantWeeklySlots.filter(
              s => s.day === dIdx && s.timeSlotIndex === tsIdx
            );
            if (cellAssigned.length > 0) {
              const locs = cellAssigned.map(s => {
                const loc = locations[s.locationIndex] || `Hely ${s.locationIndex + 1}`;
                const extra = s.customStartTime && s.customEndTime ? ` [${s.customStartTime}-${s.customEndTime}]` : '';
                return `${loc}${extra}`;
              }).join(', ');
              row.push(locs);
            } else {
              row.push('');
            }
          });
          individualData.push(row);
        });

        // Daily total row
        const sumRow = ['Összesen:'];
        DAYS_OF_WEEK.forEach((_, dIdx) => {
          const daySlots = assistantWeeklySlots.filter(s => s.day === dIdx);
          const dayMin = daySlots.reduce((sum, s) => sum + getSlotWorkingMinutes(s, timeSlots), 0);
          sumRow.push(formatMinutes(dayMin));
        });
        individualData.push(sumRow);
        individualData.push([]); // separator
      });

      const wsIndividual = XLSX.utils.aoa_to_sheet(individualData);
      XLSX.utils.book_append_sheet(wb, wsIndividual, 'Egyéni órarendek');

      const date = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `asszisztens_beosztas_${date}.xlsx`);
    } catch (err) {
      console.error('Hiba az Excel export során:', err);
      alert('Hiba történt az Excel fájl generálása közben.');
    }
  };

  // ── Handle Replace / Rename Assistant ───────────────────────────────────────
  const handleApplyReplace = (
    oldAssistantId: string,
    newAssistantId: string,
    newCustomName?: string
  ) => {
    let updatedNames = { ...assistantNames };
    if (newCustomName) {
      updatedNames[newAssistantId] = newCustomName;
    }

    let updatedSlots = slots;
    let updatedSelectedIds = [...selectedAssistantIds];

    if (oldAssistantId !== newAssistantId) {
      // Re-map all slots from old to new
      updatedSlots = slots.map(s =>
        s.assistantId === oldAssistantId ? { ...s, assistantId: newAssistantId } : s
      );
      // Update selectedAssistantIds
      if (!updatedSelectedIds.includes(newAssistantId)) {
        updatedSelectedIds.push(newAssistantId);
      }
    }

    setAssistantNames(updatedNames);
    setSlots(updatedSlots);
    setSelectedAssistantIds(updatedSelectedIds);
    save(updatedSlots, locations, updatedSelectedIds, timeSlots, updatedNames);

    alert(`A módosítás sikeresen megtörtént! ${updatedSlots.filter(s => s.assistantId === newAssistantId).length} idősáv frissült.`);
  };

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
    const slotId = e.dataTransfer.getData(DRAG_SLOT);

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
      save(updated, locations, selectedAssistantIds, timeSlots, assistantNames);
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
      save(updated, locations, selectedAssistantIds, timeSlots, assistantNames);
    }
  };

  const handleRemoveSlot = (slotId: string) => {
    const updated = slots.filter(s => s.id !== slotId);
    setSlots(updated);
    save(updated, locations, selectedAssistantIds, timeSlots, assistantNames);
  };

  const handleClearDay = () => {
    if (window.confirm(`${DAYS_OF_WEEK[activeDay]} nap összes beosztását törölni szeretnéd?`)) {
      const updated = slots.filter(s => s.day !== activeDay);
      setSlots(updated);
      save(updated, locations, selectedAssistantIds, timeSlots, assistantNames);
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Biztosan törlöd az összes asszisztens beosztást minden napról?')) {
      setSlots([]);
      save([], locations, selectedAssistantIds, timeSlots, assistantNames);
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
    save(updated, locations, selectedAssistantIds, timeSlots, assistantNames);
  };

  // ── Location management ────────────────────────────────────────────────────
  const handleAddLocation = () => {
    const trimmed = locationDraft.trim();
    if (!trimmed || locations.includes(trimmed)) return;
    const updated = [...locations, trimmed];
    setLocations(updated);
    setLocationDraft('');
    save(slots, updated, selectedAssistantIds, timeSlots, assistantNames);
  };

  const handleRemoveLocation = (idx: number) => {
    const updated = locations.filter((_, i) => i !== idx);
    const updatedSlots = slots
      .filter(s => s.locationIndex !== idx)
      .map(s => ({ ...s, locationIndex: s.locationIndex > idx ? s.locationIndex - 1 : s.locationIndex }));
    setLocations(updated);
    setSlots(updatedSlots);
    save(updatedSlots, updated, selectedAssistantIds, timeSlots, assistantNames);
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
    save(updatedSlots, updated, selectedAssistantIds, timeSlots, assistantNames);
  };

  // ── Time Slot Management ───────────────────────────────────────────────────
  const handleAddTimeSlot = () => {
    const trimmed = timeSlotDraft.trim();
    if (!trimmed || timeSlots.includes(trimmed)) return;
    const updated = [...timeSlots, trimmed];
    setTimeSlots(updated);
    setTimeSlotDraft('');
    save(slots, locations, selectedAssistantIds, updated, assistantNames);
  };

  const handleRemoveTimeSlot = (idx: number) => {
    if (timeSlots.length <= 1) {
      alert('Legalább egy idősávnak maradnia kell!');
      return;
    }
    const updated = timeSlots.filter((_, i) => i !== idx);
    const updatedSlots = slots
      .filter(s => s.timeSlotIndex !== idx)
      .map(s => ({ ...s, timeSlotIndex: s.timeSlotIndex > idx ? s.timeSlotIndex - 1 : s.timeSlotIndex }));
    setTimeSlots(updated);
    setSlots(updatedSlots);
    save(updatedSlots, locations, selectedAssistantIds, updated, assistantNames);
  };

  const handleMoveTimeSlot = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= timeSlots.length) return;
    const updated = [...timeSlots];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    const updatedSlots = slots.map(s => {
      if (s.timeSlotIndex === idx) return { ...s, timeSlotIndex: newIdx };
      if (s.timeSlotIndex === newIdx) return { ...s, timeSlotIndex: idx };
      return s;
    });
    setTimeSlots(updated);
    setSlots(updatedSlots);
    save(updatedSlots, locations, selectedAssistantIds, updated, assistantNames);
  };

  const handleUpdateTimeSlotText = (idx: number, newText: string) => {
    const updated = [...timeSlots];
    updated[idx] = newText;
    setTimeSlots(updated);
    save(slots, locations, selectedAssistantIds, updated, assistantNames);
  };

  // ── Update Single Slot Details ──────────────────────────────────────────────
  const handleSaveSlotDetail = (slotId: string, customStart: string, customEnd: string, noteText: string) => {
    const updated = slots.map(s => {
      if (s.id === slotId) {
        return {
          ...s,
          customStartTime: customStart.trim() || undefined,
          customEndTime: customEnd.trim() || undefined,
          note: noteText.trim() || undefined,
        };
      }
      return s;
    });
    setSlots(updated);
    save(updated, locations, selectedAssistantIds, timeSlots, assistantNames);
    setSelectedSlotForDetail(null);
  };

  // ── Cell Helpers ─────────────────────────────────────────────────────────────
  const getCellSlots = (ts: number, loc: number) =>
    slots.filter(s => s.day === activeDay && s.timeSlotIndex === ts && s.locationIndex === loc);

  const conflictCount = conflicts.size > 0
    ? slots.filter(s => s.day === activeDay && conflicts.has(s.id)).length
    : 0;

  // ── Print Engine ────────────────────────────────────────────────────────────
  const triggerPrint = (targetElement: HTMLElement) => {
    const rootElement = document.getElementById('root');
    if (!rootElement || !targetElement) return;

    const printContents = targetElement.cloneNode(true) as HTMLElement;
    printContents.querySelectorAll('.no-print').forEach(el => el.remove());
    printContents.style.minWidth = '0';
    printContents.style.maxWidth = '100%';
    printContents.querySelectorAll('table, th, td, div').forEach(el => {
      const htmlEl = el as HTMLElement;
      if (htmlEl.style) {
        htmlEl.style.minWidth = '0';
        htmlEl.style.maxWidth = '100%';
      }
    });

    const printHost = document.createElement('div');
    printHost.id = 'print-container';
    printHost.appendChild(printContents);

    const originalDisplay = rootElement.style.display;
    rootElement.style.display = 'none';
    document.body.appendChild(printHost);

    const cleanup = () => {
      rootElement.style.display = originalDisplay;
      if (document.body.contains(printHost)) {
        document.body.removeChild(printHost);
      }
      window.removeEventListener('afterprint', cleanup);
    };

    window.removeEventListener('afterprint', cleanup);
    window.addEventListener('afterprint', cleanup);
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
    <div className="fixed inset-0 bg-black/70 flex justify-center items-center z-50 p-2">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col"
           style={{ width: '98vw', height: '96vh', maxWidth: '1850px' }}
           onClick={e => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0 no-print">
          <div className="flex items-center gap-3">
            <span className="text-2xl">👤</span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Asszisztens Beosztás</h2>
                <span className="px-2 py-0.5 text-[10px] font-bold bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300 rounded-md">
                  v3.1.0
                </span>
              </div>
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
            {/* Replace / Rename Assistant Button */}
            <button
              onClick={() => setIsReplaceModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 rounded-lg hover:bg-purple-200 transition-colors flex items-center gap-1"
              title="Dolgozó átnevezése vagy cseréje a beosztás megtartásával">
              <span>🔄</span>
              <span>Dolgozó cseréje</span>
            </button>

            {/* Time Slot Editor Toggle */}
            <button
              onClick={() => {
                setIsEditingTimeSlots(v => !v);
                setIsEditingLocations(false);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${
                isEditingTimeSlots
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              title="Bal oldali idősávok testreszabása">
              <span>⏰</span>
              <span>Idősávok</span>
            </button>

            {/* Location Editor Toggle */}
            <button
              onClick={() => {
                setIsEditingLocations(v => !v);
                setIsEditingTimeSlots(false);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${
                isEditingLocations
                  ? 'bg-amber-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
              title="Helyszínek szerkesztése">
              <span>✏️</span>
              <span>Helyszínek</span>
            </button>

            {/* Export & Import JSON */}
            <button
              onClick={handleExportJson}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-lg hover:bg-emerald-200 transition-colors flex items-center gap-1"
              title="Beosztás mentése JSON fájlba (másik gépre való átvitelhez)">
              <span>💾</span>
              <span>Mentés</span>
            </button>

            <label className="px-3 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer flex items-center gap-1"
                   title="Korábbi JSON mentés betöltése fájlból">
              <span>📂</span>
              <span>Betöltés</span>
              <input
                ref={importFileRef}
                type="file"
                accept=".json"
                onChange={handleImportJsonFile}
                className="hidden"
              />
            </label>

            <button
              onClick={handlePasteJsonText}
              className="px-3 py-1.5 text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 transition-colors flex items-center gap-1"
              title="Asszisztens beosztás beillesztése vágólapról vagy szövegből">
              <span>📋</span>
              <span>Beillesztés</span>
            </button>

            {/* Excel Export */}
            <button
              onClick={handleExportExcel}
              className="px-3 py-1.5 text-xs font-semibold bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 rounded-lg hover:bg-teal-200 transition-colors flex items-center gap-1"
              title="Exportálás Excel (.xlsx) fájlba">
              <span>📊</span>
              <span>Excel</span>
            </button>

            {viewMode === 'daily' && (
              <>
                <div className="relative">
                  <button
                    onClick={() => setIsCopyMenuOpen(v => !v)}
                    disabled={slots.filter(s => s.day === activeDay).length === 0}
                    className="px-3 py-1.5 text-xs font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Nap beosztásának másolása más napra">
                    📋 Másolás…
                  </button>
                  {isCopyMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden">
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
                  className="px-2.5 py-1.5 text-xs font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 rounded-lg hover:bg-orange-200 transition-colors"
                  title="Mai nap beosztásának törlése">
                  🗑 Nap
                </button>
                <button onClick={handleClearAll}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 rounded-lg hover:bg-red-200 transition-colors"
                  title="Összes beosztás törlése">
                  🗑 Összes
                </button>
              </>
            )}

            {viewMode === 'individual' && (
              <button onClick={handlePrintAllIndividual}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 rounded-lg hover:bg-indigo-200 transition-colors"
                title="Összes asszisztens egyéni órarendjének kinyomtatása">
                🖨️ Összes nyomtatása
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

        {/* ── Time Slot Editor (collapsible) ── */}
        {isEditingTimeSlots && (
          <div className="px-5 py-3 bg-blue-50 dark:bg-blue-950/20 border-b border-blue-200 dark:border-blue-800 shrink-0 no-print">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-blue-900 dark:text-blue-300">
                ⏰ Idősávok testreszabása
              </h3>
              <span className="text-xs text-blue-700 dark:text-blue-400">
                (A formátum lehet pl. 7.00–7.30, 08:00–08:45)
              </span>
            </div>
            <div className="flex flex-wrap gap-2 mb-3 max-h-36 overflow-y-auto p-1">
              {timeSlots.map((ts, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 rounded-lg px-2 py-1 text-xs shadow-xs">
                  <button onClick={() => handleMoveTimeSlot(idx, -1)} disabled={idx === 0}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-20 font-bold">◀</button>
                  <input
                    type="text"
                    value={ts}
                    onChange={e => handleUpdateTimeSlotText(idx, e.target.value)}
                    className="font-semibold text-gray-800 dark:text-gray-200 w-24 text-center bg-transparent border-b border-dashed border-gray-300 focus:outline-none focus:border-blue-500"
                  />
                  <button onClick={() => handleMoveTimeSlot(idx, 1)} disabled={idx === timeSlots.length - 1}
                    className="text-gray-400 hover:text-gray-700 disabled:opacity-20 font-bold">▶</button>
                  <button onClick={() => handleRemoveTimeSlot(idx)}
                    className="text-red-400 hover:text-red-600 ml-1 font-bold">✕</button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={timeSlotDraft} onChange={e => setTimeSlotDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTimeSlot()}
                placeholder="Új idősáv (pl. 16.00–16.30)…"
                className="px-3 py-1.5 text-sm border border-blue-300 dark:border-blue-700 rounded-lg bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-400 w-64"/>
              <button onClick={handleAddTimeSlot}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors">
                + Új idősáv hozzáadása
              </button>
              <button onClick={() => setIsEditingTimeSlots(false)}
                className="px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 text-xs font-semibold rounded-lg hover:bg-gray-300 transition-colors ml-auto">
                Kész
              </button>
            </div>
          </div>
        )}

        {/* ── Location Editor (collapsible) ── */}
        {isEditingLocations && (
          <div className="px-5 py-3 bg-amber-50 dark:bg-amber-900/10 border-b border-amber-200 dark:border-amber-800 shrink-0 no-print">
            <h3 className="text-sm font-bold text-amber-800 dark:text-amber-300 mb-2">✏️ Helyszínek szerkesztése</h3>
            <div className="flex flex-wrap gap-2 mb-3 max-h-36 overflow-y-auto p-1">
              {locations.map((loc, idx) => (
                <div key={idx} className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-600 rounded-lg px-2 py-1 text-xs shadow-xs">
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
            <div className="flex gap-1 px-5 py-2 border-b border-gray-200 dark:border-gray-700 shrink-0 no-print items-center">
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
              <div className="ml-4 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <span>{slots.filter(s => s.day === activeDay).length} beosztás ezen a napon</span>
                <span className="text-gray-300 dark:text-gray-600">•</span>
                <span className="italic">Kattints egy beosztásra az egyedi idő/megjegyzés szerkesztéséhez!</span>
              </div>
            </div>

            {/* Printable Daily Block */}
            <div ref={dailyPrintRef} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Print Header */}
              <div className="p-3 border-b text-center hidden print:block">
                <h2 className="text-xl font-bold text-gray-900">
                  Asszisztens Beosztás – {DAYS_OF_WEEK[activeDay]}
                </h2>
              </div>

              {/* Grid + Sidebar */}
              <div className="flex flex-1 min-h-0 overflow-hidden">
                <div className="flex-1 overflow-auto p-3">
                  <table className="border-collapse w-full text-xs" style={{ minWidth: `${100 + locations.length * 95}px` }}>
                    <thead>
                      <tr className="bg-teal-50 dark:bg-teal-950/40">
                        <th className="border border-gray-300 dark:border-gray-600 p-2 font-bold text-gray-700 dark:text-gray-300 whitespace-nowrap bg-teal-100 dark:bg-teal-900/40 text-center"
                            style={{ minWidth: '95px' }}>
                          Idősáv
                        </th>
                        {locations.map((loc, lIdx) => (
                          <th key={lIdx}
                              className="border border-gray-300 dark:border-gray-600 p-2 font-bold text-teal-800 dark:text-teal-300 text-center whitespace-nowrap"
                              style={{ minWidth: '90px' }}>
                            {loc}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {timeSlots.map((ts, tsIdx) => {
                        const standardDuration = calculateSlotDuration(ts);
                        const rowMinHeight = Math.max(50, Math.round((standardDuration / 45) * 54));

                        return (
                          <tr key={tsIdx} className={tsIdx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}>
                            <td className="border border-gray-300 dark:border-gray-600 p-2 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap text-center bg-teal-50/80 dark:bg-teal-950/40"
                                style={{ minHeight: `${rowMinHeight}px` }}>
                              <div className="font-bold text-xs text-teal-950 dark:text-teal-200">{ts}</div>
                              <div className="text-[10px] font-semibold text-teal-700 dark:text-teal-400 mt-0.5 bg-teal-100/70 dark:bg-teal-900/50 px-1.5 py-0.5 rounded-full inline-block">
                                ⏱ {standardDuration} perc
                              </div>
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
                                    style={{ minHeight: `${rowMinHeight}px`, verticalAlign: 'top' }}>
                                  <div className="flex flex-col gap-1.5">
                                    {cellSlots.map(slot => {
                                      const displayName = getAssistantName(slot.assistantId);
                                      const isConflict = conflicts.has(slot.id);
                                      const colorClass = getColor(slot.assistantId);
                                      const hasCustomTime = !!(slot.customStartTime && slot.customEndTime);
                                      const slotMinutes = getSlotWorkingMinutes(slot, timeSlots);
                                      const cardHeightPx = Math.max(42, Math.min(300, Math.round((slotMinutes / 45) * 50)));

                                      return (
                                        <div key={slot.id}
                                             draggable
                                             onDragStart={e => handleDragStartSlot(e, slot.id)}
                                             onClick={() => setSelectedSlotForDetail(slot)}
                                             style={{ minHeight: `${cardHeightPx}px` }}
                                             className={`flex flex-col justify-between p-1.5 rounded-lg text-[11px] font-semibold border cursor-pointer active:cursor-grabbing hover:ring-2 hover:ring-blue-400 shadow-xs transition-all ${
                                               isConflict
                                                 ? 'bg-red-200 text-red-900 border-red-400 dark:bg-red-800/60 dark:text-red-200'
                                                 : colorClass
                                             } ${hasCustomTime ? 'border-l-4 border-l-amber-500 ring-1 ring-amber-400/50' : ''}`}
                                             title={isConflict ? '⚠️ Ütközés! Ez az asszisztens már máshol is be van osztva.' : 'Kattints az egyedi idő vagy részletek módosításához'}>
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="truncate font-bold">
                                              {isConflict && '⚠️ '}
                                              {displayName}
                                            </span>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleRemoveSlot(slot.id);
                                              }}
                                              className="shrink-0 text-current opacity-60 hover:opacity-100 leading-none no-print font-bold text-sm px-0.5"
                                              title="Törlés">
                                              ×
                                            </button>
                                          </div>

                                          {/* Time interval and Duration badge */}
                                          <div className="mt-1 pt-1 border-t border-black/10 dark:border-white/10 flex flex-col gap-0.5">
                                            <div className={`flex items-center justify-between gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                              hasCustomTime
                                                ? 'bg-amber-400/30 text-amber-950 dark:text-amber-200 border border-amber-500/40'
                                                : 'bg-black/10 dark:bg-white/10'
                                            }`}>
                                              <span>
                                                ⏰ {hasCustomTime ? `${slot.customStartTime}–${slot.customEndTime}` : ts}
                                              </span>
                                              <span className="text-[9px] font-extrabold px-1 bg-black/15 dark:bg-white/20 rounded">
                                                {slotMinutes} perc
                                              </span>
                                            </div>
                                            {slot.note && (
                                              <span className="text-[9px] font-normal italic opacity-90 truncate">
                                                📝 {slot.note}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Sidebar */}
                <div className="w-60 shrink-0 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex flex-col overflow-hidden no-print">
                  <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        👤 Dolgozók ({visibleAssistants.length})
                      </h3>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">Húzd a kívánt cellába</p>
                    </div>
                    <button
                      onClick={() => setIsReplaceModalOpen(true)}
                      className="text-purple-600 hover:text-purple-800 dark:text-purple-400 text-xs font-bold"
                      title="Névcsere / Átnevezés">
                      🔄 Csere
                    </button>
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
                        (sum, s) => sum + getSlotWorkingMinutes(s, timeSlots),
                        0
                      );

                      const isFullDay = totalMinutes >= 480;

                      return (
                        <div key={assistant.id}
                             draggable
                             onDragStart={e => handleDragStartAssistant(e, assistant.id)}
                             className={`px-2.5 py-2 rounded-xl border font-semibold text-xs cursor-grab active:cursor-grabbing select-none shadow-xs transition-all hover:shadow-md ${colorClass} ${
                               hasConflictToday ? 'ring-2 ring-red-400' : ''
                             }`}
                             title={hasConflictToday ? '⚠️ Ütközés van ezen a napon!' : 'Húzd a táblára'}>
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate">{assistant.name}</span>
                            {hasConflictToday && <span title="Ütközés!">⚠️</span>}
                          </div>
                          {daySlots.length > 0 ? (
                            <div className="flex items-center justify-between mt-1 pt-1 border-t border-black/10 dark:border-white/10">
                              <span className="text-[9px] opacity-70">
                                {daySlots.length}× sáv
                              </span>
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded transition-colors ${
                                isFullDay
                                  ? 'bg-emerald-800 text-white shadow-xs ring-1 ring-emerald-500 font-extrabold'
                                  : 'opacity-90 bg-black/10 dark:bg-white/10'
                              }`}
                              title={isFullDay ? 'Elérte a 8 órát!' : 'Mai összesített munkaidő'}>
                                ⏱ {formatMinutes(totalMinutes)}
                                {isFullDay && ' ✓'}
                              </span>
                            </div>
                          ) : (
                            <div className="text-[9px] opacity-50 mt-1">Nincs beosztás ma</div>
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
                  (sum, s) => sum + getSlotWorkingMinutes(s, timeSlots),
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

      {/* ── Slot Detail & Custom Time Edit Modal ── */}
      {selectedSlotForDetail && (
        <SlotDetailModal
          slot={selectedSlotForDetail}
          assistantName={getAssistantName(selectedSlotForDetail.assistantId)}
          locationName={locations[selectedSlotForDetail.locationIndex] || ''}
          standardTimeSlot={timeSlots[selectedSlotForDetail.timeSlotIndex] || ''}
          onClose={() => setSelectedSlotForDetail(null)}
          onSave={handleSaveSlotDetail}
          onDelete={() => {
            handleRemoveSlot(selectedSlotForDetail.id);
            setSelectedSlotForDetail(null);
          }}
        />
      )}

      {/* ── Assistant Replace & Rename Modal ── */}
      {isReplaceModalOpen && (
        <AssistantReplaceModal
          isOpen={isReplaceModalOpen}
          onClose={() => setIsReplaceModalOpen(false)}
          allTeachers={allTeachers}
          selectedAssistantIds={visibleAssistants.map(a => a.id)}
          slots={slots}
          assistantNames={assistantNames}
          onApplyReplace={handleApplyReplace}
        />
      )}
    </div>
  );

  // ── Helper to render a single assistant's weekly timetable block ─────────────
  function renderIndividualTimetable(assistant: Teacher) {
    const assistantWeeklySlots = slots.filter(s => s.assistantId === assistant.id);
    const weeklyMinutes = assistantWeeklySlots.reduce(
      (sum, s) => sum + getSlotWorkingMinutes(s, timeSlots),
      0
    );

    return (
      <div className="mb-8 bg-white dark:bg-gray-900 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
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
                  (sum, s) => sum + getSlotWorkingMinutes(s, timeSlots), 0
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
            {timeSlots.map((ts, tsIdx) => {
              const standardDuration = calculateSlotDuration(ts);
              const rowMinHeight = Math.max(46, Math.round((standardDuration / 45) * 50));

              return (
                <tr key={tsIdx} className={tsIdx % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50 dark:bg-gray-800/50'}>
                  <td className="border border-gray-300 dark:border-gray-700 p-2 font-semibold text-gray-700 dark:text-gray-300 text-center bg-gray-100 dark:bg-gray-800 whitespace-nowrap"
                      style={{ minHeight: `${rowMinHeight}px` }}>
                    <div className="font-bold text-xs">{ts}</div>
                    <div className="text-[10px] text-gray-500 font-medium mt-0.5">⏱ {standardDuration} perc</div>
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
                      }`} style={{ minHeight: `${rowMinHeight}px` }}>
                        {cellAssignedSlots.length > 0 ? (
                          <div className="flex flex-wrap justify-center gap-1">
                            {cellAssignedSlots.map(slot => {
                              const slotMin = getSlotWorkingMinutes(slot, timeSlots);
                              const hasCustom = !!(slot.customStartTime && slot.customEndTime);
                              const cardHeight = Math.max(38, Math.min(240, Math.round((slotMin / 45) * 44)));

                              return (
                                <div key={slot.id}
                                     style={{ minHeight: `${cardHeight}px` }}
                                     className={`flex flex-col items-center justify-between p-1.5 rounded-lg border shadow-xs text-xs font-semibold ${
                                       hasConflict
                                         ? 'bg-red-200 text-red-900 border-red-400'
                                         : 'bg-teal-600 text-white border-teal-700'
                                     } ${hasCustom ? 'ring-2 ring-amber-400' : ''}`}>
                                  <span className="font-bold">
                                    {hasConflict && '⚠️ '}
                                    {locations[slot.locationIndex] ?? `Hely ${slot.locationIndex + 1}`}
                                  </span>
                                  <div className="mt-1 flex items-center gap-1 text-[10px] bg-black/20 px-1.5 py-0.5 rounded font-bold">
                                    <span>⏰ {hasCustom ? `${slot.customStartTime}–${slot.customEndTime}` : ts}</span>
                                    <span>({slotMin}p)</span>
                                  </div>
                                  {slot.note && (
                                    <span className="text-[9px] italic opacity-90 mt-0.5">
                                      📝 {slot.note}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-gray-300 dark:text-gray-600 font-light">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-teal-100 dark:bg-teal-950 font-bold text-teal-900 dark:text-teal-200">
              <td className="border border-teal-300 dark:border-teal-800 p-2 text-center">Összesen:</td>
              {DAYS_OF_WEEK.map((_, dIdx) => {
                const daySlots = assistantWeeklySlots.filter(s => s.day === dIdx);
                const dayMin = daySlots.reduce(
                  (sum, s) => sum + getSlotWorkingMinutes(s, timeSlots), 0
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

// ─── Mini Modal for Individual Slot Custom Time Editing ───────────────────────
interface SlotDetailModalProps {
  slot: AssistantSlot;
  assistantName: string;
  locationName: string;
  standardTimeSlot: string;
  onClose: () => void;
  onSave: (slotId: string, customStart: string, customEnd: string, note: string) => void;
  onDelete: () => void;
}

const SlotDetailModal: React.FC<SlotDetailModalProps> = ({
  slot,
  assistantName,
  locationName,
  standardTimeSlot,
  onClose,
  onSave,
  onDelete,
}) => {
  const [customStart, setCustomStart] = useState(slot.customStartTime || '');
  const [customEnd, setCustomEnd] = useState(slot.customEndTime || '');
  const [note, setNote] = useState(slot.note || '');

  // Parse default start from standardTimeSlot
  const defaultSlotStart = useMemo(() => {
    const parts = standardTimeSlot.split(/[-–—]/);
    return parts[0]?.trim().replace('.', ':') || '07:30';
  }, [standardTimeSlot]);

  // Compute live duration
  const currentDurationMin = useMemo(() => {
    if (customStart && customEnd) {
      const s = parseHM(customStart);
      const e = parseHM(customEnd);
      if (e > s) return e - s;
    }
    return calculateSlotDuration(standardTimeSlot);
  }, [customStart, customEnd, standardTimeSlot]);

  const estimatedCardHeight = Math.max(42, Math.min(300, Math.round((currentDurationMin / 45) * 50)));

  // Helper to apply duration preset
  const applyPreset = (minutes: number) => {
    const startStr = customStart || defaultSlotStart;
    const startMin = parseHM(startStr);
    const endMin = startMin + minutes;
    const endH = Math.floor(endMin / 60) % 24;
    const endM = endMin % 60;
    const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    setCustomStart(startStr);
    setCustomEnd(endStr);
  };

  const clearCustomTime = () => {
    setCustomStart('');
    setCustomEnd('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md overflow-hidden flex flex-col"
           onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
          <div className="flex items-center gap-2">
            <span className="text-xl">⏱️</span>
            <div>
              <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                Beosztási munkaidő és idősáv beállítása
              </h3>
              <p className="text-xs text-gray-500">
                {assistantName} • {locationName}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">
            &times;
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          <div className="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl text-xs space-y-1">
            <div><strong>Alapértelmezett sáv:</strong> {standardTimeSlot}</div>
            <div><strong>Helyszín:</strong> {locationName}</div>
            <div><strong>Dolgozó:</strong> {assistantName}</div>
          </div>

          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1.5">
              ⚡ Gyors időtartam gombok (automatikus időbeállítás):
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '30 perc', min: 30 },
                { label: '45 perc', min: 45 },
                { label: '60 perc (1ó)', min: 60 },
                { label: '90 perc (1.5ó)', min: 90 },
                { label: '120 perc (2ó)', min: 120 },
                { label: '180 perc (3ó)', min: 180 },
                { label: '240 perc (4ó)', min: 240 },
              ].map(p => (
                <button
                  key={p.min}
                  type="button"
                  onClick={() => applyPreset(p.min)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                    currentDurationMin === p.min && customStart && customEnd
                      ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-blue-900/30'
                  }`}
                >
                  {p.label}
                </button>
              ))}
              {(customStart || customEnd) && (
                <button
                  type="button"
                  onClick={clearCustomTime}
                  className="px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                >
                  Visszaállítás alapra
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Pontos kezdési és befejezési idő (óra:perc):
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-gray-500">Kezdés (pl. 07:30)</span>
                <input
                  type="text"
                  placeholder={defaultSlotStart}
                  value={customStart}
                  onChange={e => setCustomStart(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-mono"
                />
              </div>
              <div>
                <span className="text-[10px] text-gray-500">Végzés (pl. 09:30)</span>
                <input
                  type="text"
                  placeholder="08:15"
                  value={customEnd}
                  onChange={e => setCustomEnd(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-mono"
                />
              </div>
            </div>

            {/* Live Duration and Size Preview */}
            <div className="mt-2.5 p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl flex items-center justify-between text-xs">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Számított munkaidő:</span>{' '}
                <strong className="text-blue-900 dark:text-blue-200 text-sm">{formatMinutes(currentDurationMin)}</strong>{' '}
                <span className="text-blue-600 dark:text-blue-400 font-semibold">({currentDurationMin} perc)</span>
              </div>
              <div className="text-[10px] font-semibold bg-blue-200/70 dark:bg-blue-800/60 text-blue-900 dark:text-blue-100 px-2 py-0.5 rounded-full"
                   title="A kártya magassága a naptárban ehhez az időtartamhoz igazodik">
                📐 {estimatedCardHeight}px magasság
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Megjegyzés / Tevékenység (opcionális):
            </label>
            <input
              type="text"
              placeholder="Pl. udvari felügyelet, kísérés, étkeztetés..."
              value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-850">
          <button
            type="button"
            onClick={onDelete}
            className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors">
            🗑 Elem törlése
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 rounded-lg">
              Mégse
            </button>
            <button
              type="button"
              onClick={() => onSave(slot.id, customStart, customEnd, note)}
              className="px-4 py-1.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs">
              Mentés
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
