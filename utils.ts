import type { ParsedData, Teacher, Class, Subject, Allocation, AppHistoryState, KretaCombinedImportResult, PlacedLesson, Substitution } from './types.ts';
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

  if (clean === 'Napközis tevékenység') return 'Napközi';
  if (clean === 'Mozgás nevelés') return 'Mozgásnevelés';
  if (clean === 'Habilitáci-rehabiltáció') return 'Habilitáció-rehabilitáció';
  if (clean === 'Ének - zene') return 'Ének-zene';
  if (clean === 'Olvasás -írás') return 'Olvasás-írás';
  if (clean === 'Számolás - mérés') return 'Számolás-mérés';
  if (clean.startsWith('Mozgásfejlesztés(TSMT)') || clean.startsWith('Mozgásfejlesztés (TSMT)')) return 'Mozgásfejlesztés(TSMT)';

  return clean;
};

export const HITTAN_GROUP_CLASS_MAP: Record<string, string> = {
  // Hit- és Erkölcstan csoportok 1-10
  'Etika/Hit- és erkölcstan 1': '5/A. osztály',
  'Etika/Hit- és erkölcstan 2': '6. osztály',
  'Etika/Hit- és erkölcstan 3': '7. osztály',
  'Etika/Hit- és erkölcstan 4': 'Aut. Összevont',
  'Etika/Hit- és erkölcstan 5': '4. osztály',
  'Etika/Hit- és erkölcstan 6': '2/A. osztály',
  'Etika/Hit- és erkölcstan 7': '2. osztály',
  'Etika/Hit- és erkölcstan 8': '3. osztály',
  'Etika/Hit- és erkölcstan 9': '8. osztály',
  'Etika/Hit- és erkölcstan 10': '2/B. osztály',

  'Hit- és Erkölcstan csoport 1': '5/A. osztály',
  'Hit- és Erkölcstan csoport 2': '6. osztály',
  'Hit- és Erkölcstan csoport 3': '7. osztály',
  'Hit- és Erkölcstan csoport 4': 'Aut. Összevont',
  'Hit- és Erkölcstan csoport 5': '4. osztály',
  'Hit- és Erkölcstan csoport 6': '2/A. osztály',
  'Hit- és Erkölcstan csoport 7': '2. osztály',
  'Hit- és Erkölcstan csoport 8': '3. osztály',
  'Hit- és Erkölcstan csoport 9': '8. osztály',
  'Hit- és Erkölcstan csoport 10': '2/B. osztály',

  // Hit- és Erkölcstan csoportok 12-20
  'Etika/Hit- és erkölcstan csoport 12': '5/A. osztály',
  'Etika/Hit- és erkölcstan csoport 13': '6. osztály',
  'Etika/Hit- és erkölcstan csoport 14': '7. osztály',
  'Etika/Hit- és erkölcstan csoport 15': '1/A. osztály',
  'Etika/Hit- és erkölcstan csoport 16': '8. osztály',
  'Etika/Hit- és erkölcstan csoport 17': '2/A. osztály',
  'Etika/Hit- és erkölcstan csoport 19': '2. osztály',
  'Etika/Hit- és erkölcstan csoport 20': '4. osztály',

  'Hit- és Erkölcstan csoport 12': '5/A. osztály',
  'Hit- és Erkölcstan csoport 13': '6. osztály',
  'Hit- és Erkölcstan csoport 14': '7. osztály',
  'Hit- és Erkölcstan csoport 15': '1/A. osztály',
  'Hit- és Erkölcstan csoport 16': '8. osztály',
  'Hit- és Erkölcstan csoport 17': '2/A. osztály',
  'Hit- és Erkölcstan csoport 19': '2. osztály',
  'Hit- és Erkölcstan csoport 20': '4. osztály',
};

export const resolveClassFromRoom = (rawRoom?: string, knownClasses?: Set<string>): string | null => {
  if (!rawRoom) return null;
  const room = String(rawRoom).trim();
  if (!room) return null;

  if (/autista/i.test(room)) return 'Aut. Összevont';
  if (/5\.?\s*[Aa]/i.test(room)) return '5/A. osztály';
  if (/5\.?\s*[Bb]/i.test(room)) return '5/B. osztály';
  if (/1\.?\s*[Bb]/i.test(room)) return '1/B. osztály';
  if (/1\.?\s*[Aa]/i.test(room)) return '1/A. osztály';
  if (/2\.?\s*[Aa]/i.test(room)) return '2/A. osztály';
  if (/2\.?\s*[Bb]/i.test(room)) return '2/B. osztály';
  if (/6\.?\s*[Aa]/i.test(room)) return '6/A. osztály';
  if (/6\.?\s*[Bb]/i.test(room)) return '6/B. osztály';

  const m = room.match(/^(\d+)\.?\s*osztály/i);
  if (m) {
    const grade = m[1];
    if (knownClasses && knownClasses.size > 0) {
      if (grade === '1') {
        if (knownClasses.has('1/A. osztály')) return '1/A. osztály';
        if (knownClasses.has('1. osztály')) return '1. osztály';
      }
      if (grade === '2') {
        if (knownClasses.has('2. osztály')) return '2. osztály';
        if (knownClasses.has('2/A. osztály')) return '2/A. osztály';
      }
      if (grade === '5') {
        if (knownClasses.has('5/A. osztály')) return '5/A. osztály';
        if (knownClasses.has('5. osztály')) return '5. osztály';
      }
      if (grade === '6') {
        if (knownClasses.has('6. osztály')) return '6. osztály';
        if (knownClasses.has('6/A. osztály')) return '6/A. osztály';
      }
      if (knownClasses.has(`${grade}. osztály`)) return `${grade}. osztály`;
    }
    return `${grade}. osztály`;
  }

  if (/9\/?[Ee]/i.test(room)) return '9/E. osztály';
  if (/textil/i.test(room)) return '10/Textiltermék összeállító';
  if (/festő|szobafestő/i.test(room)) return '10. Szobafestő';
  if (/számítógépes/i.test(room)) return '9. Számítógépes-adatrögzítő';
  if (/parkgondoz/i.test(room)) return 'Parkgondozó';
  if (/készségfejlesztő\s*9-10/i.test(room)) return 'Készségfejlesztő 9-10.';
  if (/készségfejlesztő\s*11-12/i.test(room)) return 'Készségfejlesztő 11-12.';
  if (/fejlesztő\s*iskolai/i.test(room)) return 'Fejlesztő iskolai osztály';

  return null;
};

export interface ResolvedKretaClassGroup {
  className: string;
  groupName?: string;
  isNapkozi?: boolean;
}

export const resolveKretaClassAndGroup = (
  rawClass?: string,
  rawGroup?: string,
  rawSubject?: string,
  rawRoom?: string,
  knownClasses?: Set<string>,
  rawTeacher?: string
): ResolvedKretaClassGroup => {
  const cls = (rawClass || '').trim();
  const grp = (rawGroup || '').trim();
  const subj = (rawSubject || '').trim();
  const room = (rawRoom || '').trim();
  const tea = (rawTeacher || '').trim();

  const pickClass = (candidates: string[]): string => {
    if (knownClasses && knownClasses.size > 0) {
      for (const cand of candidates) {
        if (knownClasses.has(cand)) return cand;
      }
      for (const cand of candidates) {
        const lowerCand = cand.toLowerCase();
        for (const k of knownClasses) {
          if (k.toLowerCase() === lowerCand) return k;
        }
      }
    }
    return candidates[0];
  };

  // 1. Hit- és erkölcstan groups
  const HITTAN_CANDIDATES: Record<string, string[]> = {
    'Etika/Hit- és erkölcstan 1': ['5/A. osztály', '5. osztály'],
    'Etika/Hit- és erkölcstan 2': ['6. osztály', '6/A. osztály'],
    'Etika/Hit- és erkölcstan 3': ['7. osztály'],
    'Etika/Hit- és erkölcstan 4': ['Aut. Összevont'],
    'Etika/Hit- és erkölcstan 5': ['4. osztály'],
    'Etika/Hit- és erkölcstan 6': ['2/A. osztály'],
    'Etika/Hit- és erkölcstan 7': ['2. osztály', '2/A. osztály'],
    'Etika/Hit- és erkölcstan 8': ['3. osztály'],
    'Etika/Hit- és erkölcstan 9': ['8. osztály', '1/A. osztály'],
    'Etika/Hit- és erkölcstan 10': ['2/B. osztály'],

    'Hit- és Erkölcstan csoport 1': ['5/A. osztály', '5. osztály'],
    'Hit- és Erkölcstan csoport 2': ['6. osztály', '6/A. osztály'],
    'Hit- és Erkölcstan csoport 3': ['7. osztály'],
    'Hit- és Erkölcstan csoport 4': ['Aut. Összevont'],
    'Hit- és Erkölcstan csoport 5': ['4. osztály'],
    'Hit- és Erkölcstan csoport 6': ['2/A. osztály'],
    'Hit- és Erkölcstan csoport 7': ['2. osztály', '2/A. osztály'],
    'Hit- és Erkölcstan csoport 8': ['3. osztály'],
    'Hit- és Erkölcstan csoport 9': ['8. osztály', '1/A. osztály'],
    'Hit- és Erkölcstan csoport 10': ['2/B. osztály'],

    'Etika/Hit- és erkölcstan csoport 12': ['5/A. osztály', '5. osztály'],
    'Etika/Hit- és erkölcstan csoport 13': ['6. osztály', '6/A. osztály'],
    'Etika/Hit- és erkölcstan csoport 14': ['7. osztály'],
    'Etika/Hit- és erkölcstan csoport 15': ['1/A. osztály', '1. osztály'],
    'Etika/Hit- és erkölcstan csoport 16': ['8. osztály', '2/B. osztály'],
    'Etika/Hit- és erkölcstan csoport 17': ['2/A. osztály'],
    'Etika/Hit- és erkölcstan csoport 19': ['2. osztály', '2/B. osztály'],
    'Etika/Hit- és erkölcstan csoport 20': ['4. osztály'],

    'Hit- és Erkölcstan csoport 12': ['5/A. osztály', '5. osztály'],
    'Hit- és Erkölcstan csoport 13': ['6. osztály', '6/A. osztály'],
    'Hit- és Erkölcstan csoport 14': ['7. osztály'],
    'Hit- és Erkölcstan csoport 15': ['1/A. osztály', '1. osztály'],
    'Hit- és Erkölcstan csoport 16': ['8. osztály', '2/B. osztály'],
    'Hit- és Erkölcstan csoport 17': ['2/A. osztály'],
    'Hit- és Erkölcstan csoport 19': ['2. osztály', '2/B. osztály'],
    'Hit- és Erkölcstan csoport 20': ['4. osztály'],
  };

  const isEtikaOrHittan =
    /etika|hit/i.test(subj) ||
    /etika|hit/i.test(grp) ||
    /etika|hit/i.test(cls) ||
    Boolean(grp && HITTAN_CANDIDATES[grp]) ||
    Boolean(cls && HITTAN_CANDIDATES[cls]);

  if (isEtikaOrHittan) {
    const rawTarget = grp || cls || '';

    // 1. Specific teacher rules (highest priority for disambiguation)
    if (/szitáné/i.test(tea)) {
      if (/\b4\b/.test(rawTarget)) {
        return { className: 'Aut. Összevont', groupName: grp || cls || 'Etika/Hit- és erkölcstan 4' };
      }
      if (/\b6\b/.test(rawTarget)) {
        return { className: '2/A. osztály', groupName: grp || cls || 'Etika/Hit- és erkölcstan 6' };
      }
    }
    if (/gál-ajtai/i.test(tea)) {
      if (/\b16\b/.test(rawTarget) || /\b10\b/.test(rawTarget)) {
        return { className: pickClass(['2/B. osztály', '2. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan csoport 16' };
      }
    }
    if (/marton/i.test(tea)) {
      if (/\b9\b/.test(rawTarget)) return { className: pickClass(['1/A. osztály', '1. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan 9' };
      if (/\b8\b/.test(rawTarget)) return { className: pickClass(['3. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan 8' };
      if (/\b7\b/.test(rawTarget)) return { className: pickClass(['2. osztály', '2/A. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan 7' };
      if (/\b5\b/.test(rawTarget)) return { className: pickClass(['4. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan 5' };
    }
    if (/magné/i.test(tea)) {
      if (/\b1\b/.test(rawTarget)) return { className: pickClass(['5/A. osztály', '5. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan 1' };
      if (/\b2\b/.test(rawTarget)) return { className: pickClass(['6. osztály', '6/A. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan 2' };
      if (/\b3\b/.test(rawTarget)) return { className: pickClass(['7. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan 3' };
      if (/\b5\b/.test(rawTarget)) return { className: pickClass(['4. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan 5' };
      if (/\b9\b/.test(rawTarget)) return { className: pickClass(['8. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan 9' };
    }
    if (/hittan\s*oktató/i.test(tea) || /\[ho\s*1\]/i.test(tea)) {
      if (/\b17\b/.test(rawTarget)) return { className: '2/A. osztály', groupName: grp || cls || 'Etika/Hit- és erkölcstan csoport 17' };
      if (/\b12\b/.test(rawTarget)) return { className: pickClass(['5/A. osztály', '5. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan csoport 12' };
      if (/\b13\b/.test(rawTarget)) return { className: pickClass(['6. osztály', '6/A. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan csoport 13' };
      if (/\b14\b/.test(rawTarget)) return { className: pickClass(['7. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan csoport 14' };
      if (/\b15\b/.test(rawTarget)) return { className: pickClass(['1/A. osztály', '1. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan csoport 15' };
      if (/\b16\b/.test(rawTarget)) return { className: pickClass(['8. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan csoport 16' };
      if (/\b19\b/.test(rawTarget)) return { className: pickClass(['2. osztály', '2/B. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan csoport 19' };
      if (/\b20\b/.test(rawTarget)) return { className: pickClass(['4. osztály']), groupName: grp || cls || 'Etika/Hit- és erkölcstan csoport 20' };
    }

    // 2. Room-based inference
    const roomCls = resolveClassFromRoom(room, knownClasses);
    if (roomCls) {
      if (/\b6\b/.test(rawTarget) || /\b17\b/.test(rawTarget)) {
        return { className: '2/A. osztály', groupName: grp || cls };
      }
      return { className: roomCls, groupName: grp || cls };
    }

    // 3. Fallback candidates dictionary
    const hittanKey = (grp && HITTAN_CANDIDATES[grp]) ? grp : ((cls && HITTAN_CANDIDATES[cls]) ? cls : null);
    if (hittanKey) {
      return { className: pickClass(HITTAN_CANDIDATES[hittanKey]), groupName: hittanKey };
    }
  }

  // 2. Napközi daycare groups
  const napkoziTarget = (grp.toLowerCase().includes('napköz') ? grp : (cls.toLowerCase().includes('napköz') ? cls : ''));
  const isNapkoziSubj = subj.toLowerCase().includes('napközi');
  if (napkoziTarget || isNapkoziSubj) {
    const rawTarget = napkoziTarget || grp || cls;
    const napkoziMatch = rawTarget.match(/^(.*?)(?:\s+osztály)?\s+napközis?\s+csoport(?:ja)?$/i);
    let base = napkoziMatch ? napkoziMatch[1].trim() : rawTarget.replace(/napközis?\s+csoport(?:ja)?/i, '').replace(/osztály$/i, '').trim();
    
    let targetClass = '';
    if (/^1$/i.test(base) || /^1\.$/i.test(base)) targetClass = pickClass(['1/A. osztály', '1. osztály']);
    else if (/^1\/[Aa]$/i.test(base)) targetClass = '1/A. osztály';
    else if (/^1\/[Bb]$/i.test(base)) targetClass = '1/B. osztály';
    else if (/^2$/i.test(base) || /^2\.$/i.test(base)) targetClass = pickClass(['2. osztály', '2/A. osztály']);
    else if (/^2\/[Aa]$/i.test(base)) targetClass = '2/A. osztály';
    else if (/^2\/[Bb]$/i.test(base)) targetClass = '2/B. osztály';
    else if (/^3$/i.test(base) || /^3\.$/i.test(base)) targetClass = '3. osztály';
    else if (/^4$/i.test(base) || /^4\.$/i.test(base)) targetClass = '4. osztály';
    else if (/^5$/i.test(base) || /^5\.$/i.test(base)) targetClass = pickClass(['5/A. osztály', '5. osztály']);
    else if (/^5\/[Aa]$/i.test(base)) targetClass = '5/A. osztály';
    else if (/^5\/[Bb]$/i.test(base)) targetClass = '5/B. osztály';
    else if (/^6$/i.test(base) || /^6\.$/i.test(base)) targetClass = pickClass(['6. osztály', '6/A. osztály']);
    else if (/^6\/[Aa]$/i.test(base)) targetClass = '6/A. osztály';
    else if (/^6\/[Bb]$/i.test(base)) targetClass = '6/B. osztály';
    else if (/^7$/i.test(base) || /^7\.$/i.test(base)) targetClass = '7. osztály';
    else if (/^8$/i.test(base) || /^8\.$/i.test(base)) targetClass = '8. osztály';
    else if (/^9\.\s*Szobafestő/i.test(base)) targetClass = '9. Szobafestő';
    else if (/^9\.\s*Számítógépes/i.test(base) || /9\.?\s*Számítógépes-adatrögzítő/i.test(base)) targetClass = '9. Számítógépes-adatrögzítő';
    else if (/^9\.\s*Családellátó/i.test(base)) targetClass = '9. Családellátó';
    else if (/^9\/[Ee]$/i.test(base) || /^9\/[Ee]\.?\s*osztály/i.test(base)) targetClass = pickClass(['9/E. osztály', '9/E/A. osztály']);
    else if (/^10\.\s*Textil/i.test(base) || /10\.?\s*Textiltermék/i.test(base)) targetClass = '10/Textiltermék összeállító';
    else if (/^10\.\s*Szobafestő/i.test(base)) targetClass = '10. Szobafestő';
    else if (/^10\.\s*Számítógépes/i.test(base)) targetClass = '10. Számítógépes-adatrögzítő';
    else if (/^Aut(ista|\.)\s*Összevont/i.test(base)) targetClass = 'Aut. Összevont';
    else if (base) targetClass = normalizeClassName(base);

    if (targetClass) {
      return { className: targetClass, groupName: 'Napközis csoport', isNapkozi: true };
    }
  }

  // 3. Subgroup divisions A / B
  const checkSubgroupStr = (grp.match(/[AB]\s+csoport/i) ? grp : (cls.match(/[AB]\s+csoport/i) ? cls : ''));
  if (checkSubgroupStr) {
    const abMatch = checkSubgroupStr.match(/^(.*?)(?:\s+osztály)?\s+([AB])\s+csoport(?:ja)?$/i);
    if (abMatch) {
      let base = abMatch[1].trim();
      const groupLetter = abMatch[2].toUpperCase();
      let targetClass = '';
      if (/^1$/i.test(base) || /^1\.$/i.test(base)) targetClass = pickClass(['1/A. osztály', '1. osztály']);
      else if (/^1\/[Bb]$/i.test(base)) targetClass = '1/B. osztály';
      else if (/^1\/[Aa]$/i.test(base)) targetClass = '1/A. osztály';
      else if (/^2$/i.test(base) || /^2\.$/i.test(base)) targetClass = pickClass(['2. osztály', '2/A. osztály']);
      else if (/^2\/[Aa]$/i.test(base)) targetClass = '2/A. osztály';
      else if (/^2\/[Bb]$/i.test(base)) targetClass = '2/B. osztály';
      else if (/^3$/i.test(base) || /^3\.$/i.test(base)) targetClass = '3. osztály';
      else if (/^4$/i.test(base) || /^4\.$/i.test(base)) targetClass = '4. osztály';
      else if (/^5$/i.test(base) || /^5\.$/i.test(base)) targetClass = pickClass(['5/A. osztály', '5. osztály']);
      else if (/^6$/i.test(base) || /^6\.$/i.test(base)) targetClass = pickClass(['6. osztály', '6/A. osztály']);
      else if (/^7$/i.test(base) || /^7\.$/i.test(base)) targetClass = '7. osztály';
      else if (/^8$/i.test(base) || /^8\.$/i.test(base)) targetClass = '8. osztály';
      else if (/^Aut(ista|\.)\s*Összevont/i.test(base)) targetClass = 'Aut. Összevont';
      else if (/^Készségfejlesztő\s+11-12/i.test(base)) targetClass = 'Készségfejlesztő 11-12.';
      else if (/^Készségfejlesztő\s+9-10/i.test(base)) targetClass = 'Készségfejlesztő 9-10.';
      else targetClass = normalizeClassName(base);

      return { className: targetClass, groupName: `${groupLetter} csoport` };
    }
  }

  // 4. Készségfejlesztő subgroups
  const kfStr = grp || cls;
  if (/^Készségfejlesztő\s+9-10\/([AB])\s+csoport/i.test(kfStr)) {
    const m = kfStr.match(/([AB])/i);
    return { className: 'Készségfejlesztő 9-10.', groupName: (m ? m[1].toUpperCase() : '') + ' csoport' };
  }
  if (/^Készségfejlesztő\s+(11|12)\s+csoport/i.test(kfStr)) {
    const m = kfStr.match(/(11|12)/i);
    return { className: 'Készségfejlesztő 11-12.', groupName: (m ? m[1] : '') + ' csoport' };
  }

  // 5. Utazó gyógypedagógiai groups
  if (/^utazó/i.test(grp) || /^utazó/i.test(cls) || subj.toLowerCase().includes('logopédia') || subj.toLowerCase().includes('fejlesztés') || subj.toLowerCase().includes('tsmt')) {
    return { className: 'Utazó gyógypedagógiai osztály', groupName: grp || cls || undefined };
  }

  // 6. Kollégium
  if (/^kollégium/i.test(grp) || /^kollégium/i.test(cls) || subj.toLowerCase().includes('állampolgárság') || subj.toLowerCase().includes('erkölcsi nevelés') || subj.toLowerCase().includes('önismeret') || subj.toLowerCase().includes('családi életre')) {
    return { className: 'Kollégium', groupName: grp || cls || undefined };
  }

  // 7. Fejlesztő felkészítő
  if (/^fejlesztő\s+felkészítő/i.test(grp) || /^fejlesztő\s+felkészítő/i.test(cls)) {
    return { className: 'Fejlesztő iskolai osztály', groupName: grp || cls || undefined };
  }

  // 8. Explicit class given
  if (cls) {
    const norm = normalizeClassName(cls);
    return { className: norm, groupName: grp || undefined };
  }

  // 9. Fallback if class was empty
  if (room) {
    const roomCls = resolveClassFromRoom(room, knownClasses);
    if (roomCls) {
      return { className: roomCls, groupName: grp || undefined };
    }
  }

  if (grp) {
    const oszthalyIndex = grp.toLowerCase().indexOf('osztály');
    if (oszthalyIndex !== -1) {
      const extracted = grp.substring(0, oszthalyIndex + 7).trim();
      return { className: normalizeClassName(extracted), groupName: grp };
    }
    return { className: normalizeClassName(grp), groupName: grp };
  }

  return { className: 'Egyéb csoportok' };
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

  // Pass 1: find known classes from non-empty Osztály column
  const knownClasses = new Set<string>();
  for (let i = 2; i < data.length; i++) {
    const r = data[i];
    if (r && r[0]) {
      const c = r[0].toString().trim();
      if (c && !/csoport|hittan|etika|utazó/i.test(c)) {
        knownClasses.add(normalizeClassName(c));
      }
    }
  }

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

    // Find first active teacher in row if any, for better row class resolution
    let firstTeacherInRow: string | undefined = undefined;
    for (let colIndex = 4; colIndex < teacherHeaderRow.length; colIndex++) {
      const weeklyHours = parseInt(row[colIndex], 10);
      if (!isNaN(weeklyHours) && weeklyHours > 0) {
        firstTeacherInRow = teacherHeaderRow[colIndex]?.toString().trim();
        break;
      }
    }

    const { className: resolvedClass, groupName: resolvedGroup } = resolveKretaClassAndGroup(
      classNameStr || lastSeenClass,
      groupNameStr,
      subjectNameStr,
      undefined,
      knownClasses,
      firstTeacherInRow
    );

    // Skip row if we still couldn't resolve a class or if subject is missing
    if (!resolvedClass || !subjectNameStr) continue;

    const normalizedSubject = normalizeSubjectName(subjectNameStr);

    let currentSubject = subjectMap.get(normalizedSubject);
    if (!currentSubject) {
      currentSubject = { id: `s${subjects.length + 1}`, name: normalizedSubject };
      subjects.push(currentSubject);
      subjectMap.set(normalizedSubject, currentSubject);
    }

    // Process weekly hours for each teacher in columns
    for (let colIndex = 4; colIndex < teacherHeaderRow.length; colIndex++) {
      const teacherName = teacherHeaderRow[colIndex]?.toString().trim();
      const teacher = teacherMap.get(teacherName);
      const weeklyHours = parseInt(row[colIndex], 10);

      if (teacher && !isNaN(weeklyHours) && weeklyHours > 0) {
        const { className: specificClass, groupName: specificGroup } = resolveKretaClassAndGroup(
          classNameStr || lastSeenClass,
          groupNameStr,
          subjectNameStr,
          undefined,
          knownClasses,
          teacherName
        );
        const finalClassName = specificClass || resolvedClass;
        let currentClass = classMap.get(finalClassName);
        if (!currentClass) {
          currentClass = { id: `c${classes.length + 1}`, name: finalClassName };
          classes.push(currentClass);
          classMap.set(finalClassName, currentClass);
        }

        const newAllocation: Allocation = {
          id: `a${allocations.length + 1}`,
          teacherId: teacher.id,
          classId: currentClass.id,
          subjectId: currentSubject.id,
          weeklyHours: weeklyHours,
          originalClass: classNameStr || finalClassName,
          originalGroup: specificGroup || resolvedGroup || groupNameStr || undefined,
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

  const isNonClassGroup = (name: string) => {
    return /labdarúgás|digitális kultúra|tánc|logopédia|gyógytestnevelés|könyvtár|zenei|fejlesztő felkészítő|mozgásfejlesztés/i.test(name);
  };

  // Find pure classes (not groups or special activities)
  const existingClassNames = new Set<string>();
  classes.forEach(c => {
    const norm = normalizeClassName(c.name);
    if (!isNonClassGroup(norm) && !/csoport|etika|hittan/i.test(norm)) {
      existingClassNames.add(norm);
    }
  });

  const canonicalClassMap = new Map<string, Class>();
  const classIdRemap = new Map<string, string>();

  classes.forEach(c => {
    let targetName = normalizeClassName(c.name);
    if (isNonClassGroup(c.name) || isNonClassGroup(targetName)) {
      targetName = 'Egyéb csoportok';
    } else {
      const resolved = resolveKretaClassAndGroup(c.name, undefined, undefined, undefined, existingClassNames);
      if (resolved.className && resolved.className !== 'Egyéb csoportok') {
        targetName = resolved.className;
      }
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
    const teacher = (state.teachers || []).find(t => t.id === alloc.teacherId);
    
    let targetClassName: string | undefined = undefined;
    if (isNonClassGroup(groupName) || (currentClass && isNonClassGroup(currentClass.name))) {
      targetClassName = 'Egyéb csoportok';
    } else {
      const resolved = resolveKretaClassAndGroup(
        origClass || currentClass?.name,
        groupName,
        undefined,
        undefined,
        existingClassNames,
        teacher?.name
      );
      if (resolved.className && resolved.className !== 'Egyéb csoportok') {
        targetClassName = resolved.className;
      }
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

export const parseExcelDateToDayAndString = (val: any): { dateStr: string; dayIndex: number } | null => {
  if (val === null || val === undefined || val === '') return null;

  // Numeric Excel serial (e.g. 46351)
  if (typeof val === 'number' || (!isNaN(Number(val)) && !String(val).includes('-') && !String(val).includes('.'))) {
    const num = Number(val);
    if (num > 20000 && num < 80000) {
      const utc_days = Math.floor(num - 25569);
      const date = new Date(utc_days * 86400 * 1000);
      const jsDay = date.getUTCDay();
      const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
      return { dateStr: date.toISOString().split('T')[0], dayIndex };
    }
  }

  // String date format: '2026-09-02', '2026.09.02.', '2026. 09. 02.'
  const str = String(val).trim();
  const clean = str.replace(/\./g, '-').replace(/\s+/g, '').replace(/-+$/, '');
  const date = new Date(clean);
  if (!isNaN(date.getTime())) {
    const jsDay = date.getDay();
    const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
    return { dateStr: date.toISOString().split('T')[0], dayIndex };
  }

  return null;
};

export const parseKretaSubstitutionExport = (
  rows: any[],
  teachers: Teacher[] = [],
  classes: Class[] = [],
  subjects: Subject[] = [],
  minDate: string = '2026-09-07',
  maxDate?: string
): Substitution[] => {
  if (!rows || rows.length < 2) return [];

  const teacherMap = new Map<string, Teacher>();
  teachers.forEach(t => {
    teacherMap.set(t.name.trim().toLowerCase(), t);
    teacherMap.set(t.id, t);
  });

  const classMap = new Map<string, Class>();
  classes.forEach(c => {
    classMap.set(c.name.trim().toLowerCase(), c);
    classMap.set(normalizeClassName(c.name).trim().toLowerCase(), c);
  });

  const subjectMap = new Map<string, Subject>();
  subjects.forEach(s => {
    subjectMap.set(s.name.trim().toLowerCase(), s);
    subjectMap.set(normalizeSubjectName(s.name).trim().toLowerCase(), s);
  });

  const is2DArray = Array.isArray(rows[0]);
  const headerMap: Record<string, number> = {};
  let headerRowIdx = 0;

  if (is2DArray) {
    // Keresünk az első néhány sorban, hogy biztosan megtaláljuk a fejléc sort
    for (let r = 0; r < Math.min(5, rows.length); r++) {
      const rowStr = (rows[r] || []).join(' ').toLowerCase();
      if (rowStr.includes('dátum') || rowStr.includes('helyettesít')) {
        headerRowIdx = r;
        break;
      }
    }

    const headerRow = rows[headerRowIdx] as any[];
    headerRow.forEach((h, idx) => {
      if (!h) return;
      const s = String(h).toLowerCase().trim();
      if ((s.includes('dátum') || s.includes('datum')) && headerMap['date'] === undefined) headerMap['date'] = idx;
      // Pontos 'óra' egyezés, kizárva az 'on-line óra' / 'online óra' oszlopot!
      if ((s === 'óra' || s === 'ora' || ((s.includes('óra') || s.includes('ora')) && !s.includes('on-line') && !s.includes('online'))) && headerMap['period'] === undefined) {
        headerMap['period'] = idx;
      }
      if ((s.includes('helyettesített') || s.includes('helyettesitett')) && headerMap['origTeacher'] === undefined) headerMap['origTeacher'] = idx;
      if ((s.includes('helyettesítő') || s.includes('helyettesito')) && headerMap['subTeacher'] === undefined) headerMap['subTeacher'] = idx;
      if ((s.includes('típ') || s.includes('tip')) && headerMap['subType'] === undefined) headerMap['subType'] = idx;
      if ((s.includes('osztály') || s.includes('csoport')) && headerMap['class'] === undefined) headerMap['class'] = idx;
      if ((s.includes('tantárgy') || s.includes('tantargy')) && headerMap['subject'] === undefined) headerMap['subject'] = idx;
      if ((s.includes('megjegyzés') || s.includes('megjegyzes')) && headerMap['comment'] === undefined) headerMap['comment'] = idx;
      if ((s.includes('oka') || s === 'ok' || (s.includes('ok') && !s.includes('fok'))) && headerMap['reason'] === undefined) headerMap['reason'] = idx;
    });
  }

  const aggregatedMap = new Map<string, {
    subTeacherName: string;
    origTeacherName: string;
    dayIndex: number;
    period: number;
    className: string;
    subjectName: string;
    subType: string;
    comment: string;
    reason: string;
    dates: string[];
  }>();

  const startIdx = is2DArray ? (headerRowIdx + 1) : 0;
  for (let i = startIdx; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    let rawDate: any = '';
    let rawPeriod: any = '';
    let origTeacher: string = '';
    let subTeacher: string = '';
    let subType: string = '';
    let className: string = '';
    let subjectName: string = '';
    let comment: string = '';
    let reason: string = '';

    if (is2DArray) {
      rawDate = row[headerMap['date'] ?? 0];
      rawPeriod = row[headerMap['period'] ?? 1];
      origTeacher = String(row[headerMap['origTeacher'] ?? 2] || '').trim();
      subType = String(row[headerMap['subType'] ?? 5] || 'Helyettesítés').trim();
      subTeacher = String(row[headerMap['subTeacher'] ?? 6] || '').trim();
      className = String(row[headerMap['class'] ?? 7] || '').trim();
      subjectName = String(row[headerMap['subject'] ?? 8] || '').trim();
      comment = String(row[headerMap['comment'] ?? 4] || '').trim();
      reason = String(row[headerMap['reason'] ?? 3] || '').trim();
    } else {
      rawDate = row['Helyettesítés dátuma'] ?? row['Dátum'] ?? row['datum'];
      rawPeriod = row['Óra'] ?? row['ora'];
      origTeacher = String(row['Helyettesített pedagógus'] ?? row['Helyettesitett'] ?? '').trim();
      subTeacher = String(row['Helyettesítő pedagógus'] ?? row['Helyettesito'] ?? '').trim();
      subType = String(row['Helyettesítés típusa'] ?? row['Tipus'] ?? 'Helyettesítés').trim();
      className = String(row['Osztály/csoport'] ?? row['Osztaly'] ?? '').trim();
      subjectName = String(row['Tantárgy'] ?? row['Tantargy'] ?? '').trim();
      comment = String(row['Megjegyzés'] ?? '').trim();
      reason = String(row['Helyettesítés oka'] ?? '').trim();
    }

    if (!subTeacher) continue;
    const dateInfo = parseExcelDateToDayAndString(rawDate);
    if (!dateInfo || dateInfo.dayIndex < 0 || dateInfo.dayIndex >= NUMBER_OF_DAYS) continue;

    // Az 1. heti (szeptember 7. előtti) nem végleges helyettesítések kiszűrése
    if (minDate && dateInfo.dateStr < minDate) continue;
    if (maxDate && dateInfo.dateStr > maxDate) continue;

    const periodNum = parseInt(String(rawPeriod || '1').trim(), 10);
    if (isNaN(periodNum) || periodNum < 1 || periodNum > NUMBER_OF_PERIODS) continue;
    const period = periodNum - 1;

    const normalizedCls = normalizeClassName(className) || className;

    const aggKey = [
      subTeacher.toLowerCase(),
      origTeacher.toLowerCase(),
      dateInfo.dayIndex,
      period,
      normalizedCls.toLowerCase(),
      subjectName.toLowerCase(),
      subType.toLowerCase()
    ].join('__');

    if (!aggregatedMap.has(aggKey)) {
      aggregatedMap.set(aggKey, {
        subTeacherName: subTeacher,
        origTeacherName: origTeacher,
        dayIndex: dateInfo.dayIndex,
        period,
        className: normalizedCls,
        subjectName,
        subType,
        comment,
        reason,
        dates: []
      });
    }

    aggregatedMap.get(aggKey)!.dates.push(dateInfo.dateStr);
  }

  const result: Substitution[] = [];
  let index = 1;

  aggregatedMap.forEach((item) => {
    item.dates.sort();
    const occurrences = item.dates.length;
    const isLongTerm = occurrences >= 2;
    const firstDate = item.dates[0];
    const lastDate = item.dates[item.dates.length - 1];
    const dateRange = firstDate === lastDate ? firstDate : `${firstDate} – ${lastDate}`;

    const subTeacherObj = teacherMap.get(item.subTeacherName.toLowerCase());
    const origTeacherObj = teacherMap.get(item.origTeacherName.toLowerCase());
    const classObj = classMap.get(item.className.toLowerCase());
    const subjectObj = subjectMap.get(item.subjectName.toLowerCase()) || subjectMap.get(normalizeSubjectName(item.subjectName).toLowerCase());

    result.push({
      id: `sub-${index++}`,
      day: item.dayIndex,
      period: item.period,
      substituteTeacherName: item.subTeacherName,
      originalTeacherName: item.origTeacherName,
      substituteTeacherId: subTeacherObj?.id,
      originalTeacherId: origTeacherObj?.id,
      className: item.className,
      classId: classObj?.id,
      subjectName: item.subjectName,
      subjectId: subjectObj?.id,
      substitutionType: item.subType,
      comment: item.comment || undefined,
      reason: item.reason || undefined,
      occurrences,
      dates: item.dates,
      dateRange,
      isLongTerm
    });
  });

  return result.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    if (a.period !== b.period) return a.period - b.period;
    return a.substituteTeacherName.localeCompare(b.substituteTeacherName, 'hu-HU');
  });
};

export const applySubstitutionsToAvailability = (
  teachers: Teacher[],
  substitutions: Substitution[],
  onlyLongTerm: boolean = true
): Teacher[] => {
  return teachers.map(teacher => {
    const cleanName = teacher.name.trim().toLowerCase();
    const matchingSubs = substitutions.filter(sub => {
      if (onlyLongTerm && !sub.isLongTerm) return false;
      if (sub.substituteTeacherId && sub.substituteTeacherId === teacher.id) return true;
      return sub.substituteTeacherName.trim().toLowerCase() === cleanName;
    });

    if (matchingSubs.length === 0) return teacher;

    const newAvail = teacher.availability.map(dayArr => [...dayArr]);
    matchingSubs.forEach(sub => {
      if (sub.day >= 0 && sub.day < NUMBER_OF_DAYS && sub.period >= 0 && sub.period < NUMBER_OF_PERIODS) {
        newAvail[sub.day][sub.period] = false;
      }
    });

    return {
      ...teacher,
      availability: newAvail
    };
  });
};

export const KRETA_DAY_MAP: Record<string, number> = {
  'Hétfő': 0, 'hétfő': 0,
  'Kedd': 1, 'kedd': 1,
  'Szerda': 2, 'szerda': 2,
  'Csütörtök': 3, 'csütörtök': 3,
  'Péntek': 4, 'péntek': 4,
};

/**
 * Ha a Kréta órarend export két hetes adatot tartalmaz (pl. 1. hét szept 1-4 ideiglenes,
 * 2. hét szept 7-től végleges órarend), kiszűri az 1. hetet, és kizárólag a 2. heti
 * (szeptember 7-től kezdődő) végleges tanórákat tartja meg.
 */
export const filterToSecondWeekIfDualExport = (rows: any[][]): any[][] => {
  if (!rows || rows.length < 1500) return rows;
  const header = rows[0];
  const mid = Math.floor(rows.length / 2);
  let splitRow = -1;

  // A Kréta export a pedagógusok szerint rendezi az órákat hetenként.
  // Az 1. hét végén az utolsó pedagógus (Szabó Imre) után a 2. hét újraindul a lista elejétől (Szabó Árpádné).
  for (let i = mid - 100; i <= mid + 100; i++) {
    const prevTeacher = String(rows[i - 1]?.[6] || '').trim();
    const currTeacher = String(rows[i]?.[6] || '').trim();
    if (currTeacher && currTeacher !== prevTeacher) {
      if (currTeacher.includes('Szabó Árpádné') || (i >= mid && prevTeacher.includes('Szabó Imre'))) {
        splitRow = i;
        break;
      }
    }
  }

  // Tartalék vizsgálat: óraszám újraindul '1'-re pedagógus váltásnál
  if (splitRow === -1) {
    for (let i = mid - 50; i <= mid + 50; i++) {
      const prevTeacher = String(rows[i - 1]?.[6] || '').trim();
      const currTeacher = String(rows[i]?.[6] || '').trim();
      const period = String(rows[i]?.[2] || '').trim();
      if (currTeacher && currTeacher !== prevTeacher && period === '1') {
        splitRow = i;
        break;
      }
    }
  }

  if (splitRow !== -1) {
    console.info(`Két hetes Kréta órarend észlelve: 1. hét kihagyva (${splitRow - 1} sor), 2. hét megtartva (${rows.length - splitRow} sor, 2026. szept. 7-től).`);
    return [header, ...rows.slice(splitRow)];
  }

  return rows;
};

export const parseKretaCombinedExports = (
  orarendRows: any[][],
  ttfRows?: any[][],
  substitutionRows?: any[][]
): KretaCombinedImportResult => {
  // 0. Ha az órarend fájl két hetes exportot tartalmaz (1. hét ideiglenes, 2. hét szept 7-től végleges),
  // szűrjük le automatikusan a 2. hétre (szeptember 7-től érvényes végleges órákra)!
  const cleanOrarendRows = filterToSecondWeekIfDualExport(orarendRows);

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
  const header = cleanOrarendRows[0] || [];
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
  // Pass 1: find known classes from non-empty Osztály column
  const knownClasses = new Set<string>();
  if (ttfData?.classes) {
    ttfData.classes.forEach(c => knownClasses.add(c.name));
  }
  for (let rowIndex = 1; rowIndex < cleanOrarendRows.length; rowIndex++) {
    const r = cleanOrarendRows[rowIndex];
    if (r && r[colClass]) {
      const c = r[colClass].toString().trim();
      if (c && !/csoport|hittan|etika|utazó/i.test(c)) {
        knownClasses.add(normalizeClassName(c));
      }
    }
  }

  for (let rowIndex = 1; rowIndex < cleanOrarendRows.length; rowIndex++) {
    const row = cleanOrarendRows[rowIndex];
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

    // Resolve Class and Group
    const { className: cleanClassName, groupName: resolvedGroup } = resolveKretaClassAndGroup(
      rawClassStr,
      rawGroupStr,
      rawSubjectStr,
      rawRoomStr,
      knownClasses,
      cleanTeacherName
    );

    let classObj = classMapByName.get(cleanClassName.toLowerCase());
    if (!classObj) {
      classObj = {
        id: `c${classes.length + 1}`,
        name: cleanClassName
      };
      classes.push(classObj);
      classMapByName.set(cleanClassName.toLowerCase(), classObj);
    }

    // Resolve Subject
    const cleanSubjectName = normalizeSubjectName(rawSubjectStr);
    let subject = subjectMapByName.get(cleanSubjectName.toLowerCase());
    if (!subject) {
      subject = {
        id: `s${subjects.length + 1}`,
        name: cleanSubjectName
      };
      subjects.push(subject);
      subjectMapByName.set(cleanSubjectName.toLowerCase(), subject);
    }

    // Find or create Allocation
    const allocKey = makeAllocKey(teacher.name, cleanClassName, resolvedGroup || '', cleanSubjectName);
    let allocation = allocMapByKey.get(allocKey);
    if (!allocation) {
      const fallbackKey = makeAllocKey(teacher.name, cleanClassName, '', cleanSubjectName);
      const fallbackAlloc = allocMapByKey.get(fallbackKey);
      if (fallbackAlloc && !fallbackAlloc.originalGroup) {
        allocation = fallbackAlloc;
        allocation.originalGroup = resolvedGroup || rawGroupStr || undefined;
      }
    }
    if (!allocation) {
      allocation = {
        id: `alloc-gen-${allocations.length + 1}`,
        teacherId: teacher.id,
        classId: classObj.id,
        subjectId: subject.id,
        weeklyHours: 0,
        originalClass: rawClassStr || cleanClassName,
        originalGroup: resolvedGroup || rawGroupStr || undefined
      };
      allocations.push(allocation);
      allocMapByKey.set(allocKey, allocation);
    }

    if (!placedInstancesByAllocId.has(allocation.id)) {
      placedInstancesByAllocId.set(allocation.id, []);
    }
    placedInstancesByAllocId.get(allocation.id)!.push({
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
        period: inst.period,
        room: inst.room || undefined
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

  // 6. If substitutions are provided, parse and apply them to teacher availability
  let substitutions: Substitution[] | undefined = undefined;
  if (substitutionRows && substitutionRows.length >= 2) {
    try {
      substitutions = parseKretaSubstitutionExport(
        substitutionRows,
        migratedState.teachers,
        migratedState.classes,
        migratedState.subjects,
        '2026-09-07'
      );
      migratedState.teachers = applySubstitutionsToAvailability(
        migratedState.teachers,
        substitutions,
        true // Tartós helyettesítésnél lezárja a rendelkezésre állást
      );
      migratedState.substitutions = substitutions;
    } catch (err) {
      console.warn("Nem sikerült feldolgozni a helyettesítési fájlt:", err);
    }
  }

  const totalContractedHours = migratedState.allocations.reduce((s, a) => s + a.weeklyHours, 0);
  const unplacedHoursCount = Math.max(0, totalContractedHours - migratedState.placedLessons.length);

  return {
    state: migratedState,
    roomMap,
    rooms: Array.from(roomsSet).sort((a, b) => a.localeCompare(b, 'hu-HU')),
    substitutions,
    stats: {
      totalLessonsPlaced: migratedState.placedLessons.length,
      teachersCount: migratedState.teachers.length,
      classesCount: migratedState.classes.length,
      subjectsCount: migratedState.subjects.length,
      allocationsCount: migratedState.allocations.length,
      ttfAllocationsCount: ttfData ? ttfData.allocations.length : undefined,
      unplacedHoursCount,
      substitutionsCount: substitutions ? substitutions.length : undefined
    }
  };
};
