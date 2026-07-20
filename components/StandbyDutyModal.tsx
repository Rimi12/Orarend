

import React from 'react';
import * as XLSX from 'xlsx';
import type { Teacher } from '../types.ts';
import { DAYS_OF_WEEK, PERIODS } from '../constants.ts';
import { ExportIcon } from './icons/ExportIcon.tsx';
import { WrenchScrewdriverIcon } from './icons/WrenchScrewdriverIcon.tsx';
import { SpinnerIcon } from './icons/SpinnerIcon.tsx';

interface StandbyDutyModalProps {
  isOpen: boolean;
  onClose: () => void;
  schedule: Map<string, Teacher[]> | null;
  report: { eligibleTeachers: Teacher[]; unassignedTeachers: Teacher[]; understaffedSlots: { day: number; period: number; count: number }[]; aiExplanation?: string } | null;
  onRepairWithAI: () => void;
  isGeneratingAI: boolean;
}

export const StandbyDutyModal: React.FC<StandbyDutyModalProps> = ({ isOpen, onClose, schedule, report, onRepairWithAI, isGeneratingAI }) => {
  if (!isOpen) return null;

  const handleExport = () => {
    if (!schedule) return;

    const title = 'Rendelkezésre_állás_beosztás';
    const header = ["Idősáv", ...DAYS_OF_WEEK];
    const sheetData: string[][] = [header];

    PERIODS.slice(0, 8).forEach((period, periodIndex) => {
        const row = [period];
        DAYS_OF_WEEK.forEach((_, dayIndex) => {
            const slotKey = `${dayIndex}-${periodIndex}`;
            const teachersInCell = schedule.get(slotKey) || [];
            const cellText = teachersInCell.map(t => t.name).join('\n');
            row.push(cellText);
        });
        sheetData.push(row);
    });

    if (report) {
        sheetData.push([]); // Spacer row
        
        if (report.eligibleTeachers.length > 0) {
            sheetData.push(["Beosztható tanárok:"]);
            sheetData.push([report.eligibleTeachers.map(t => t.name).join(', ')]);
            sheetData.push([]);
        }

        if(report.aiExplanation){
            sheetData.push(["AI Javaslata:"]);
            sheetData.push([report.aiExplanation]);
            sheetData.push([]);
        }

        if (report.unassignedTeachers.length > 0 || report.understaffedSlots.length > 0) {
            sheetData.push(["Jelentés: A generálás nem volt tökéletes!"]);
            if (report.unassignedTeachers.length > 0) {
                const teacherNames = report.unassignedTeachers.map(t => t.name).join(', ');
                sheetData.push([`Tanárok, akiknek nem pontosan 3 óra jutott: ${teacherNames}`]);
            }
            if (report.understaffedSlots.length > 0) {
                sheetData.push(["Idősávok, ahova nem 3 tanár jutott:"]);
                report.understaffedSlots.forEach(s => sheetData.push([`${DAYS_OF_WEEK[s.day]} - ${PERIODS[s.period]} óra (${s.count} tanár)`]));
            }
        }
    }
    
    const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
    const allBorders = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    const headerStyle = { font: { bold: true, sz: 12 }, alignment: { horizontal: 'center', vertical: 'center' }, fill: { fgColor: { rgb: 'E0E0E0' } }, border: allBorders };
    const periodStyle = { font: { bold: true }, alignment: { horizontal: 'center', vertical: 'center' }, border: allBorders };
    const lessonStyle = { font: { sz: 9 }, alignment: { horizontal: 'center', vertical: 'center', wrapText: true }, border: allBorders };
    
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
    for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
            let cell = worksheet[cellAddress];
            if (!cell) { cell = { t: 's', v: '' }; worksheet[cellAddress] = cell; }

            if (R === 0) { cell.s = headerStyle; }
            else if (C === 0 && cell.v && R <= 8) { cell.s = periodStyle; }
            else if (cell.v && R <= 8) { cell.s = lessonStyle; }
            else if (R <= 8) { cell.s = { border: allBorders }; }
        }
    }
    worksheet['!rows'] = [{ hpx: 25 }, ...PERIODS.slice(0, 8).map(() => ({ hpx: 60 }))];
    worksheet['!cols'] = [ { wch: 10 }, ...DAYS_OF_WEEK.map(() => ({ wch: 25 })) ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Rendelkezésre Állás');
    XLSX.writeFile(workbook, `${title}.xlsx`);
  };

  const hasErrors = report && (report.unassignedTeachers.length > 0 || report.understaffedSlots.length > 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50" onClick={isGeneratingAI ? undefined : onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-6xl w-full transform transition-all flex flex-col h-[90vh]" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Rendelkezésre Állási Beosztás</h2>
            <button 
              onClick={handleExport}
              disabled={isGeneratingAI}
              className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 transition-colors rounded-full disabled:opacity-50"
              aria-label="Beosztás exportálása"
            >
              <ExportIcon className="w-6 h-6" />
            </button>
        </div>
        
        <div className="flex-grow overflow-auto relative">
          {isGeneratingAI && (
            <div className="absolute inset-0 bg-white/70 dark:bg-gray-800/70 flex flex-col justify-center items-center z-10">
                <SpinnerIcon className="w-12 h-12 text-blue-600" />
                <p className="mt-4 text-lg font-semibold text-gray-700 dark:text-gray-300">AI finomítja a beosztást...</p>
            </div>
          )}
          <table className="w-full h-full border-collapse table-fixed">
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                <th className="p-2 text-left font-semibold text-sm text-gray-500 dark:text-gray-400 w-24"></th>
                {DAYS_OF_WEEK.map(day => (
                  <th key={day} className="p-2 text-center font-semibold text-sm text-gray-500 dark:text-gray-400">{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERIODS.slice(0, 8).map((period, periodIndex) => (
                <tr key={period}>
                  <td className="p-2 text-center font-semibold text-sm text-gray-500 dark:text-gray-400 border-r-2 border-gray-200 dark:border-gray-700">{period}</td>
                  {DAYS_OF_WEEK.map((_, dayIndex) => {
                    const slotKey = `${dayIndex}-${periodIndex}`;
                    const teachersInCell = schedule?.get(slotKey) || [];
                    return (
                      <td key={dayIndex} className="border border-gray-200 dark:border-gray-700 align-top p-1">
                        <ul className="text-xs space-y-0.5">
                          {teachersInCell.map(teacher => (
                            <li key={teacher.id} className="bg-gray-100 dark:bg-gray-700 p-1 rounded-md truncate" title={teacher.name}>{teacher.name}</li>
                          ))}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex-shrink-0 max-h-40 overflow-y-auto space-y-2">
            {report?.eligibleTeachers && (
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg text-sm">
                    <h3 className="font-bold text-gray-800 dark:text-gray-200 mb-2">
                        Beosztható tanárok listája ({report.eligibleTeachers.length} fő)
                    </h3>
                    <ul className="list-disc list-inside ml-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 text-gray-700 dark:text-gray-300">
                        {report.eligibleTeachers.map(t => <li key={t.id}>{t.name}</li>)}
                    </ul>
                </div>
            )}
            {report?.aiExplanation && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-300 dark:border-blue-700 rounded-lg text-sm text-blue-800 dark:text-blue-200">
                    <h3 className="font-bold mb-2">AI Javaslata:</h3>
                    <p>{report.aiExplanation}</p>
                </div>
            )}
            {hasErrors && (
                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
                  <h3 className="font-bold mb-2">Jelentés: A beosztás nem tökéletes!</h3>
                  {report.unassignedTeachers.length > 0 && (
                    <>
                      <p>A következő tanároknak nem pontosan 3 óra jutott:</p>
                      <ul className="list-disc list-inside ml-4">
                        {report.unassignedTeachers.map(t => <li key={t.id}>{t.name}</li>)}
                      </ul>
                    </>
                  )}
                  {report.understaffedSlots.length > 0 && (
                    <>
                      <p className="mt-2">A következő idősávokba nem jutott 3 tanár:</p>
                      <ul className="list-disc list-inside ml-4">
                         {report.understaffedSlots.map(s => <li key={`${s.day}-${s.period}`}>{DAYS_OF_WEEK[s.day]} - {PERIODS[s.period]} óra ({s.count}/3 tanár)</li>)}
                      </ul>
                    </>
                  )}
                </div>
            )}
        </div>


        <div className="mt-4 flex justify-end items-center gap-4 flex-shrink-0">
           {hasErrors && (
             <button
                onClick={onRepairWithAI}
                disabled={isGeneratingAI}
                className="px-6 py-2 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-opacity-50 transition-colors duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait"
              >
                <WrenchScrewdriverIcon className="w-5 h-5" />
                Javítási Javaslat AI-val
              </button>
           )}
          <button
            onClick={onClose}
            disabled={isGeneratingAI}
            className="px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 transition-colors duration-200 disabled:opacity-50"
          >
            Bezárás
          </button>
        </div>
      </div>
    </div>
  );
};