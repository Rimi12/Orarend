import { useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useTimetable } from '../contexts/TimetableContext.tsx';
import { DAYS_OF_WEEK, PERIODS } from '../constants.ts';

export const useExport = () => {
  const { currentState, selectedTeacherId, selectedClassId, findTeacher, findClass, findSubject } = useTimetable();

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

  const handleExportForKreta = useCallback(() => {
    if (!currentState) {
      alert("Nincs adat az exportáláshoz.");
      return;
    }
    const { placedLessons } = currentState;

    if (placedLessons.length === 0) {
      alert("Nincsenek elhelyezett órák az exportáláshoz.");
      return;
    }

    const sortedLessons = [...placedLessons].sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      if (a.period !== b.period) return a.period - b.period;
      const classA = findClass(a.allocation.classId)?.name || '';
      const classB = findClass(b.allocation.classId)?.name || '';
      return classA.localeCompare(classB, 'hu-HU');
    });

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
        if (resolvedClassName.includes('csoport') || resolvedClassName.includes('Kollégium') || resolvedClassName.includes('Utazó')) {
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

      const rowData = [
        "Minden héten",
        DAYS_OF_WEEK[lesson.day],
        lesson.period + 1,
        finalClass,
        finalGroup,
        subjectName,
        findTeacher(lesson.allocation.teacherId)?.name || 'N/A',
        "" // Omit/leave room empty for now
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
      { wch: 15 }, // Osztály
      { wch: 20 }, // Csoport
      { wch: 25 }, // Tantárgy
      { wch: 25 }, // Tanár
      { wch: 15 }, // Helyiség
    ];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Órarend');

    // 2. Reference sheets to mimic native export
    const hetirendData = [["Minden héten"], ["Szünet"], ["A hét"], ["B hét"]];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(hetirendData), 'Hetirend');

    const napData = [["Hétfő"], ["Kedd"], ["Szerda"], ["Csütörtök"], ["Péntek"], ["Szombat"], ["Vasárnap"]];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(napData), 'Nap');

    const classNames = Array.from(new Set(placedLessons.map(l => l.allocation.originalClass || "").filter(Boolean))).sort();
    const classData = classNames.map(name => [name]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(classData), 'Osztály');

    const groupNames = Array.from(new Set(placedLessons.map(l => l.allocation.originalGroup || "").filter(Boolean))).sort();
    const groupData = groupNames.map(name => [name]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(groupData), 'Csoport');

    const subjectNames = Array.from(new Set(placedLessons.map(l => {
      let name = findSubject(l.allocation.subjectId)?.name || '';
      if (name === 'Napközis tevékenység') name = 'Napközi';
      if (name === 'Mozgásnevelés') name = 'Mozgás nevelés';
      return name;
    }).filter(Boolean))).sort();
    const subjectData = subjectNames.map(name => [name]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(subjectData), 'Tantárgy');

    const teacherNames = Array.from(new Set(placedLessons.map(l => findTeacher(l.allocation.teacherId)?.name || "").filter(Boolean))).sort();
    const teacherData = teacherNames.map(name => [name]);
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(teacherData), 'Tanár');

    const helyisegData = [["Konditerem"], ["Tornaterem"], ["Könyvtár"]];
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(helyisegData), 'Helyiség');
    
    try {
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
          alert(`Sikeres exportálás!\nA fájl lementve a 2026 könyvtárba is:\n${fileName}`);
        }
      })
      .catch(err => console.error("Helyi mentési hiba:", err));
    } catch (e) {
      console.error("Hiba a Kréta exportálás során:", e);
      alert("Hiba történt az Excel fájl generálása közben.");
    }
  }, [currentState, findClass, findSubject, findTeacher]);

  return { handleExport, handleExportForKreta };
};
