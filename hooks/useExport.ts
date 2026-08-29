import { useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useTimetable } from '../contexts/TimetableContext.tsx';
import { DAYS_OF_WEEK, PERIODS } from '../constants.ts';
import type { PlacedLesson } from '../types.ts';
import {
  KRETA_HETIREND_DEFAULT,
  KRETA_NAP_DEFAULT,
  KRETA_OSZTALY_DEFAULT,
  KRETA_CSOPORT_DEFAULT,
  KRETA_TANTARGY_DEFAULT,
  KRETA_TANAR_DEFAULT,
  KRETA_HELYISEG_DEFAULT
} from '../kretaTemplateData.ts';

export const useExport = () => {
  const { currentState, selectedTeacherId, selectedClassId, findTeacher, findClass, findSubject, rooms } = useTimetable();

  // ── Grid Layout Export (Visual timetable view) ──────────────────────────────
  const handleExport = useCallback((type: 'teacher' | 'class') => {
    if (!currentState) return;
    const { placedLessons } = currentState;
    
    const data = type === 'teacher' ? placedLessons.filter(l => l.allocation.teacherId === selectedTeacherId) : placedLessons.filter(l => l.allocation.classId === selectedClassId);
    const entity = type === 'teacher' ? findTeacher(selectedTeacherId || '') : findClass(selectedClassId || '');

    if (!entity) {
        alert("Nincs kiválasztott órarend az exportáláshoz.");
        return;
    }

    const title = entity.name.replace(/ /g, '_');
    
    const header = ["Idősáv", ...DAYS_OF_WEEK];
    const sheetData: string[][] = [header];

    PERIODS.forEach((period, periodIndex) => {
        const row = [period];
        DAYS_OF_WEEK.forEach((_, dayIndex) => {
            const lessonsInCell = data.filter(l => l.day === dayIndex && l.period === periodIndex);
            if (lessonsInCell.length > 0) {
                const cellText = lessonsInCell.map(lesson => {
                    const subjectName = findSubject(lesson.allocation.subjectId)?.name || 'Ismeretlen';
                    if (type === 'teacher') {
                        const className = findClass(lesson.allocation.classId)?.name || 'N/A';
                        return `${className} - ${subjectName}`;
                    } else {
                        const teacherName = findTeacher(lesson.allocation.teacherId)?.name || 'N/A';
                        return `${teacherName} - ${subjectName}`;
                    }
                }).join('\n');
                row.push(cellText);
            } else {
                const selectedTeacher = findTeacher(selectedTeacherId || '');
                const isLocked = type === 'teacher' && selectedTeacher && !(selectedTeacher.availability[dayIndex]?.[periodIndex] ?? true);
                row.push(isLocked ? "NEM ELÉRHETŐ" : "");
            }
        });
        sheetData.push(row);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    
    const allBorders = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    const headerStyle = { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { fgColor: { rgb: 'E0E0E0' } }, border: allBorders };
    const periodStyle = { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center' }, border: allBorders };
    const lessonStyle = { font: { sz: 9 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: allBorders };
    const lockedStyle = { font: { sz: 9, italic: true }, fill: { fgColor: { rgb: "E0E0E0" }, patternType: "gray125" }, alignment: { horizontal: 'center', vertical: 'center' }, border: allBorders };
    const emptyStyle = { border: allBorders };

    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    const rowHeights = [{ hpx: 25 }]; 

    for (let R = range.s.r; R <= range.e.r; ++R) {
        if (R > 0) rowHeights.push({ hpx: 50 });
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            let cell = worksheet[cellAddress];
            if (!cell) { cell = { t:'s', v: '' }; worksheet[cellAddress] = cell; }
            if (R === 0) { cell.s = headerStyle; }
            else if (C === 0) { cell.s = periodStyle; }
            else {
                if (cell.v === 'NEM ELÉRHETŐ') { cell.s = lockedStyle; }
                else if (cell.v) { cell.s = lessonStyle; }
                else { cell.s = emptyStyle; }
            }
        }
    }
    
    worksheet['!rows'] = rowHeights;
    worksheet['!cols'] = [ { wch: 10 }, ...DAYS_OF_WEEK.map(() => ({ wch: 25 })) ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Órarend');
    
    try {
        const fileName = `${title}_orarend.xlsx`;
        XLSX.writeFile(workbook, fileName);
        
        // Auto-save locally
        const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
        fetch('/api/save-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName, base64Data })
        })
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            console.log("Sikeresen mentve a helyi OneDrive könyvtárba is.");
          }
        })
        .catch(err => console.error("Helyi mentési hiba:", err));
    } catch (e) {
        console.error("Hiba az exportálás során:", e);
        alert("Hiba történt az Excel fájl generálása közben.");
    }
  }, [currentState, selectedTeacherId, selectedClassId, findTeacher, findClass, findSubject]);

  // ── Helper to build standard Kréta import workbook with Helyiség ────────────
  const buildKretaWorkbook = useCallback((
    lessonsToExport: PlacedLesson[],
    roomMap?: Record<string, string>,
    teacherIdForPrimary?: string
  ) => {
    const sortedLessons = [...lessonsToExport].sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      if (a.period !== b.period) return a.period - b.period;
      const classA = findClass(a.allocation.classId)?.name || '';
      const classB = findClass(b.allocation.classId)?.name || '';
      return classA.localeCompare(classB, 'hu-HU');
    });

    const activeRooms = rooms && rooms.length > 0 ? rooms : KRETA_HELYISEG_DEFAULT;

    const header = ["Hetirend", "Nap", "Óra (adott napon belül)", "Osztály", "Csoport", "Tantárgy", "Tanár", "Helyiség"];
    const sheetData: (string | number)[][] = [header];

    sortedLessons.forEach(lesson => {
      const origClass = lesson.allocation.originalClass || "";
      const origGroup = lesson.allocation.originalGroup || "";
      
      let finalClass = origClass;
      let finalGroup = origGroup;

      // Fallback if original values are missing (e.g. manually created allocations or older saves)
      if (!origClass && !origGroup) {
        const resolvedClassName = findClass(lesson.allocation.classId)?.name || 'N/A';
        if (
          resolvedClassName.includes('csoport') ||
          resolvedClassName.includes('Kollégium') ||
          resolvedClassName.includes('Utazó') ||
          resolvedClassName.includes('Autista') ||
          resolvedClassName.includes('Beszédfejlesztés')
        ) {
          finalGroup = resolvedClassName;
          finalClass = "";
        } else {
          finalClass = resolvedClassName;
          finalGroup = "";
        }
      }

      // Restore normalized subjects back to Kréta format
      let subjectName = findSubject(lesson.allocation.subjectId)?.name || 'N/A';
      if (subjectName === 'Napközis tevékenység') subjectName = 'Napközi';
      if (subjectName === 'Mozgásnevelés') subjectName = 'Mozgás nevelés';

      const teacherName = findTeacher(lesson.allocation.teacherId)?.name || 'N/A';

      // Determine Room (Helyiség)
      let finalRoom = roomMap?.[lesson.id] || '';
      if (!finalRoom) {
        const targetTeacherId = teacherIdForPrimary || lesson.allocation.teacherId;
        const teacherPrimInfo = getTeacherPrimaryRoom(
          targetTeacherId,
          currentState?.placedLessons || [],
          currentState?.classes || [],
          activeRooms
        );
        const resolved = resolveLessonRoom(
          lesson,
          teacherPrimInfo.primaryRoom,
          currentState?.classes || [],
          currentState?.subjects || [],
          activeRooms
        );
        finalRoom = resolved.room;
      }

      const rowData = [
        "Minden héten",
        DAYS_OF_WEEK[lesson.day] || "",
        lesson.period + 1,
        finalClass,
        finalGroup,
        subjectName,
        teacherName,
        finalRoom
      ];
      sheetData.push(rowData);
    });

    const workbook = XLSX.utils.book_new();

    // 1. Órarend main sheet
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    worksheet['!cols'] = [
      { wch: 15 }, // Hetirend
      { wch: 12 }, // Nap
      { wch: 22 }, // Óra (adott napon belül)
      { wch: 18 }, // Osztály
      { wch: 25 }, // Csoport
      { wch: 28 }, // Tantárgy
      { wch: 25 }, // Tanár
      { wch: 25 }, // Helyiség
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Órarend');

    // 2. Reference sheets: merge master defaults with any state additions
    // Hetirend
    const hetirendList = KRETA_HETIREND_DEFAULT.map(v => [v]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(hetirendList), 'Hetirend');

    // Nap
    const napList = KRETA_NAP_DEFAULT.map(v => [v]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(napList), 'Nap');

    // Osztály
    const classSet = new Set<string>([
      ...KRETA_OSZTALY_DEFAULT,
      ...(currentState?.classes.map(c => c.name) || []),
      ...lessonsToExport.map(l => l.allocation.originalClass || '').filter(Boolean)
    ]);
    const classData = Array.from(classSet).sort((a, b) => a.localeCompare(b, 'hu-HU')).map(name => [name]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(classData), 'Osztály');

    // Csoport
    const groupSet = new Set<string>([
      ...KRETA_CSOPORT_DEFAULT,
      ...lessonsToExport.map(l => l.allocation.originalGroup || '').filter(Boolean)
    ]);
    const groupData = Array.from(groupSet).sort((a, b) => a.localeCompare(b, 'hu-HU')).map(name => [name]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(groupData), 'Csoport');

    // Tantárgy
    const subjectSet = new Set<string>([
      ...KRETA_TANTARGY_DEFAULT,
      ...(currentState?.subjects.map(s => {
        let name = s.name;
        if (name === 'Napközis tevékenység') name = 'Napközi';
        if (name === 'Mozgásnevelés') name = 'Mozgás nevelés';
        return name;
      }) || [])
    ]);
    const subjectData = Array.from(subjectSet).sort((a, b) => a.localeCompare(b, 'hu-HU')).map(name => [name]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(subjectData), 'Tantárgy');

    // Tanár
    const teacherSet = new Set<string>([
      ...KRETA_TANAR_DEFAULT,
      ...(currentState?.teachers.map(t => t.name) || [])
    ]);
    const teacherData = Array.from(teacherSet).sort((a, b) => a.localeCompare(b, 'hu-HU')).map(name => [name]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(teacherData), 'Tanár');

    // Helyiség
    const roomSet = new Set<string>([
      ...activeRooms,
      ...KRETA_HELYISEG_DEFAULT
    ]);
    const helyisegList = Array.from(roomSet).sort((a, b) => a.localeCompare(b, 'hu-HU')).map(v => [v]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(helyisegList), 'Helyiség');

    return workbook;
  }, [currentState, findClass, findSubject, findTeacher, rooms]);

  // ── Single Teacher Kréta Import Excel Export ────────────────────────────────
  const handleExportTeacherForKreta = useCallback((teacherId?: string, roomMap?: Record<string, string>) => {
    if (!currentState) {
      alert("Nincs adat az exportáláshoz.");
      return;
    }

    const targetId = teacherId || selectedTeacherId;
    if (!targetId) {
      alert("Kérjük, válassz ki egy pedagógust az exportáláshoz.");
      return;
    }

    const teacher = findTeacher(targetId);
    if (!teacher) {
      alert("A megadott pedagógus nem található.");
      return;
    }

    const teacherLessons = currentState.placedLessons.filter(l => l.allocation.teacherId === teacher.id);
    if (teacherLessons.length === 0) {
      alert(`A kiválasztott pedagógusnak (${teacher.name}) nincsenek elhelyezett órái az órarendben.`);
      return;
    }

    try {
      const workbook = buildKretaWorkbook(teacherLessons, roomMap, teacher.id);
      const safeTeacherName = teacher.name.replace(/[\\/:*?"<>| ]/g, '_');
      const fileName = `${safeTeacherName}_kreta_import.xlsx`;

      XLSX.writeFile(workbook, fileName);

      // Auto-save locally in 2026/ folder via server API
      const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, base64Data })
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          console.log(`[Kréta Export] Mentve a 2026 könyvtárba: ${fileName}`);
        }
      })
      .catch(err => console.error("Helyi mentési hiba:", err));

      alert(`Sikeres Kréta import export!\nPedagógus: ${teacher.name} (${teacherLessons.length} óra)\nHelyiségek kitöltve a 2026_08_29 termek lista szerint.\nFájlnév: ${fileName}`);
    } catch (e) {
      console.error("Hiba a tanári Kréta exportálás során:", e);
      alert("Hiba történt az Excel fájl generálása közben.");
    }
  }, [currentState, selectedTeacherId, findTeacher, buildKretaWorkbook]);

  // ── Batch Export All Teachers (Separate Kréta Files) ────────────────────────
  const handleExportAllTeachersForKreta = useCallback(() => {
    if (!currentState || currentState.placedLessons.length === 0) {
      alert("Nincsenek elhelyezett órák az exportáláshoz.");
      return;
    }

    const teachersWithLessons = currentState.teachers.filter(teacher =>
      currentState.placedLessons.some(l => l.allocation.teacherId === teacher.id)
    );

    if (teachersWithLessons.length === 0) {
      alert("Egyetlen pedagógushoz sincs elhelyezett óra.");
      return;
    }

    let savedCount = 0;
    teachersWithLessons.forEach(teacher => {
      const teacherLessons = currentState.placedLessons.filter(l => l.allocation.teacherId === teacher.id);
      if (teacherLessons.length === 0) return;

      const workbook = buildKretaWorkbook(teacherLessons, undefined, teacher.id);
      const safeTeacherName = teacher.name.replace(/[\\/:*?"<>| ]/g, '_');
      const fileName = `${safeTeacherName}_kreta_import.xlsx`;

      const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, base64Data })
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          console.log(`[Batch Export] Mentve: ${fileName}`);
        }
      })
      .catch(err => console.error("Helyi mentési hiba:", err));

      savedCount++;
    });

    alert(`Sikeres kötegelt exportálás!\nÖsszesen ${savedCount} pedagógus Kréta import fájlja elkészült (kitöltött helyiségekkel) és el lett mentve a helyi 2026 könyvtárba.`);
  }, [currentState, buildKretaWorkbook]);

  // ── Full School Kréta Import Excel Export ───────────────────────────────────
  const handleExportForKreta = useCallback((roomMap?: Record<string, string>) => {
    if (!currentState) {
      alert("Nincs adat az exportáláshoz.");
      return;
    }
    const { placedLessons } = currentState;

    if (placedLessons.length === 0) {
      alert("Nincsenek elhelyezett órák az exportáláshoz.");
      return;
    }

    try {
      const workbook = buildKretaWorkbook(placedLessons, roomMap);
      const fileName = `kréta_import_órarend.xlsx`;
      XLSX.writeFile(workbook, fileName);

      // Auto-save locally
      const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, base64Data })
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          alert(`Sikeres exportálás!\nA teljes órarend Kréta import fájlja lementve (kitöltött helyiség oszloppal):\n${fileName}`);
        }
      })
      .catch(err => console.error("Helyi mentési hiba:", err));
    } catch (e) {
      console.error("Hiba a Kréta exportálás során:", e);
      alert("Hiba történt az Excel fájl generálása közben.");
    }
  }, [currentState, buildKretaWorkbook]);

  // ── Kréta Cross-Table Curriculum (Tantárgyfelosztás) Export ───────────────────
  const buildKretaCrossTableCurriculumWorkbook = useCallback((
    targetAllocations: Allocation[],
    teacherIdFilter?: string
  ) => {
    if (!currentState) return null;

    const { teachers, classes, subjects } = currentState;
    const classMap = new Map(classes.map(c => [c.id, c.name]));
    const subjectMap = new Map(subjects.map(s => [s.id, s.name]));

    // Filter teachers if single teacher export
    let exportTeachers = teachers;
    let exportAllocations = targetAllocations;

    if (teacherIdFilter) {
      exportTeachers = teachers.filter(t => t.id === teacherIdFilter);
      exportAllocations = targetAllocations.filter(a => a.teacherId === teacherIdFilter);
    } else {
      const activeTeacherIds = new Set(targetAllocations.map(a => a.teacherId));
      exportTeachers = teachers.filter(t => activeTeacherIds.has(t.id));
    }

    // Sort teachers alphabetically
    exportTeachers = [...exportTeachers].sort((a, b) => a.name.localeCompare(b.name, 'hu-HU'));

    // Group rows by (Class, Group, Subject)
    interface RowData {
      className: string;
      groupName: string;
      subjectName: string;
      teacherHours: Record<string, number>;
    }

    const rowMap = new Map<string, RowData>();

    exportAllocations.forEach(alloc => {
      const origClass = alloc.originalClass || '';
      const origGroup = alloc.originalGroup || '';
      const cName = classMap.get(alloc.classId) || '';
      
      let finalClass = origClass;
      let finalGroup = origGroup;

      if (!origClass && !origGroup) {
        if (
          cName.includes('csoport') ||
          cName.includes('Kollégium') ||
          cName.includes('Utazó') ||
          cName.includes('Autista') ||
          cName.includes('Beszédfejlesztés')
        ) {
          finalGroup = cName;
          finalClass = '';
        } else {
          finalClass = cName;
          finalGroup = '';
        }
      }

      let sName = subjectMap.get(alloc.subjectId) || '';
      if (sName === 'Napközis tevékenység') sName = 'Napközi';
      if (sName === 'Mozgásnevelés') sName = 'Mozgás nevelés';

      const rowKey = `${finalClass}###${finalGroup}###${sName}`;
      if (!rowMap.has(rowKey)) {
        rowMap.set(rowKey, {
          className: finalClass,
          groupName: finalGroup,
          subjectName: sName,
          teacherHours: {}
        });
      }

      const rowObj = rowMap.get(rowKey)!;
      rowObj.teacherHours[alloc.teacherId] = (rowObj.teacherHours[alloc.teacherId] || 0) + alloc.weeklyHours;
    });

    const sortedRows = Array.from(rowMap.values()).sort((a, b) => {
      const cComp = a.className.localeCompare(b.className, 'hu-HU');
      if (cComp !== 0) return cComp;
      const gComp = a.groupName.localeCompare(b.groupName, 'hu-HU');
      if (gComp !== 0) return gComp;
      return a.subjectName.localeCompare(b.subjectName, 'hu-HU');
    });

    // Build main sheet: TTF_Kereszttablas_Import_Minta
    // Row 1: 4 empty cols + teacher names
    const row1: (string | null)[] = ['', '', '', '', ...exportTeachers.map(t => t.name)];

    // Row 2: ['Osztály', 'Csoport', 'Tantárgy', 'Összesen', formulas for column totals]
    const maxDataRow = sortedRows.length + 2; // 1-indexed (rows 3 to maxDataRow)
    const row2: any[] = [
      'Osztály',
      'Csoport',
      'Tantárgy',
      'Összesen',
      ...exportTeachers.map((_, idx) => {
        const colLetter = XLSX.utils.encode_col(4 + idx);
        return { f: `SUM(${colLetter}3:${colLetter}${maxDataRow})` };
      })
    ];

    const sheetData: any[][] = [row1, row2];

    sortedRows.forEach((row, rowIdx) => {
      const excelRowIndex = rowIdx + 3; // 1-indexed Excel row
      const endColLetter = XLSX.utils.encode_col(3 + exportTeachers.length);
      const rowArr: any[] = [
        row.className,
        row.groupName,
        row.subjectName,
        { f: `SUM(E${excelRowIndex}:${endColLetter}${excelRowIndex})` }
      ];

      exportTeachers.forEach(t => {
        const hours = row.teacherHours[t.id];
        rowArr.push(hours && hours > 0 ? hours : null);
      });

      sheetData.push(rowArr);
    });

    const workbook = XLSX.utils.book_new();

    // 1. Main cross-table sheet
    const mainWorksheet = XLSX.utils.aoa_to_sheet(sheetData);
    mainWorksheet['!cols'] = [
      { wch: 18 }, // Osztály
      { wch: 26 }, // Csoport
      { wch: 30 }, // Tantárgy
      { wch: 12 }, // Összesen
      ...exportTeachers.map(() => ({ wch: 22 }))
    ];
    XLSX.utils.book_append_sheet(workbook, mainWorksheet, 'TTF_Kereszttablas_Import_Minta');

    // 2. Reference sheets: Osztály, Csoport, Tantárgy, Tanár
    const classSet = new Set<string>([
      ...KRETA_OSZTALY_DEFAULT,
      ...classes.map(c => c.name),
      ...sortedRows.map(r => r.className).filter(Boolean)
    ]);
    const classData = Array.from(classSet).sort((a, b) => a.localeCompare(b, 'hu-HU')).map(c => [c]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(classData), 'Osztály');

    const groupSet = new Set<string>([
      ...KRETA_CSOPORT_DEFAULT,
      ...sortedRows.map(r => r.groupName).filter(Boolean)
    ]);
    const groupData = Array.from(groupSet).sort((a, b) => a.localeCompare(b, 'hu-HU')).map(g => [g]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(groupData), 'Csoport');

    const subjectSet = new Set<string>([
      ...KRETA_TANTARGY_DEFAULT,
      ...subjects.map(s => {
        let name = s.name;
        if (name === 'Napközis tevékenység') name = 'Napközi';
        if (name === 'Mozgásnevelés') name = 'Mozgás nevelés';
        return name;
      }),
      ...sortedRows.map(r => r.subjectName).filter(Boolean)
    ]);
    const subjectData = Array.from(subjectSet).sort((a, b) => a.localeCompare(b, 'hu-HU')).map(s => [s]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(subjectData), 'Tantárgy');

    const teacherSet = new Set<string>([
      ...KRETA_TANAR_DEFAULT,
      ...teachers.map(t => t.name)
    ]);
    const teacherData = Array.from(teacherSet).sort((a, b) => a.localeCompare(b, 'hu-HU')).map(t => [t]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(teacherData), 'Tanár');

    return workbook;
  }, [currentState]);

  // ── Handle Full Curriculum Export (Whole School or Single Teacher Kréta TTF) ──
  const handleExportCurriculumForKreta = useCallback((
    param1?: string | Allocation[],
    param2?: string
  ) => {
    if (!currentState) {
      alert("Nincs adat az exportáláshoz.");
      return;
    }

    let targetAllocs: Allocation[] = currentState.allocations;
    let teacherFilter: string | undefined = undefined;

    if (Array.isArray(param1)) {
      targetAllocs = param1;
      teacherFilter = param2;
    } else if (typeof param1 === 'string') {
      teacherFilter = param1;
      targetAllocs = currentState.allocations;
    }

    if (!targetAllocs || targetAllocs.length === 0) {
      alert("Nincsenek tantárgyfelosztási adatok.");
      return;
    }

    try {
      const workbook = buildKretaCrossTableCurriculumWorkbook(targetAllocs, teacherFilter);
      if (!workbook) return;

      let fileName = 'tantargyfelosztas_kreta_kereszttablas_import.xlsx';
      if (teacherFilter) {
        const teacher = findTeacher(teacherFilter);
        const safeTeacherName = teacher ? teacher.name.replace(/[\\/:*?"<>| ]/g, '_') : 'tanar';
        fileName = `${safeTeacherName}_tantargyfelosztas_kreta_import.xlsx`;
      }

      XLSX.writeFile(workbook, fileName);

      // Save locally
      const base64Data = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      fetch('/api/save-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, base64Data })
      })
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          console.log(`[TTF Export] Mentve a 2026 könyvtárba: ${fileName}`);
        }
      })
      .catch(err => console.error("Helyi mentési hiba:", err));

      alert(`Sikeres Kréta tantárgyfelosztás export!\nFájlnév: ${fileName}`);
    } catch (e) {
      console.error("Hiba a TTF exportálás során:", e);
      alert("Hiba történt a kereszttáblás tantárgyfelosztás Excel generálása közben: " + (e as any)?.message);
    }
  }, [currentState, buildKretaCrossTableCurriculumWorkbook, findTeacher]);

  return {
    handleExport,
    handleExportForKreta,
    handleExportTeacherForKreta,
    handleExportAllTeachersForKreta,
    buildKretaWorkbook,
    buildKretaCrossTableCurriculumWorkbook,
    handleExportCurriculumForKreta
  };
};


