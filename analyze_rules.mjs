import XLSX from 'xlsx';

const exportPath = '/Users/szaboimre/Library/CloudStorage/OneDrive-ZöldmezőUtcaiEGYMI/2025-2026/AI/Irodai irányitópult/Órarend/2026/OrarendExport.xlsx';

try {
  const workbook = XLSX.readFile(exportPath);
  const sheet = workbook.Sheets['Órarend'];
  const data = XLSX.utils.sheet_to_json(sheet);
  
  console.log(`Total placed lessons: ${data.length}`);
  
  // 1. Periods
  const periods = new Set();
  const periodCounts = {};
  // 2. Days
  const days = new Set();
  const dayCounts = {};
  
  // 3. Subject-period distribution
  const subjectPeriodDist = {};
  
  // 4. Parallel lessons check
  // Key: day-period-teacher. Value: array of rows
  const teacherSlots = {};
  
  data.forEach((row, idx) => {
    const day = row['Nap'];
    const period = row['Óra (adott napon belül)'];
    const subject = row['Tantárgy'];
    const teacher = row['Tanár'];
    const className = row['Osztály'] || '';
    const groupName = row['Csoport'] || '';
    
    periods.add(period);
    periodCounts[period] = (periodCounts[period] || 0) + 1;
    
    days.add(day);
    dayCounts[day] = (dayCounts[day] || 0) + 1;
    
    if (!subjectPeriodDist[subject]) {
      subjectPeriodDist[subject] = {};
    }
    subjectPeriodDist[subject][period] = (subjectPeriodDist[subject][period] || 0) + 1;
    
    if (teacher && day && period) {
      const slotKey = `${day}-${period}-${teacher}`;
      if (!teacherSlots[slotKey]) {
        teacherSlots[slotKey] = [];
      }
      teacherSlots[slotKey].push({ className, groupName, subject });
    }
  });
  
  console.log('\n--- Distinct days of week ---', Array.from(days));
  console.log('Lessons count per day:', dayCounts);
  
  console.log('\n--- Distinct periods ---', Array.from(periods).sort((a,b) => Number(a) - Number(b)));
  console.log('Lessons count per period:', periodCounts);
  
  // Find parallel lessons (where a teacher has > 1 lesson in the same slot)
  let parallelCount = 0;
  const parallelExamples = [];
  
  Object.keys(teacherSlots).forEach(key => {
    if (teacherSlots[key].length > 1) {
      parallelCount++;
      if (parallelExamples.length < 15) {
        parallelExamples.push({ slot: key, lessons: teacherSlots[key] });
      }
    }
  });
  
  console.log(`\nTotal parallel slots (teacher teaching >1 group/class in the same period): ${parallelCount}`);
  console.log('Parallel examples (first 15):');
  parallelExamples.forEach(ex => {
    console.log(`Slot [${ex.slot}]:`);
    ex.lessons.forEach(l => {
      console.log(`  - Class: "${l.className}", Group: "${l.groupName}", Subject: "${l.subject}"`);
    });
  });
  
  // Look at specific subjects like Napközi, Kollégium, Logopédia, Fejlesztés
  console.log('\n--- Selected Subjects Period Distribution ---');
  const targetSubjects = ['Napközi', 'Mozgás nevelés', 'Könyvtári óra', 'Komplex gyógypedagógiai-logopédiai fejlesztés', 'Étkezés és önkiszolgálás', 'Szabadidős tevékenység'];
  targetSubjects.forEach(sub => {
    if (subjectPeriodDist[sub]) {
      console.log(`Subject: "${sub}" distribution by period:`, subjectPeriodDist[sub]);
    } else {
      // Find matching subject keys
      const matches = Object.keys(subjectPeriodDist).filter(k => k.toLowerCase().includes(sub.toLowerCase()));
      matches.forEach(m => {
        console.log(`Subject (match): "${m}" distribution by period:`, subjectPeriodDist[m]);
      });
    }
  });
  
} catch (err) {
  console.error('Error analyzing OrarendExport.xlsx:', err);
}
