# CourseVault

A self-hosted, Kajabi-style course player for locally downloaded video courses. Built with Next.js 14, shadcn/ui, Prisma, and SQLite. Runs in Docker.

## Features

- Course library with progress bars and resume buttons
- Module list with per-module progress
- Video player with seek, auto-resume, and completion tracking (marks done at 90%)
- Right sidebar with all lessons in the current module, section groupings, checkmarks
- Search across all lesson names and descriptions
- Progress saved every 10 seconds and restored on revisit
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
- `lessons[].file` — filename of the MP4. Must match the actual file on disk exactly (case-sensitive).
- `has_description: true` — tells the app the `name` field contains a description after the first `\n`. URLs in descriptions are automatically turned into clickable links.

### If a course folder is visible in the filesystem but not in the app

Check that:
1. `_index.json` exists at the root of the course folder (not inside a subfolder)
2. The `course` field in `_index.json` is a valid URL slug (letters, numbers, hyphens only)
3. The JSON is valid (no trailing commas, correct brackets)

Note: extra folders without `_index.json` inside your courses directory are ignored. This is intentional — only properly indexed courses appear.

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
