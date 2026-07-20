import type { ParsedData, Teacher, Class, Subject, Allocation } from './types.ts';
import { NUMBER_OF_DAYS, NUMBER_OF_PERIODS, TEACHER_COLORS } from './constants.ts';

export const normalizeClassName = (name: string): string => {
  if (!name) return '';
  let clean = name.trim().replace(/\s+/g, ' ');
  
  // Standardize "1/B. osztály" variants
  if (/^1\/[Bb](\.|\s+osztály|$)/.test(clean)) {
    return '1/B. osztály';
  }
  if (/^1\/[Aa](\.|\s+osztály|$)/.test(clean)) {
    return '1/A. osztály';
  }

  // Standardize 9/E. osztály
  if (/^9\/[Ee](\.|\s+osztály|$)/.test(clean)) {
    return '9/E. osztály';
  }

  // Standardize class numbers with dot (e.g., "4 osztály" -> "4. osztály")
  // Note: we keep "2 osztály" without dot to match previous exports and saves.
  if (clean === '2. osztály') {
    return '2 osztály';
  }
  clean = clean.replace(/^([1345678])\s+osztály/i, '$1. osztály');

  // Standardize 10.Parkgondozó
  if (/^10\.?\s*Parkgondozó(\s+osztály)?/i.test(clean) || clean.includes('10.Parkgondozó')) {
    return '10.Parkgondozó';
  }

  // Standardize 10/Textiltermék összeállító
  if (/^10\.?\s*Textiltermék-összeállító(\s+osztály)?/i.test(clean) || clean.includes('10/Textil') || clean.includes('Textiltermék összeállító')) {
    return '10/Textiltermék összeállító';
  }

  // Standardize 9. Számítógépes-adatrögzítő
  if (/^9\.?\s*Számítógépes-adatrögzítő(\s+osztály)?/i.test(clean)) {
    return '9. Számítógépes-adatrögzítő';
  }

  // Standardize 9. Szobafestő
  if (/^9\.?\s*Szobafestő(\s+osztály)?/i.test(clean)) {
    return '9. Szobafestő';
  }

  // Standardize Autista összevont
  if (/^Aut(ista|\.)\s*Összevont/i.test(clean)) {
    return 'Aut. Összevont';
  }

  // Standardize Készségfejlesztő
  if (/^Készségfejlesztő\s+(\d+-\d+)/i.test(clean)) {
    const match = clean.match(/^Készségfejlesztő\s+(\d+-\d+)/i);
    return `Készségfejlesztő ${match[1]}.`;
  }
  
  if (/^Készségfejlesztő\s+(\d+)\s+csoport/i.test(clean)) {
    return 'Készségfejlesztő 11-12.';
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