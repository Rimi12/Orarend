import type { ParsedData, Teacher, Class, Subject, Allocation, AppHistoryState, KretaCombinedImportResult, PlacedLesson } from './types.ts';
import { NUMBER_OF_DAYS, NUMBER_OF_PERIODS, TEACHER_COLORS } from './constants.ts';

export const normalizeClassName = (name: string): string => {
  if (!name) return '';
  let clean = name.trim().replace(/\s+/g, ' ');
  
  // Standardize slash classes (e.g. 1/A, 1/b, 2/A, 2/B, 6/A, 6/B, 9/E/A, 9/E/B)
  const matchSlash = clean.match(/^(\d+(?:\/[A-Za-z]+)*)\/([A-Za-z]+)(\.|\s+osztály|$)/i);
  if (matchSlash) {
    const prefix = matchSlash[1].toUpperCase();
    const letter = matchSlash[2].toUpperCase();
    return `${prefix}/${letter}. osztály`;
  }

  // Standardize 9/E. osztály
  if (/^9\/[Ee](\.|\s+osztály|$)/.test(clean)) {
    return '9/E. osztály';
  }

  // Standardize vocational / trade classes
  if (/^10\.?\s*Parkgondozó(\s+osztály)?/i.test(clean) || clean.includes('10.Parkgondozó')) {
    return '10.Parkgondozó';
  }
  if (/^10\.?\s*Textiltermék-összeállító(\s+osztály)?/i.test(clean) || clean.includes('10/Textil') || clean.includes('Textiltermék összeállító')) {
    return '10/Textiltermék összeállító';
  }
  if (/^9\.?\s*Számítógépes-adatrögzítő(\s+osztály)?/i.test(clean)) {
    return '9. Számítógépes-adatrögzítő';
  }
  if (/^10\.?\s*Számítógépes-adatrögzítő(\s+osztály)?/i.test(clean)) {
    return '10. Számítógépes-adatrögzítő';
  }
  if (/^9\.?\s*Családellátó(\s+osztály)?/i.test(clean)) {
    return '9. Családellátó';
  }
  if (/^9\.?\s*Szobafestő(\s+osztály)?/i.test(clean)) {
    return '9. Szobafestő';
  }
  if (/^10\.?\s*Szobafestő(\s+osztály)?/i.test(clean)) {
    return '10. Szobafestő';
  }

  // Standardize Autista összevont
  if (/^Aut(ista|\.)\s*Összevont/i.test(clean)) {
    return 'Aut. Összevont';
  }

  // Standardize Készségfejlesztő
  if (/Készségfejlesztő\s+(9-10|9|10)/i.test(clean)) {
    return 'Készségfejlesztő 9-10.';
  }
  if (/Készségfejlesztő\s+(11-12|11|12)/i.test(clean)) {
    return 'Készségfejlesztő 11-12.';
  }

  // Standardize non-slash numbered class names (e.g. '2 osztály', '6 osztály' -> '2. osztály')
  if (/^[1-9]\s+osztály$/i.test(clean)) {
    clean = clean.replace(/^([1-9])\s+osztály$/i, '$1. osztály');
  }

  return clean;
};

export const normalizeSubjectName = (name: string): string => {
  if (!name) return '';
  let clean = name.trim().replace(/\s+/g, ' ');

  if (clean === 'Napközi') return 'Napközis tevékenység';
  if (clean === 'Mozgás nevelés') return 'Mozgásnevelés';
  if (clean === 'Habilitáci-rehabiltáció') return 'Habilitáció-rehabilitáció';
  if (clean === 'Ének - zene') return 'Ének-zene';
  if (clean === 'Olvasás -írás') return 'Olvasás-írás';
  if (clean === 'Számolás - mérés') return 'Számolás-mérés';
  if (clean.startsWith('Mozgásfejlesztés(TSMT)') || clean.startsWith('Mozgásfejlesztés (TSMT)')) return 'Mozgásfejlesztés(TSMT)';

  return clean;
};

export const HITTAN_GROUP_CLASS_MAP: Record<string, string> = {
  // Hittan (Fentős Judit)
  'Etika/Hit- és erkölcstan csoport 12': '6/A. osztály',
  'Etika/Hit- és erkölcstan csoport 13': '7. osztály',
  'Etika/Hit- és erkölcstan csoport 14': '8. osztály',
  'Etika/Hit- és erkölcstan csoport 15': '1. osztály',
  'Etika/Hit- és erkölcstan csoport 16': '2/B. osztály',
  'Etika/Hit- és erkölcstan csoport 17': '2/A. osztály',
  'Etika/Hit- és erkölcstan csoport 19': '3. osztály',
  'Etika/Hit- és erkölcstan csoport 20': '5. osztály',

  'Hit- és Erkölcstan csoport 12': '6/A. osztály',
  'Hit- és Erkölcstan csoport 13': '7. osztály',
  'Hit- és Erkölcstan csoport 14': '8. osztály',
  'Hit- és Erkölcstan csoport 15': '1. osztály',
  'Hit- és Erkölcstan csoport 16': '2/B. osztály',
  'Hit- és Erkölcstan csoport 17': '2/A. osztály',
  'Hit- és Erkölcstan csoport 19': '3. osztály',
  'Hit- és Erkölcstan csoport 20': '5. osztály',

  // Erkölcstan
  'Etika/Hit- és erkölcstan 1': '6/A. osztály',
  'Etika/Hit- és erkölcstan 2': '7. osztály',
  'Etika/Hit- és erkölcstan 3': '8. osztály',
  'Etika/Hit- és erkölcstan 4': 'Aut. Összevont',
  'Etika/Hit- és erkölcstan 5': '5. osztály',
  'Etika/Hit- és erkölcstan 6': '2/A. osztály',
  'Etika/Hit- és erkölcstan 7': '3. osztály',
  'Etika/Hit- és erkölcstan 8': '4. osztály',
  'Etika/Hit- és erkölcstan 9': '1. osztály',
  'Etika/Hit- és erkölcstan 10': '2/B. osztály',

  'Hit- és Erkölcstan csoport 1': '6/A. osztály',
  'Hit- és Erkölcstan csoport 2': '7. osztály',
  'Hit- és Erkölcstan csoport 3': '8. osztály',
  'Hit- és Erkölcstan csoport 4': 'Aut. Összevont',
  'Hit- és Erkölcstan csoport 5': '5. osztály',
  'Hit- és Erkölcstan csoport 6': '2/A. osztály',
  'Hit- és Erkölcstan csoport 7': '3. osztály',
  'Hit- és Erkölcstan csoport 8': '4. osztály',
  'Hit- és Erkölcstan csoport 9': '1. osztály',
  'Hit- és Erkölcstan csoport 10': '2/B. osztály',
};

export const parseTimetableFile = (data: any[][]): ParsedData => {
  const teachers: Teacher[] = [];
  const classes: Class[] = [];
  const subjects: Subject[] = [];
  const allocations: Allocation[] = [];

  const classMap = new Map<string, Class>();
  const subjectMap = new Map<string, Subject>();
  const teacherMap = new Map<string, Teacher>();

  // Parse teachers from header row (row 0)
  const teacherHeaderRow = data[0] || [];
  for (let i = 4; i < teacherHeaderRow.length; i++) {
    const teacherName = teacherHeaderRow[i];
    if (teacherName && typeof teacherName === 'string' && teacherName.trim() !== '') {
      const trimmedName = teacherName.trim();
      if (!teacherMap.has(trimmedName)) {
        const newTeacher: Teacher = {
          id: `t${teachers.length + 1}`,
          name: trimmedName,
          availability: Array(NUMBER_OF_DAYS).fill(0).map(() => Array(NUMBER_OF_PERIODS).fill(true)),
          color: TEACHER_COLORS[teachers.length % TEACHER_COLORS.length],
        };
        teachers.push(newTeacher);
        teacherMap.set(trimmedName, newTeacher);
      }
    }
  }

  let lastSeenClass = '';

  // Parse allocations from rows
  for (let rowIndex = 2; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex];
    if (!row || row.length === 0) continue;

    let classNameStr = row[0]?.toString().trim() || '';
    const groupNameStr = row[1]?.toString().trim() || '';
    let subjectNameStr = row[2]?.toString().trim() || '';

    // Forward fill class name if present in Excel
    if (classNameStr) {
      lastSeenClass = classNameStr;
    }

    let resolvedClass = classNameStr;

    // Check Hittan / Etika group mapping first
    if (groupNameStr && HITTAN_GROUP_CLASS_MAP[groupNameStr]) {
      resolvedClass = HITTAN_GROUP_CLASS_MAP[groupNameStr];
    }

    // Resolve empty class names from Group or Subject name
    if (!resolvedClass) {
      if (groupNameStr) {
        const napkoziRegex = /napközis\s+csoportja/i;
        if (napkoziRegex.test(groupNameStr)) {
          // Napközi daycare: extract the base class name
          resolvedClass = groupNameStr.replace(napkoziRegex, '').trim();
          resolvedClass = resolvedClass.replace(/\.$/, '').trim();
        } else {
          // If group name contains "osztály", extract up to it
          const oszthalyIndex = groupNameStr.toLowerCase().indexOf('osztály');
          if (oszthalyIndex !== -1) {
            resolvedClass = groupNameStr.substring(0, oszthalyIndex + 7).trim();
          } else {
            // Otherwise use group name as the class
            resolvedClass = groupNameStr;
          }
        }
      } else if (subjectNameStr) {
        // Fallback for special education / logopedics / hostel (kollégium)
        if (subjectNameStr.toLowerCase().includes('logopédia') || subjectNameStr.toLowerCase().includes('fejlesztés') || subjectNameStr.toLowerCase().includes('tsmt')) {
          resolvedClass = 'Utazó gyógypedagógiai osztály';
        } else if (subjectNameStr.toLowerCase().includes('állampolgárság') || subjectNameStr.toLowerCase().includes('erkölcsi nevelés') || subjectNameStr.toLowerCase().includes('önismeret') || subjectNameStr.toLowerCase().includes('családi életre')) {
          resolvedClass = 'Kollégium';
        } else {
          resolvedClass = lastSeenClass || 'Egyéb';
        }
      }
    }

    // Skip row if we still couldn't resolve a class or if subject is missing
    if (!resolvedClass || !subjectNameStr) continue;

    // Normalize names to avoid duplication
    resolvedClass = normalizeClassName(resolvedClass);
    subjectNameStr = normalizeSubjectName(subjectNameStr);

    let currentClass = classMap.get(resolvedClass);
    if (!currentClass) {
      currentClass = { id: `c${classes.length + 1}`, name: resolvedClass };
      classes.push(currentClass);
      classMap.set(resolvedClass, currentClass);
    }

    let currentSubject = subjectMap.get(subjectNameStr);
    if (!currentSubject) {
      currentSubject = { id: `s${subjects.length + 1}`, name: subjectNameStr };
      subjects.push(currentSubject);
      subjectMap.set(subjectNameStr, currentSubject);
    }

    // Process weekly hours for each teacher in columns
    for (let colIndex = 4; colIndex < teacherHeaderRow.length; colIndex++) {
      const teacherName = teacherHeaderRow[colIndex]?.toString().trim();
      const teacher = teacherMap.get(teacherName);
      const weeklyHours = parseInt(row[colIndex], 10);

      if (teacher && !isNaN(weeklyHours) && weeklyHours > 0) {
        const newAllocation: Allocation = {
          id: `a${allocations.length + 1}`,
          teacherId: teacher.id,
          classId: currentClass.id,
          subjectId: currentSubject.id,
          weeklyHours: weeklyHours,
          originalClass: classNameStr || undefined,
          originalGroup: groupNameStr || undefined,
        };
        allocations.push(newAllocation);
      }
    }
  }

  return { teachers, classes, subjects, allocations };
};

export const migrateHittanState = (state: AppHistoryState): AppHistoryState => {
  if (!state || !Array.isArray(state.classes) || !Array.isArray(state.allocations)) {
    return state;
  }

  const classes = [...state.classes];
  const allocations = [...state.allocations];
  const placedLessons = [...(state.placedLessons || [])];

  let modified = false;

  const NON_CLASS_GROUPS = new Set([
    'Labdarúgás', 'Digitális kultúra', 'Tánc', 'Logopédiai ellátás', 
    'Gyógytestnevelés csoportja', 'Könyvtár csoport', 'Zenei nevelés', 
    'Fejlesztő Felkészítő csoport', 'Fejlesztő Felkészítő csoport II.',
    'Mozgásfejlesztés csoport (belső)', '6. osztály'
  ]);

  const canonicalClassMap = new Map<string, Class>();
  const classIdRemap = new Map<string, string>();

  classes.forEach(c => {
    let targetName = HITTAN_GROUP_CLASS_MAP[c.name] || normalizeClassName(c.name);
    if (NON_CLASS_GROUPS.has(c.name) || NON_CLASS_GROUPS.has(targetName)) {
      targetName = 'Egyéb csoportok';
    }
    
    let canonical = canonicalClassMap.get(targetName);
    if (!canonical) {
      canonical = { id: c.id, name: targetName };
      canonicalClassMap.set(targetName, canonical);
    }
    
    if (c.id !== canonical.id || c.name !== targetName) {
      modified = true;
    }
    classIdRemap.set(c.id, canonical.id);
  });

  const getOrCreateCanonical = (targetName: string): Class => {
    let canonical = canonicalClassMap.get(targetName);
    if (!canonical) {
      canonical = { id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`, name: targetName };
      canonicalClassMap.set(targetName, canonical);
      modified = true;
    }
    return canonical;
  };

  const updatedAllocations = allocations.map(alloc => {
    const currentClassId = classIdRemap.get(alloc.classId) || alloc.classId;
    const currentClass = Array.from(canonicalClassMap.values()).find(c => c.id === currentClassId);
    const groupName = alloc.originalGroup || currentClass?.name || '';
    const origClass = alloc.originalClass || '';
    
    let targetClassName = HITTAN_GROUP_CLASS_MAP[groupName] || (currentClass ? HITTAN_GROUP_CLASS_MAP[currentClass.name] : undefined);
    if (!targetClassName && (NON_CLASS_GROUPS.has(groupName) || (currentClass && NON_CLASS_GROUPS.has(currentClass.name)))) {
      targetClassName = 'Egyéb csoportok';
    }

    if (!targetClassName && origClass) {
      const normalizedOrig = normalizeClassName(origClass);
      if (normalizedOrig && normalizedOrig !== origClass) {
        targetClassName = normalizedOrig;
      }
    }

    let finalClassId = currentClassId;
    if (targetClassName) {
      const realClass = getOrCreateCanonical(targetClassName);
      finalClassId = realClass.id;
    }

    const newOrigClass = origClass ? normalizeClassName(origClass) : origClass;

    if (finalClassId !== alloc.classId || newOrigClass !== origClass) {
      modified = true;
      return { 
        ...alloc, 
        classId: finalClassId,
        originalClass: newOrigClass
      };
    }
    return alloc;
  });

  const allocMap = new Map(updatedAllocations.map(a => [a.id, a]));
  const updatedPlacedLessons = placedLessons.map(pl => {
    const updatedAlloc = allocMap.get(pl.allocation.id);
    if (updatedAlloc) {
      if (pl.allocation.classId !== updatedAlloc.classId || pl.allocation.originalClass !== updatedAlloc.originalClass) {
        modified = true;
        return {
          ...pl,
          allocation: updatedAlloc
        };
      }
    }
    return pl;
  });

  if (!modified) return state;

  const finalClasses = Array.from(canonicalClassMap.values());

  return {
    ...state,
    classes: finalClasses,
    allocations: updatedAllocations,
    placedLessons: updatedPlacedLessons
  };
};

export const KRETA_DAY_MAP: Record<string, number> = {
  'Hétfő': 0, 'hétfő': 0,
  'Kedd': 1, 'kedd': 1,
  'Szerda': 2, 'szerda': 2,
  'Csütörtök': 3, 'csütörtök': 3,
  'Péntek': 4, 'péntek': 4,
};

export const parseKretaCombinedExports = (
  orarendRows: any[][],
  ttfRows?: any[][]
): KretaCombinedImportResult => {
  // 1. If TTF rows provided, parse TTF allocations first
  let ttfData: ParsedData | null = null;
  if (ttfRows && ttfRows.length >= 3) {
    try {
      ttfData = parseTimetableFile(ttfRows);
    } catch (err) {
      console.warn("Nem sikerült feldolgozni a TTF fájlt, folytatás csak az Órarend exporttal:", err);
    }
  }

  const teachers: Teacher[] = ttfData ? [...ttfData.teachers] : [];
  const classes: Class[] = ttfData ? [...ttfData.classes] : [];
  const subjects: Subject[] = ttfData ? [...ttfData.subjects] : [];
  const allocations: Allocation[] = ttfData ? [...ttfData.allocations] : [];

  const teacherMapByName = new Map<string, Teacher>(teachers.map(t => [t.name.trim().toLowerCase(), t]));
  const classMapByName = new Map<string, Class>(classes.map(c => [c.name.trim().toLowerCase(), c]));
  const subjectMapByName = new Map<string, Subject>(subjects.map(s => [s.name.trim().toLowerCase(), s]));

  const makeAllocKey = (tName: string, cName: string, gName: string, sName: string) => {
    const cleanT = tName.trim().toLowerCase();
    const cleanC = normalizeClassName(cName).trim().toLowerCase();
    const cleanG = (gName || '').trim().toLowerCase();
    const cleanS = normalizeSubjectName(sName).trim().toLowerCase();
    return `${cleanT}###${cleanC}###${cleanG}###${cleanS}`;
  };

  // Map existing TTF allocations by key
  const allocMapByKey = new Map<string, Allocation>();
  allocations.forEach(a => {
    const tObj = teachers.find(t => t.id === a.teacherId);
    const cObj = classes.find(c => c.id === a.classId);
    const sObj = subjects.find(s => s.id === a.subjectId);
    if (tObj && cObj && sObj) {
      const key = makeAllocKey(tObj.name, a.originalClass || cObj.name, a.originalGroup || '', sObj.name);
      allocMapByKey.set(key, a);
    }
  });

  // 2. Parse Orarend rows
  const header = orarendRows[0] || [];
  const getColIndex = (keywords: string[], defaultIdx: number) => {
    const idx = header.findIndex((h: any) => {
      if (!h) return false;
      const s = h.toString().toLowerCase();
      return keywords.some(kw => s.includes(kw.toLowerCase()));
    });
    return idx !== -1 ? idx : defaultIdx;
  };

  const colDay = getColIndex(['Nap'], 1);
  const colPeriod = getColIndex(['Óra'], 2);
  const colClass = getColIndex(['Osztály'], 3);
  const colGroup = getColIndex(['Csoport'], 4);
  const colSubject = getColIndex(['Tantárgy'], 5);
  const colTeacher = getColIndex(['Tanár'], 6);
  const colRoom = getColIndex(['Helyiség'], 7);

  const roomsSet = new Set<string>();
  const placedInstancesByAllocId = new Map<string, { day: number; period: number; room: string }[]>();

  for (let rowIndex = 1; rowIndex < orarendRows.length; rowIndex++) {
    const row = orarendRows[rowIndex];
    if (!row || row.length === 0) continue;

    const dayStr = (row[colDay] || '').toString().trim();
    const periodStr = (row[colPeriod] || '').toString().trim();
    const rawClassStr = (row[colClass] || '').toString().trim();
    const rawGroupStr = (row[colGroup] || '').toString().trim();
    const rawSubjectStr = (row[colSubject] || '').toString().trim();
    const rawTeacherStr = (row[colTeacher] || '').toString().trim();
    const rawRoomStr = (row[colRoom] || '').toString().trim();

    if (!dayStr || !periodStr || !rawTeacherStr || !rawSubjectStr) continue;

    const day = KRETA_DAY_MAP[dayStr];
    const periodNum = parseInt(periodStr, 10);
    if (day === undefined || isNaN(periodNum) || periodNum < 1 || periodNum > NUMBER_OF_PERIODS) continue;
    const period = periodNum - 1;

    // Track room
    if (rawRoomStr) {
      roomsSet.add(rawRoomStr);
    }

    // Resolve Teacher
    const cleanTeacherName = rawTeacherStr;
    let teacher = teacherMapByName.get(cleanTeacherName.toLowerCase());
    if (!teacher) {
      teacher = {
        id: `t${teachers.length + 1}`,
        name: cleanTeacherName,
        availability: Array(NUMBER_OF_DAYS).fill(0).map(() => Array(NUMBER_OF_PERIODS).fill(true)),
        color: TEACHER_COLORS[teachers.length % TEACHER_COLORS.length],
      };
      teachers.push(teacher);
      teacherMapByName.set(cleanTeacherName.toLowerCase(), teacher);
    }

    // Resolve Class
    let resolvedClass = rawClassStr;
    if (rawGroupStr && HITTAN_GROUP_CLASS_MAP[rawGroupStr]) {
      resolvedClass = HITTAN_GROUP_CLASS_MAP[rawGroupStr];
    }
    if (!resolvedClass) {
      if (rawGroupStr) {
        const napkoziRegex = /napközis\s+csoportja/i;
        if (napkoziRegex.test(rawGroupStr)) {
          resolvedClass = rawGroupStr.replace(napkoziRegex, '').trim().replace(/\.$/, '').trim();
        } else {
          const oszthalyIndex = rawGroupStr.toLowerCase().indexOf('osztály');
          if (oszthalyIndex !== -1) {
            resolvedClass = rawGroupStr.substring(0, oszthalyIndex + 7).trim();
          } else {
            resolvedClass = rawGroupStr;
          }
        }
      } else if (rawSubjectStr) {
        if (rawSubjectStr.toLowerCase().includes('logopédia') || rawSubjectStr.toLowerCase().includes('fejlesztés') || rawSubjectStr.toLowerCase().includes('tsmt')) {
          resolvedClass = 'Utazó gyógypedagógiai osztály';
        } else if (rawSubjectStr.toLowerCase().includes('állampolgárság') || rawSubjectStr.toLowerCase().includes('erkölcsi nevelés') || rawSubjectStr.toLowerCase().includes('önismeret') || rawSubjectStr.toLowerCase().includes('családi életre')) {
          resolvedClass = 'Kollégium';
        } else {
          resolvedClass = 'Egyéb';
        }
      }
    }
    const cleanClassName = normalizeClassName(resolvedClass || 'Egyéb');
    let classObj = classMapByName.get(cleanClassName.toLowerCase());
    if (!classObj) {
      classObj = { id: `c${classes.length + 1}`, name: cleanClassName };
      classes.push(classObj);
      classMapByName.set(cleanClassName.toLowerCase(), classObj);
    }

    // Resolve Subject
    const cleanSubjectName = normalizeSubjectName(rawSubjectStr);
    let subjectObj = subjectMapByName.get(cleanSubjectName.toLowerCase());
    if (!subjectObj) {
      subjectObj = { id: `s${subjects.length + 1}`, name: cleanSubjectName };
      subjects.push(subjectObj);
      subjectMapByName.set(cleanSubjectName.toLowerCase(), subjectObj);
    }

    // Find or create Allocation
    const allocKey = makeAllocKey(cleanTeacherName, rawClassStr || cleanClassName, rawGroupStr, cleanSubjectName);
    let alloc = allocMapByKey.get(allocKey);
    if (!alloc) {
      // Also try matching without group if group is empty
      const fallbackKey = makeAllocKey(cleanTeacherName, cleanClassName, '', cleanSubjectName);
      alloc = allocMapByKey.get(fallbackKey);
    }

    if (!alloc) {
      alloc = {
        id: `a${allocations.length + 1}`,
        teacherId: teacher.id,
        classId: classObj.id,
        subjectId: subjectObj.id,
        weeklyHours: 0,
        originalClass: rawClassStr || undefined,
        originalGroup: rawGroupStr || undefined,
      };
      allocations.push(alloc);
      allocMapByKey.set(allocKey, alloc);
    }

    if (!placedInstancesByAllocId.has(alloc.id)) {
      placedInstancesByAllocId.set(alloc.id, []);
    }
    placedInstancesByAllocId.get(alloc.id)!.push({
      day,
      period,
      room: rawRoomStr
    });
  }

  // 3. Reconcile allocation weekly hours
  allocations.forEach(alloc => {
    const placedCount = placedInstancesByAllocId.get(alloc.id)?.length || 0;
    if (alloc.weeklyHours === 0) {
      alloc.weeklyHours = placedCount;
    } else if (placedCount > alloc.weeklyHours) {
      alloc.weeklyHours = placedCount;
    }
  });

  // 4. Build PlacedLesson array and roomMap
  const placedLessons: PlacedLesson[] = [];
  const roomMap: Record<string, string> = {};

  allocations.forEach(alloc => {
    const instances = placedInstancesByAllocId.get(alloc.id) || [];
    instances.forEach((inst, idx) => {
      const lessonId = `${alloc.id}-${idx + 1}`;
      placedLessons.push({
        id: lessonId,
        allocation: alloc,
        day: inst.day,
        period: inst.period
      });
      if (inst.room) {
        roomMap[lessonId] = inst.room;
      }
    });
  });

  // 5. Migrate state to handle Hittan / groups consistently
  const completeState: AppHistoryState = {
    teachers,
    classes,
    subjects,
    allocations,
    placedLessons,
    initialAllocations: [...allocations]
  };

  const migratedState = migrateHittanState(completeState);

  const totalContractedHours = migratedState.allocations.reduce((s, a) => s + a.weeklyHours, 0);
  const unplacedHoursCount = Math.max(0, totalContractedHours - migratedState.placedLessons.length);

  return {
    state: migratedState,
    roomMap,
    rooms: Array.from(roomsSet).sort((a, b) => a.localeCompare(b, 'hu-HU')),
    stats: {
      totalLessonsPlaced: migratedState.placedLessons.length,
      teachersCount: migratedState.teachers.length,
      classesCount: migratedState.classes.length,
      subjectsCount: migratedState.subjects.length,
      allocationsCount: migratedState.allocations.length,
      ttfAllocationsCount: ttfData ? ttfData.allocations.length : undefined,
      unplacedHoursCount
    }
  };
};
