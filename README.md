# Órarend Tervező Kézzel (v3.0.0)

Egy interaktív, böngészőben futó webalkalmazás, amely segít az oktatási intézmények órarend-felelőseinek a tanári és osztály-szintű órarendek manuális, de hatékony összeállításában közvetlenül a **Kréta** iskolai naplóból vett tantárgyfelosztás alapján.

## Főbb Funkciók

*   **Nyers Kréta Import:** Nincs szükség a Kréta export kézi előtisztítására. Az alkalmazás közvetlenül beolvassa a `klik...xlsx` tantárgyfelosztás fájlt, feloldja az összevont cellákat, és intelligensen szétválogatja a csoportokat, osztályokat és fejlesztő foglalkozásokat.
*   **Csoport- és Osztálykezelés:** Teljes körű támogatás a különálló csoportok (napközik, etika csoportok, idegen nyelvi csoportok) és virtuális osztályok (pl. utazó gyógypedagógiai osztály, kollégium) kezelésére.
*   **Párhuzamos Órák Kezelése:** Képes detektálni a soft-ütközéseket (például ha egy tanár egy időben több csoportnak is tart órát), és lehetővé teszi ezek felvételét egy megerősítő modális ablakon keresztül.
*   **Kréta-kompatibilis Export:** Az elkészült órarend exportálható a Kréta rendszer által elvárt formátumban (`kréta_import_órarend.xlsx`), megkülönböztetve a csoport- és osztály-szintű órákat, valamint legenerálva az összes referencia munkalapot (`Hetirend`, `Nap`, `Osztály` stb.).
*   **Automatikus Helyi OneDrive Mentés:** Helyi futtatás esetén az export gombra kattintva az alkalmazás nemcsak a böngészőbe tölti le a fájlt, hanem automatikusan elmenti a helyi OneDrive `2026/` könyvtárába is.
*   **Visszavonás / Mégis (Undo/Redo):** Előzmény-alapú állapotkezelés maximum 50 lépésig.
*   **Rendelkezésre Állás Generátor AI támogatással:** Automatikus helyettesítési beosztás tervező, amely a Google Gemini API-t használja az esetleges ütközések és lefedettségi problémák javítására.

## Helyi Futtatás

### Előfeltételek
*   [Node.js](https://nodejs.org/) (v18+)

### Lépések
1.  Telepítsd a függőségeket:
    ```bash
    npm install
    ```
2.  Másold le a `.env.example` fájlt `.env.local` néven, és állítsd be a `GEMINI_API_KEY` értékét a saját API kulcsodra:
    ```env
    GEMINI_API_KEY=a_te_api_kulcsod
    ```
3.  Indítsd el a helyi fejlesztői szervert:
    ```bash
    npm run dev
    ```
4.  Nyisd meg a **[http://localhost:3000](http://localhost:3000)** címet a böngésződben.

## Telepítés (Vercel)

A projekt fel van készítve a Vercelen történő statikus hosztolásra. A `vercel.json` már tartalmazza a szükséges gyorsítótár és URL-tisztítási beállításokat.

Telepítéshez futtasd a Vercel CLI-t a gyökérkönyvtárból:
```bash
npx vercel --yes --name orarendkeszito-v3
```
