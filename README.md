# Mój Plan

Mobilna, instalowalna aplikacja PWA do prowadzenia stałego planu zajęć oraz zmian w konkretnych tygodniach.

## Co potrafi

- pozwala przechodzić między kolejnymi tygodniami,
- pokazuje tydzień jako elastyczną tabelę czasu od poniedziałku do piątku,
- skaluje całą szerokość tabeli do ekranu albo pozwala przełączyć się na czytelniejszy widok przewijany,
- pozwala dodać wydarzenie po dotknięciu dowolnej godziny i edytować je po dotknięciu kafelka,
- odwzorowuje długość kafelka proporcjonalnie do czasu wydarzenia (także poza szkolnym układem 45 minut),
- zawiera plan bazowy przepisany z dostarczonej tabeli,
- obsługuje dodatkowe zajęcia, korepetycje, zebrania, rady pedagogiczne i inne wpisy,
- pozwala odwołać pojedyncze wystąpienie zajęć bez usuwania go z planu bazowego,
- pozwala zmienić stałe zajęcia tylko w wybranym dniu albo we wszystkich tygodniach,
- wykrywa nakładające się terminy,
- synchronizuje plan między telefonem i komputerem w opublikowanej wersji z bazą D1,
- chroni synchronizację kodem wpisywanym tylko raz na każdym urządzeniu,
- zachowuje lokalną kopię i pozwala pracować offline,
- eksportuje i importuje kopię planu,
- działa offline po pierwszym uruchomieniu.

## Uruchomienie

W katalogu aplikacji uruchom:

```bash
npm start
```

Następnie otwórz `http://localhost:4173`. Lokalny serwer pokazuje interfejs i zapisuje dane na jednym urządzeniu. Synchronizacja działa po opublikowaniu wersji Worker z logicznym wiązaniem D1 `DB` i migracją z katalogu `drizzle/`.

Aby zainstalować aplikację na telefonie, musi być udostępniona przez HTTPS; w Chrome wybierz „Zainstaluj aplikację”, a w Safari na iPhonie „Udostępnij” → „Do ekranu początkowego”. Aplikacja dopuszcza orientację pionową i poziomą (systemowa blokada obrotu telefonu nadal ma pierwszeństwo).

## Budowanie

```bash
npm run build
```

Katalog `build/` zawiera wariant statyczny bez synchronizacji, a `dist/` wariant Worker używany przez hosting aplikacji.

## Publikacja w Cloudflare z D1

1. Zbuduj aplikację i utwórz bazę:

   ```bash
   npm run build
   npx wrangler d1 create moj-plan-db
   ```

2. Skopiuj `wrangler.example.jsonc` jako `wrangler.jsonc` i wklej zwrócony identyfikator bazy w pole `database_id`. Wiązanie bazy musi pozostać nazwane `DB`.

3. Utwórz tabelę w zdalnej bazie:

   ```bash
   npx wrangler d1 migrations apply moj-plan-db --remote
   ```

4. Wygeneruj kod urządzeń i jego skrót:

   ```bash
   npm run generate:sync-code
   npx wrangler secret put SYNC_SECRET_HASH
   ```

   Do polecenia `wrangler secret put` wklej wyłącznie wartość `SYNC_SECRET_HASH`. Wartość `KOD_DLA_URZADZEN` zachowaj — wpiszesz ją raz w aplikacji na telefonie i raz na komputerze. Jawny kod nie trafia do repozytorium ani D1.

5. Opublikuj Worker:

   ```bash
   npx wrangler deploy
   ```

Przy automatycznym wdrażaniu z GitHuba ustaw polecenie budowania `npm run build`, a wdrażania `npx wrangler deploy`. Sekret `SYNC_SECRET_HASH` dodaj w ustawieniach Workera w Cloudflare, nigdy w pliku konfiguracyjnym. Po otwarciu aplikacji wybierz **Więcej → Ustaw kod**.

## Testy

```bash
npm test
```
