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

## Course Data Format

Each course must have an `_index.json` at its root. Courses without this file are ignored.

```json
{
  "course": "my-course-id",
  "total_lessons": 100,
  "downloaded": 100,
  "missing": 0,
  "categories": [
    {
      "index": 1,
      "name": "Introduction",
      "folder": "01 - Introduction",
      "sections": [
        {
          "index": 1,
          "name": "Introduction",
          "folder": "01 - Introduction",
          "lessons": [
            {
              "index": 1,
              "name": "Welcome",
              "url": "",
              "file": "01 - Welcome.mp4",
              "status": "downloaded",
              "has_description": false
            }
          ]
        }
      ]
    }
  ]
}
```

Lesson descriptions are embedded in the `name` field when `has_description: true` — the text after the first newline is the description.

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
