# CourseVault

A self-hosted, Kajabi-style course player for locally downloaded video courses. Built with Next.js 14, shadcn/ui, Prisma, and SQLite. Runs in Docker.

## Features

- Course library sorted by most recent activity — courses you watch regularly float to the top automatically
- Per-course progress bars and resume buttons on the library page
- Module list with per-module progress tracking
- Module detail page with section accordions — sections collapse by default, sections with in-progress lessons auto-expand
- Video player with seek bar, volume slider, playback speed (1×–3×), auto-resume, and completion tracking (marks done at 90%)
- Timestamp deep links — `?t=` in the URL jumps to a moment in a lesson, plus a copy-link button that stamps the current time
- Progress saved every 10 seconds, on pause, and via beacon on tab close — restored on revisit
- Right sidebar on desktop with all course lessons, accordion by module, section groupings, checkmarks
- Mobile lesson queue — inline list of the current module's lessons shown below the video, so you can tap the next lesson without opening a drawer
- Mobile drawer (Contents button) for full cross-module navigation on small screens
- Search across all lesson names and descriptions
- Dark theme with red accent

## Tech Stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 14 (App Router) + TypeScript |
| UI | shadcn/ui + Tailwind CSS v3 |
| Database | Prisma 5 + SQLite |
| Containerisation | Docker |

## Adding a Course

**A course will only appear in CourseVault if its folder contains an `_index.json` file.** Other folders (without `_index.json`) are silently ignored, even if they contain video files.

### Required folder structure

```
/courses/
  My Course Name/          ← folder name can be anything
    _index.json            ← REQUIRED — this file makes the course appear
    01 - Module One/
      01 - Section/
        01 - Lesson.mp4
        02 - Another Lesson.mp4
    02 - Module Two/
      ...
```

### `_index.json` schema

`_index.json` is the single source of truth for modules, sections, and lessons. The app reads this file exclusively — it does not scan the file system for videos. Only lessons listed in `_index.json` will appear in the UI.

```json
{
  "course": "my-course-id",
  "total_lessons": 100,
  "downloaded": 100,
  "missing": 0,
  "categories": [
    {
      "index": 1,
      "name": "Module One",
      "folder": "01 - Module One",
      "sections": [
        {
          "index": 1,
          "name": "Section Name",
          "folder": "01 - Section",
          "lessons": [
            {
              "index": 1,
              "name": "Lesson Title",
              "url": "",
              "file": "01 - Lesson.mp4",
              "status": "downloaded",
              "has_description": false
            },
            {
              "index": 2,
              "name": "Lesson With Description\n\nThis text appears below the video.",
              "url": "",
              "file": "02 - Another Lesson.mp4",
              "status": "downloaded",
              "has_description": true
            }
          ]
        }
      ]
    }
  ]
}
```

**Key fields:**
- `course` — URL-safe identifier (e.g., `my-course`). Used in all navigation URLs.
- `categories` — top-level modules. Each maps to a numbered folder via `folder`.
- `sections` — sub-groupings within a module. If a category has only one section, section headers are hidden in the sidebar.
- `lessons[].file` — filename of the lesson's own file. Must match the actual file on disk exactly (case-sensitive).
- `has_description: true` — tells the app the `name` field contains a description after the first `\n`. URLs in descriptions are automatically turned into clickable links.

### Video lessons and article lessons

The lesson type is inferred from the extension of `lessons[].file`. There is no `type` field to set.

| `file` ends in | Renders as |
|----------------|------------|
| `.md` | An article — the Markdown is parsed on the server and rendered as formatted text, with a prev/next + **Mark complete** toolbar in place of the player |
| anything else | A video — the existing player, which marks the lesson complete at 90% watched |

Article lessons exist for text-first courses (Skool and similar), where most lessons are written rather than filmed. A leading `# Heading` in the Markdown file is dropped on render, because the page already shows the lesson title.

For a course saved as HTML pages, `execution/coursevault_skool_html_extract.py` in the AIW2 workspace extracts a sibling `.md` next to each `.html`; point `lessons[].file` at the `.md`.

### If a course folder is visible in the filesystem but not in the app

Check that:
1. `_index.json` exists at the root of the course folder (not inside a subfolder)
2. The `course` field in `_index.json` is a valid URL slug (letters, numbers, hyphens only)
3. The JSON is valid (no trailing commas, correct brackets)

Note: extra folders without `_index.json` inside your courses directory are ignored. This is intentional — only properly indexed courses appear.

## Timestamp Deep Links

A lesson URL accepts a `?t=` parameter that seeks the video to that point, the way YouTube does.

```
/course/my-course/2/5?t=90       plain seconds
/course/my-course/2/5?t=1m30s    unit form, also 90s and 1h2m3s
/course/my-course/2/5?t=1:30     clock form, also 1:02:30
```

To produce one without doing arithmetic, pause where you want and click the link icon in the player toolbar, left of fullscreen. It copies the current URL with the current time appended and flashes a green check. The button emits plain seconds.

Rules:

- An explicit `?t=` beats saved progress. Without it, playback resumes wherever you left off, unchanged.
- An unparseable or negative `t` is ignored rather than throwing you to the start, so a mangled link still resumes normally.
- The page seeks but does not autoplay. Browsers block unmuted autoplay without a user gesture, so a pasted link would otherwise fail silently.
- Article lessons ignore `t`.
- The address bar is not rewritten as you watch. `?t=` only appears when you arrived via a timestamp link.

Parsing lives in `lib/timestamp.ts` (`parseTimestamp`, `resolveStartPosition`, `formatTimestampParam`), covered by `__tests__/timestamp.test.ts`.

**Why the copy button has a clipboard fallback:** CourseVault is normally served over plain HTTP on a LAN or tailnet address, which is not a secure context, so `navigator.clipboard` is undefined there. The button falls back to a hidden textarea plus `document.execCommand("copy")`. Remove that fallback and the button silently does nothing on every non-localhost deployment.

## Running with Docker

```yaml
# docker-compose.yml
services:
  course-cms:
    build: .
    ports:
      - "3004:3004"
    volumes:
      - /path/to/your/courses:/courses:ro
      - ./data:/app/data
    environment:
      - DATABASE_URL=file:/app/data/course-cms.db
      - COURSES_PATH=/courses
      - PORT=3004
      - HOSTNAME=0.0.0.0
    restart: unless-stopped
```

```bash
docker compose up -d --build
```

The app will be available at `http://localhost:3004`.

## Running in Development

```bash
npm install
cp .env.example .env.local
# Edit .env.local to set COURSES_PATH to your local courses directory

npx prisma db push
npm run dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite file path | `file:./dev.db` |
| `COURSES_PATH` | Directory containing course folders | `/courses` |
| `PORT` | Server port | `3000` |

## License

MIT
