# Race results build process

## External content repository workflow

This project can build from content stored in another repository.

- `CONTENT_ROOT` controls where content folders are read from.
- Supported content folders are `clubs`, `info`, `epics`, `news`, `championships`, and `races`.

Example workflow using a separate repository:

```sh
CONTENT_REPO=Scottish-Hill-Runners/contents
CONTENT_REF=main
npm run content:sync
npm run content:build
```

Validation against synced content:

```sh
npm run validate:results:content
```

## Overview

The `build-race-results.js` script transforms raw race results from CSV files into compressed JSON format that the application uses.

## Directory structure

Place your raw race data in a `races/` folder at the project root:

```text
project-root/
├── races/
│   ├── ArrocharAlps/
│   │   └── 2023.csv
│   │   └── index.md
│   ├── BeinnResipol/
│   │   └── 2023.csv
│   │   ├── 2024.csv
│   │   └── index.md
│   ├── TwoBreweries/
│   │   └── 2022.csv
│   │   ├── 2023.csv
│   │   ├── 2024.csv
│   │   └── index.md
```

The pre-build step generates compressed JSON files.

- Each race has a `.json` file containing the extracted contents of `index.md` and all the results for the race.
- A set of files `R-0` to `R-99` contain individual results, grouped by a hash of the runner surname.
- A `years.json` file gives statistics of the number of runners in each category for each year.
- `races.json` contains an entry for each race, with race details and organiser contact information.
- `championships.json` contains an entry for each championship series.
- Race reports are written separately to `public/reports/{raceId}.json.gz`.

Race metadata can specify an absolute `raceDate`, such as `13th June 2027`
or `Sunday 13th June 2027`. The weekday is optional and is ignored when
calculating the date. The year is also optional for recurring dates.

Championship frontmatter can use a quoted consecutive-year season such as
`'2026/27'` or `'2026/2027'` instead of a single year. For each race, the
schedule uses the calendar date closest to 1 January of the second year;
ties go to the earlier date. Results are taken from the year of that date.
If there is no calendar date, results from either year are included. Official
standings CSVs use a hyphen in place of the slash, e.g. `2026-27.csv`.

```text
├── public/
│   └── results/
│       └── ArrocharAlps.json.gz
│       ├── BeinnResipol.json.gz
│       ├── TwoBreweries.json.gz
│       ├── ....json.gz
│       └── R-0.json.gz
│       └── R-1.json.gz
│       └── R-....json.gz
│       └── years.json.gz
│       └── races.json.gz
│       └── championships.json.gz
└── ... other project files
```

### Race venue Plus Codes

The build decodes Plus Codes in a race's `venue` for calendar coordinates.
The first point of `route.geojson` takes precedence, followed by the venue
Plus Code, then the legacy `latitude` and `longitude` fields. Full Plus Codes
are decoded offline. Short codes, such as `V4FH+4G Castle Douglas`, need a
nearby locality reference from `LOCALITY_REFERENCES` in
[`scripts/plus-code.ts`](scripts/plus-code.ts). An unknown locality causes the
build to fail; no online lookup is made during the build.

To investigate an unknown locality using Google's Geocoding API:

1. Enable the [Geocoding API](https://developers.google.com/maps/documentation/geocoding/start)
   in a Google Cloud project with billing enabled. Create a suitably restricted
   API key and set it locally as `GOOGLE_MAPS_API_KEY`; do not commit the key.
2. Query the short code and locality, adding country or region if needed:

   ```sh
   curl --get 'https://maps.googleapis.com/maps/api/geocode/json' \
     --data-urlencode 'address=V4FH+4G Castle Douglas, Scotland, UK' \
     --data-urlencode "key=$GOOGLE_MAPS_API_KEY"
   ```

   `--data-urlencode` ensures the `+` is encoded correctly. Check that the
   response `status` is `OK`, inspect `results`, and confirm the location is
   the intended one. The result's `geometry.location` contains `lat` and `lng`.
   A query for just the locality can instead provide a nearby reference.
3. Before storing or using Google results, review the
   [Geocoding API policies](https://developers.google.com/maps/documentation/geocoding/policies)
   and applicable terms. Google limits coordinate caching and restricts use of
   its content outside its services; **do not commit API-derived coordinates**
   to this repository without confirming permission. Use a suitably licensed
   independent source for a persistent locality reference if necessary.
4. Add the independently sourced locality coordinates and a case-insensitive
   matching `pattern` to `LOCALITY_REFERENCES`. The coordinates should identify
   the locality, not the race start: the build uses them to recover the full
   code and decodes that code to the race coordinates. Check that the locality
   name is unambiguous and close enough to recover the intended code.
5. Run `npm run prebuild` against the relevant content and verify the resulting
   calendar coordinates. Commit the reference update separately from secrets.

## Race reports

Place reports in `content/races/{raceId}/{year}[-suffix].md`, alongside
the race's `index.md` and results. The four-digit year identifies the report
year; an optional non-empty suffix distinguishes multiple reports in that year.
The report is Markdown and may have YAML frontmatter containing string fields
`title`, `author`, and `excerpt`:

```markdown
---
title: A day on the hill
author: A Runner
excerpt: A report from the race.
---

The report goes here.
```

The build writes one gzip-compressed JSON array per race with reports to
`public/reports/{raceId}.json.gz`. Each entry contains `slug` (the filename
without `.md`), numeric `year`, Markdown `content`, and any supplied metadata
fields. Entries are ordered by year descending, then slug ascending. Races
without reports have no file; obsolete report files are removed on rebuild.
`CONTENT_ROOT` applies to these files as it does to other content.

Visitors can use **Add a race report** on the race info or reports tab to
compose a report and send it by email for review. The form requests a race year
and report, with optional title, author, and excerpt. Each submission suggests
a distinct year-prefixed filename so reports for the same year can coexist.

## CSV format

Each CSV file should contain race results with the following columns:

```csv
RunnerPosition,Surname,Firstname,Club,RunnerCategory,FinishTime
1,John,Smith,City Athletic,M,23:45
2,Mary,Johnson,Town Runners,F40,26:12
...
```

**Core columns (required):**

- `RunnerPosition` (or `Position`, `FinishPosition`, `Pos`)
- `Surname` + `Firstname` (or single `Name` column)
- `RunnerCategory` (or `Category`, `Cat`) — optional but recommended
- `FinishTime` (or `Time`)
- `Club` — optional but recommended

**Team and relay columns (optional):**

- `Team` — team name (e.g., `Carnethy A`)
- `Leg` — leg number or label (e.g., `1`, `2`, `prologue`)

If either `Team` or `Leg` is present, both should ideally be populated for consistency.

**Important:**

- The CSV filename (without `.csv` extension) is used as the **year** field
- Include a header row
- Times can be in multiple formats: `hh:mm:ss`, `mm:ss`, or decimal minutes (e.g., `85:30` or `85.30`)
- For team/relay events with missing times, leave the cell empty; incomplete legs will be marked in the UI
- Prefer canonical club names (e.g., `Westerlands CCC` over `Westies`) to enable accurate club linking

## Build process

The script runs automatically before each build:

```bash
npm run build
```

This executes the `prebuild` script which:

1. Reads all race folders in `results/`
2. For each race folder, processes all `.csv` files
3. Extracts the year from each filename
4. Parses the CSV data
5. Creates a JSON object with year field added
6. Compresses to `.json.gz` format
7. Outputs to `public/results/...`
