# Projekt Dokumentáció: Órarendkészítő Kézzel

**Verzió:** 2.1.0
**Dátum:** 2026-03-19

## 1. Projekt Áttekintés

Az "Órarendkészítő Kézzel" egy böngészőben futó, interaktív webalkalkalmazás, amelynek célja, hogy segítse az oktatási intézmények órarend-felelőseit a tanári és osztály-szintű órarendek manuális, de hatékony összeállításában.

A program egy előre definiált `.xlsx` formátumú tantárgyfelosztást használ bemenetként. Az alkalmazás egy vizuális, "fogd és vidd" (drag-and-drop) felületet biztosít az órák elhelyezésére, miközben valós időben ellenőrzi az ütközéseket és támogatja a párhuzamos, differenciált oktatást.

A munkafolyamat folytonosságát automatikus böngésző-mentés, egy biztonságos Google Drive integráció, valamint egy robusztus **visszavonás/mégis funkció** biztosítja.

## 2. Technikai Architektúra

*   **Frontend Keretrendszer:** React (v19) TypeScript-tel (TSX).
*   **Állapotkezelés:** React Context API (`TimetableContext`). A v1.6.0-tól az alkalmazás egy előzmény-alapú állapotkezelést (history stack) használ, amely minden, az órarendet befolyásoló módosítást rögzít, lehetővé téve a visszavonás és újbóli végrehajtás (undo/redo) funkciókat.
*   **Stílus:** Tailwind CSS a gyors és reszponzív UI fejlesztésért.
*   **Build Folyamat:** Nincs szükség szerveroldali build lépésre. A `.tsx` fájlokat a böngészőben a **Babel Standalone** fordítja le.
*   **Fájlkezelés:** Az `xlsx` csomag felel az Excel fájlok beolvasásáért és feldolgozásáért.
*   **API Integráció:**
    *   **Google Identity Services (GIS):** A modern, biztonságos felhasználói hitelesítésért felel.
    *   **Google API Client Library for JavaScript (GAPI):** A hitelesítés utáni API hívásokat (fájlkezelés a Drive-on) kezeli.
    *   A teljes hitelesítési logikát a `hooks/useGoogleDrive.tsx` egyedi hook foglalja magába.

## 3. Verziótörténet és Fejlesztési Mérföldkövek

### v1.0 (Alapverzió)
*   `.xlsx` tantárgyfelosztás beolvasása.
*   Dupla nézetű órarendi rács (tanári és osztálynézet).
*   Órák elhelyezése drag-and-drop módszerrel.
*   Ütközéskezelés és tanári elérhetőség beállítása.
*   Automatikus mentés a böngésző `localStorage`-ébe.
*   Exportálás `.xlsx` és `.json` (mentés) formátumokba.

### v1.1.0 (Google Drive Integráció)
*   **Funkció:** Google Drive integráció bevezetése (bejelentkezés, mentés, betöltés).
*   **UI:** "Beállítások" modális ablak API kulcsok megadásához.

### v1.2.0 (Intelligens Tantárgyfelosztás Frissítés)
*   **Funkció:** Lehetővé teszi egy új `.xlsx` fájl feltöltését, ami intelligensen frissíti a meglévő tantárgyfelosztást.
*   **UI:** `UpdateAllocationModal`, amely a frissítés előtt egy részletes összefoglalót mutat.

### v1.3.0 (Párhuzamos Órák Kezelése)
*   **Funkció:** Az ütközéskezelés logikája megváltozott. A rendszer nem blokkolja az ütközést, hanem egy megerősítő párbeszédablakot jelenít meg.
*   **UI:** Az órarendi rács és kártyák frissültek a párhuzamos órák megjelenítéséhez.

### v1.4.0 (EGYMI-specifikus Ütközéskezelés)
*   **Logika:** Az ütközés definíciójának finomhangolása: csak akkor jelez, ha ugyanaz a tanár-osztály páros már rendelkezik órával az adott idősávban.

### v1.5.0 (Finomított Ütközéskezelés és Visszajelzés)
*   **Logika:** Az ütközéskezelés további finomítása: akkor jelez, ha a tanár VAGY az osztály már foglalt.
*   **UI:** A figyelmeztető ablakban csak a releváns, ütközést okozó órák jelennek meg.

### v1.6.0 (Visszavonás/Mégis Funkció)
*   **Funkció:** Bevezetésre került a visszavonás (Undo) és újbóli végrehajtás (Redo) funkció.
*   **Állapotkezelés:** Az `TimetableContext` teljesen át lett alakítva egy előzmény-alapú állapotkezelésre. Minden, az adatokat módosító művelet (óra elhelyezése, törlése, elérhetőség változtatása, nézetváltás stb.) egy új bejegyzést hoz létre az előzményekben.
*   **UI:** Új "Visszavonás" és "Mégis" gombok a fejlécben, amelyek dinamikusan aktiválódnak/inaktiválódnak.

### v1.7.0 (Fejlett Nyomtatási Beállítások)
*   **Funkció:** Az osztály órarendek nyomtatása alapértelmezetten fekvő (landscape) tájolással történik a jobb olvashatóság érdekében.
*   **Logika:** A nyomtatási funkció dinamikusan injektál egy stíluslapot a `@page` szabály módosítására, amikor az osztály órarendjét nyomtatják.

### v1.8.0 (Stabilitás és Felhasználói Élmény Javítása)
*   **Funkciók & Javítások:**
    *   **Átfogó Nyomtatási Reform:** A nyomtatási funkció teljesen újra lett írva a megbízhatóság és az esztétika jegyében.
        *   **Megbízhatóság:** A rendszer most már garantáltan csak a kiválasztott tanári vagy osztály-órarendet nyomtatja, kiküszöbölve a korábbi hibát, ahol a teljes alkalmazásfelület is megjelent a nyomtatási képen.
        *   **Professzionális Megjelenés:** A nyomtatási nézet professzionális, nyomdai minőségű elrendezést kapott, amely optimálisan kihasználja a fekvő A4-es lapot, nagyobb, olvashatóbb betűméretekkel és letisztult táblázat dizájnnal.
        *   **Elrendezési Hibák Javítása:** Az órarendi táblázatban javítva lett a hiba, amely miatt az utolsó (pénteki) nap tartalma esetenként levágódott.
    *   **Felhasználói Felület Finomhangolása:** A tanárok és osztályok kiválasztására szolgáló legördülő listák mostantól megbízhatóan, a magyar ABC-nek megfelelő sorrendben jelennek meg, megkönnyítve a gyors navigációt.
*   **Verziókezelés:** Az alkalmazás verziószáma frissítve és véglegesítve lett 1.8.0-ra a felhasználói felületen, a mentett állapotokban és a dokumentációban.

### v1.9.0 (Felhasználói felület finomhangolása és akadálymentesítés)
*   **Funkciók & Javítások:**
    *   **Görgethető óralista:** A "Beosztandó órák" szekció egyértelműen görgethető lett, ami megkönnyíti a sok órát tartó tanárok óráinak kezelését. A görgetősáv mostantól szükség esetén láthatóvá válik.
    *   **Sugó szövegek (Tooltipek):** Az órarendi cellákban, ahol a szöveg (pl. osztálynév, tantárgy) nem fér ki teljesen, az egérkurzort fölé mozgatva egy sugó szövegben megjelenik a teljes, vágatlan tartalom.
*   **Verziókezelés:** Az alkalmazás verziószáma frissítve lett 1.9.0-ra.

### v2.0.0 (Rendelkezésre Állási Beosztás Generátor AI-val)
*   **Funkció:** Új "Rendelkezésre Állás" gomb a felületen, amely egy komplex algoritmus segítségével automatikusan legenerálja a tanárok helyettesítésre, felügyeletre kijelölt óráit. Ha a generált beosztás hibákat tartalmaz (pl. nem jut mindenkinek 3 óra), egy "Javítási Javaslat AI-val" gomb jelenik meg, amely a Google Gemini API segítségével próbálja megjavítani a beosztást.
*   **Logika:** A generátor és az AI a következő szabályok alapján működik:
    1.  Egy tanár csak akkor osztható be rendelkezésre állásra, ha az adott óra "lyukasóra" a számára, és közvetlenül előtte vagy utána tanítási órája van aznap (vagy egy óra kihagyással).
    2.  Minden beosztható tanárnak heti **pontosan 3** rendelkezésre állási órát kell kapnia (se többet, se kevesebbet).
    3.  Minden idősávba (heti 40 óra) **pontosan 3** tanárt kell beosztani.
    4.  Egy tanárnak egy napon legfeljebb két rendelkezésre állási órája lehet, és csak akkor, ha azok **közvetlenül egymást követő** órák.
*   **UI:** A generált beosztás egy új, táblázatos modális ablakban jelenik meg. Az ablak egy jelentést is tartalmaz, amely kiemeli a hibákat. A beosztás exportálható `.xlsx` formátumba.
*   **Verziókezelés:** Az alkalmazás verziószáma 2.0.0-ra frissült.

### v2.1.0 (Memóriaoptimalizálás és Stabilitás)
*   **Funkciók & Javítások:**
    *   **Állapotkezelés Optimalizálása:** A `history` tömb mérete maximum 50 lépésre lett korlátozva a memóriaszivárgás elkerülése érdekében.
    *   **Nézetváltás Leválasztása:** A tanár- és osztálynézet váltása már nem hoz létre új bejegyzést a visszavonási előzményekben.
    *   **Mentés Optimalizálása:** A `localStorage`-be történő automatikus mentés egy 1 másodperces debounce mechanizmust kapott, javítva a UI válaszidejét.
    *   **Biztonságosabb ID Generálás:** A `Date.now()` helyett `crypto.randomUUID()` felel az egyedi azonosítók generálásáért.

## 4. Kódstruktúra Összefoglalása

*   **`App.tsx`**: A fő komponens, amely összefogja a teljes UI-t és a felhasználói interakciók logikai vezérlését.
*   **`contexts/TimetableContext.tsx`**: Az alkalmazás "agya". A v1.6.0 óta egy előzmény-vermet (history stack) kezel, tárolva az alkalmazás állapotának minden egyes verzióját. Itt található az `undo`, `redo` és minden adatmanipulációs logika.
*   **`hooks/useGoogleDrive.tsx`**: A Google-lel kapcsolatos logikát egy helyre zárja.
*   **`utils.ts`**: Segédfüggvényeket tartalmaz.
*   **`components/`**: A felhasználói felület építőkövei (rács, kártyák, modális ablakok).
*   **`types.ts`**: Az alkalmazásban használt összes TypeScript típus központi definíciója.

## 5. Lehetséges Továbbfejlesztések és Technikai Adó (Technical Debt)

A fejlesztőcsapat kódátvizsgálása alapján az alábbi kritikus pontok és továbbfejlesztési lehetőségek lettek azonosítva és részben javítva:

### 5.1. Állapotkezelés és Memóriaoptimalizálás (Kritikus) - JAVÍTVA (v2.1.0)
*   **History Stack korlátozása:** A `TimetableContext`-ben a `history` tömb mérete immár maximum 50 lépésre van limitálva, megelőzve a memóriaszivárgást és a böngésző lassulását.
*   **Nézetváltás leválasztása az Undo/Redo-ról:** A `selectedTeacherId` és `selectedClassId` változásai kikerültek a history stack-ből, így a puszta nézetváltás már nem hoz létre új visszavonható állapotot.
*   **Mentés optimalizálása (Debounce):** A `localStorage`-be történő szinkron mentéshez bekerült egy 1 másodperces `debounce` mechanizmus, így a fő szál (UI thread) nem akad meg folyamatos módosítások közben.

### 5.2. Kódminőség és Refaktorálás
*   **`App.tsx` darabolása:** A fő komponens túlságosan monolitikus. A drag-and-drop logikát, az exportálást és a modális ablakok kezelését külön egyedi hookokba (pl. `useDragAndDrop`, `useExport`) és kisebb komponensekbe kell kiszervezni.
*   **Biztonságosabb ID generálás:** - JAVÍTVA (v2.1.0) A `Date.now()` alapú azonosító-generálást lecseréltük `crypto.randomUUID()` használatára, így elkerülhetők az azonosító-ütközések.

### 5.3. Funkcionális Továbbfejlesztések
*   **Automatikus Óraelhelyezés:** Egy "varázspálca" gomb, ami megpróbálja a még be nem osztott órákat ütközésmentesen elhelyezni.
*   **Terem-menedzsment:** Termek hozzáadása az adathalmazhoz és ütközésvizsgálat terem-szinten is.
*   **Nyomtatási nézet finomítása:** További opciók a nyomtatási nézet testreszabására.