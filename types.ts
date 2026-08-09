
export interface Subject {
  id: string;
  name: string;
}

export interface Teacher {
  id: string;
  name: string;
  availability: boolean[][]; // [dayIndex][periodIndex]
  color: string;
  isTraveling?: boolean;
}

export interface Class {
  id:string;
  name: string;
}

// Represents the initial data from the "Kréta" file
export interface Allocation {
  id: string;
  teacherId: string;
  classId: string;
  subjectId: string;
  weeklyHours: number;
  originalClass?: string;
  originalGroup?: string;
}

// Represents a lesson that is placed on the timetable
export interface PlacedLesson {
  id: string; // Unique ID for this specific lesson instance, e.g., `${allocation.id}-1`
  allocation: Allocation;
  day: number;
  period: number;
}

// Represents the draggable items
export interface UnplacedLesson {
  allocation: Allocation;
  remainingHours: number;
}

export interface TimetableCellData {
  day: number;
  period: number;
}

export enum DragType {
  LESSON = 'application/lesson-data',
}

export type Collision = {
  teacher: boolean;
  class: boolean;
  availability: boolean;
};

// Represents the structure of the state that is tracked in history
export interface AppHistoryState {
  teachers: Teacher[];
  classes: Class[];
  subjects: Subject[];
  allocations: Allocation[];
  placedLessons: PlacedLesson[];
}

// Represents the structure of the saved state in localStorage
export interface SavedState extends AppHistoryState {
  version: string;
  selectedTeacherId: string | null;
  selectedClassId: string | null;
  driveFileId: string | null;
}

export interface ParsedData {
  teachers: Teacher[];
  classes: Class[];
  subjects: Subject[];
  allocations: Allocation[];
}

export interface AllocationUpdateSummary {
  newTeachers: Teacher[];
  removedTeachers: Teacher[];
  newClasses: Class[];
  removedClasses: Class[];
  newSubjects: Subject[];
  removedSubjects: Subject[];
  newAllocations: Allocation[];
  removedAllocations: Allocation[];
  modifiedAllocations: { old: Allocation; new: Allocation }[];
  lessonsToRemove: PlacedLesson[];
}

export interface ParallelLessonConfirmation {
  allocation: Allocation;
  cell: TimetableCellData;
  collision: Collision;
  existingLessons: PlacedLesson[];
}

// ---- Asszisztens Beosztás ----

/** One assigned slot: assistant X is at location Y during timeslot Z on day D */
export interface AssistantSlot {
  id: string;
  assistantId: string;  // references Teacher.id
  day: number;          // 0=Mon … 4=Fri
  timeSlotIndex: number; // index into ASSISTANT_TIME_SLOTS array
  locationIndex: number; // index into locations array
}

/** Full assistant schedule state, stored in localStorage */
export interface AssistantSchedule {
  slots: AssistantSlot[];
  selectedAssistantIds: string[];
  locations: string[]; // editable location list
}