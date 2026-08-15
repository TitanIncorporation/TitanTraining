# Titan Training

Private, intelligent personal training for **trail / road running** (priority) + **strength / hypertrophy**.

## Privacy first

- All data stays **only on your device** (browser local storage)
- No accounts, no servers, no tracking
- Full **Backup** (download) and **Restore** (upload) so you can move data between phone and computer safely
- Architecture is ready for a future **private cloud** when you want automatic sync

## Features (current MVP)

- Athlete profile (HR zones, goals + priorities, equipment, constraints)
- Smart 4-week training plan generator
- Mark workouts complete
- Progress overview
- Export plan as calendar (.ics) for Garmin / any calendar
- Full data backup & restore

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Stack

- Next.js 15 + TypeScript
- Tailwind CSS
- date-fns, lucide-react

## Future

- Private cloud sync (your own storage)
- Strava connection
- Deeper Garmin integration
- Better progress analytics
