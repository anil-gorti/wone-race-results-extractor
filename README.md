# WONE — Race Results Extractor

Extract participant data from race timing platforms with adaptive parsing.

Paste one or more race result URLs and get clean, structured outputs — race name, participant name, category, finish time, rank, pace, and more. Built for runners, coaches, and analysts who want a reliable way to consolidate race history across inconsistent timing websites.

## Features

- **Multi-platform support** — Sports Timing Solutions, MyRaceIndia, and iFinish
- **Adaptive parsing** with fallback regex patterns for robust extraction across varying page layouts
- **Batch processing** — submit up to 100 URLs at once with parallel extraction (3 concurrent)
- **Real-time progress tracking** — live status updates as URLs are processed
- **Caching** — 24-hour cache per URL to avoid redundant scraping
- **Export** — download results as CSV, JSON, or Excel
- **Per-user data isolation** — each user's results are scoped to their account

## Extracted Fields

| Field | Description |
|-------|-------------|
| Race Name | Event name (e.g. "Tata Mumbai Marathon 2025") |
| Name | Participant name |
| Category | Age group / distance category |
| Finish Time | HH:MM:SS |
| BIB Number | Race bib |
| Rank (Overall) | Position among all finishers |
| Rank (Category) | Position within age/gender category |
| Pace | Minutes per km |

## Supported Platforms

- [Sports Timing Solutions](https://sportstimingsolutions.in) — `sportstimingsolutions.in`
- [MyRaceIndia](https://myraceindia.com) — `myraceindia.com`
- [iFinish](https://ifinish.in) — `ifinish.in`
- [Timing India](https://timingindia.com) — `timingindia.com`
- [MySamay](https://mysamay.in) — `mysamay.in`
- [NovaRace](https://novarace.in) — `novarace.in`

## Tech Stack

- **Frontend** — React 19, Tailwind CSS, Radix UI, Recharts
- **Backend** — Express, tRPC, Drizzle ORM (MySQL)
- **Scraping** — Playwright (headless Chromium)
- **Build** — Vite, TypeScript, esbuild

## Getting Started

```bash
# Install dependencies
pnpm install

# Run database migrations
pnpm db:push

# Start dev server
pnpm dev
```

Requires a `DATABASE_URL` environment variable pointing to a MySQL database.

## Usage

1. Sign in via the web UI
2. Paste one or more race result URLs (one per line)
3. Click **Extract Results**
4. Watch real-time progress as URLs are processed
5. View, sort, and export the results table

## Testing

```bash
pnpm test
```

## License

MIT
