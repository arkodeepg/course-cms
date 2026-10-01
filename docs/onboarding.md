---
description: "Onboard a new course folder added under /mnt/DATA/Archive/courses into course-cms with one command: audit, safe lossless fixes (faststart remux, index, cover), and a report of everything that needs a human."
version: 1.0
created: 2026-10-01
last_modified: 2026-10-01
status: active
changelog:
  - 2026-10-01: Initial creation, first run on Andrew Mioch - Lasting System
  - 2026-10-01: Moved into the course-cms repo (from AIW2 directives/course_cms_onboard.md); the command is now scripts/onboard.py
---

# Course CMS: onboard a new course

## When To Use

- A new course folder was added under `/mnt/DATA/Archive/courses` (moved in from qBittorrent, a downloader script, or by hand).
- A course was re-downloaded or partly replaced and needs re-checking. The command is idempotent, so rerunning is always safe.
- Not for hand-curated or scraper-built indexes you want rebuilt from scratch: the command refreshes those in place and never reorders them.

## Inputs

- The course folder name, e.g. `"Andrew Mioch - Lasting System"` (or its full path).
- App: course-cms at `http://100.97.39.56:3004` (this repo, `/mnt/DATA/projects/course-cms`; the workflow never edits app code). It revalidates `_index.json` by mtime, so no restart is needed.

## Where things live

| What | Path | Override |
|---|---|---|
| The onboarding command | `scripts/onboard.py` in this repo | |
| Helper scripts (index generator, remux, covers) | `/mnt/DATA/AIW2/execution/course_cms_build_index.py`, `course_remux_to_mp4.py`, `course_cms_covers.py` | env `COURSE_TOOLS_DIR` or `--tools-dir` |
| Python (needs tqdm, runs the helpers too) | `/mnt/DATA/AIW2/venv/bin/python` | env `COURSE_TOOLS_PYTHON` or `--tools-python` |
| Reports, backups, staged indexes | `/mnt/DATA/AIW2/.tmp/course_cms_onboard/<course folder>/` | env `COURSE_ONBOARD_OUT` or `--out-root` |
| Cover manifest | `/mnt/DATA/projects/course-cms/data/covers/manifest.json` | env `COURSE_CMS_COVER_MANIFEST` |

Run the script with the AIW2 venv python: it imports two of the helpers. Reports stay outside this repo so nothing generated lands in git.

## Rule zero: wait until the download has finished

Never run the fix pass on a folder that is still being written. Check the torrent or downloader says complete first. Step a also takes two size snapshots 60 s apart; if any file grew, appeared, or is a `.part` / `.crdownload` / `.!qB` file, every fix is blocked and the run is audit-only. Wait and rerun.

## Steps

All commands run from the repo root, `/mnt/DATA/projects/course-cms`.

1. Audit only (about a minute, writes nothing outside the report folder):
   `/mnt/DATA/AIW2/venv/bin/python scripts/onboard.py "<course folder>" --audit-only`
2. Read `/mnt/DATA/AIW2/.tmp/course_cms_onboard/<course folder>/REPORT.md` (format below).
3. Full run, in tmux, because the faststart remux of a large course takes a while:
   `tmux new -d -s course_onboard_<short> 'cd /mnt/DATA/projects/course-cms && /mnt/DATA/AIW2/venv/bin/python scripts/onboard.py "<course folder>" --yes'`
   Watch with `tmux attach -t course_onboard_<short>` (live tqdm bars). Without `--yes` it asks before fixing, and in a non-terminal it falls back to audit-only.
4. Read REPORT.md again and act on every REPORT and FAIL item (table below). Rerun the command after any re-download.

## What is automatic and what is report-only

| Step | Automatic (full run) | Report only |
|---|---|---|
| a. Download completeness | nothing | partial, hidden, zero-byte, growing files; index lesson count vs videos on disk |
| b. Duplicate content | nothing | byte-identical files (sha256 of same-size files); same-duration pairs to check by eye |
| c. Container and codec | MPEG-TS behind `.mp4`: lossless stream-copy container remux | avi/flv/wmv/mov/mkv, HEVC/AV1/VP9, 10-bit or 4:2:2 pix_fmt, non aac/mp3 audio, no audio, unreadable or truncated, each with the exact command |
| d. Bitrate | nothing | files above 6 Mbps, with the 2.5x sustained bandwidth they need |
| e. Faststart | lossless faststart remux of every TAIL-MOOV mp4, verified by the remux script, then a second census | files still TAIL-MOOV or UNPARSEABLE |
| f. Index | backup of the live index, then install of the new one, with rollback | a fresh build that would move lessons; new title collisions |
| g. Cover | `course_cms_covers.py --only <id>` | the chosen source and frame time, to check by eye |
| h. Resources | nothing | any resource not 200/206 with the right content type; the same file attached more than once |
| i. App smoke | nothing | course page, every module page, first lesson of each module, video Range 206, cover, `/api/search`, `/api/palette` |

Never automatic: re-encoding, deleting, renaming, or anything lossy.

### How the index step decides

- No live index: fresh build.
- Live index written by a scraper (lesson `url`, descriptions, `kajabi_state`, ...): `--from-index` refresh only.
- Otherwise a fresh build is used only if it keeps every category, section and lesson position, index, folder and file stem of the previous live index. If it would not, the `--from-index` refresh is installed instead and REPORT.md says which new files stayed out.
- Any candidate that fails that order check, or creates a sibling title collision, is never installed. The previous index is in `backup_<ts>/_index.json`.

## Reading REPORT.md

- Top table: one row per step with OK / FIXED / REPORT / FAIL / SKIPPED.
- Each step then lists "Done automatically", "Findings", and "Commands". Commands are never run by the script; run them only after reading the finding.
- `report.json` has the same data for scripts. `history/REPORT_<ts>_<mode>.md` keeps every run. `remux/results.jsonl` has one line per remuxed file plus THROTTLE_PAUSE / THROTTLE_RESUME lines.
- Exit code 1 means at least one FAIL. In an audit-only run, cover 404 and TAIL-MOOV are expected findings.

## Acting on report-only findings

- Partial, zero-byte, growing, unreadable or truncated: re-download that file from the source, then rerun.
- Byte-identical lessons: almost always the source served the wrong file for one lesson. Re-download the later one. Never delete either copy without the user saying so.
- Legacy containers (avi/flv/wmv/mov): run the `--mode transcode` command in REPORT.md. It writes a same-stem `.mp4` beside the original, which the index then prefers; originals stay.
- HEVC/AV1/VP9, 10-bit, bad audio: the REPORT gives an ffmpeg command that writes a hidden `.<stem>.x264.mp4` next to the source. Check it plays, then ask the user before it replaces anything.
- High bitrate: nothing to do unless remote playback stalls; then a re-encode is a user decision.
- Duplicate resource entries or wrong resource levels: fix the generator (`/mnt/DATA/AIW2/execution/course_cms_build_index.py`), never the JSON by hand, and rerun.
- Fresh build would move lessons: decide with the user. Moving positions breaks every saved lesson URL.

## Verification

- Rerun with `--audit-only`: e should show census FASTSTART only, f "already current, nothing written", g cover 200, i 0 failing.
- Open the course in the app and look at the cover.

## Known gotchas

- MPEG-TS behind `.mp4`: some downloaders save a transport stream under an `.mp4` name. Browsers refuse it. The container remux fixes it losslessly; the census calls these UNPARSEABLE until then.
- Shared disk: the archive and the app's SQLite share `sda`. Every remux runs under `nice -n 19` with `--io-throttle --app-url http://100.97.39.56:3004/`, which freezes ffmpeg while IO pressure or app latency is high.
- `sda` uses mq-deadline, which ignores `ionice -c3`; niceness alone does not protect the app, the throttle does.
- Lesson URLs are positional (`/course/<id>/<module>/<lesson>`), so lesson order must never change once a course is live. That is why the index step refuses any reorder.
- Generator changes are checked against all 23 courses: regenerate each with `--from-index --out-dir` into `/mnt/DATA/AIW2/.tmp/`, then run `/mnt/DATA/AIW2/.tmp/course_cms_rebuild/verify_order.py LIVE_ROOT NEW_ROOT` and `newdups.py` the same way. Both must pass for every course, and every changed title must be an improvement. Never write other courses' live indexes for this.
- `--from-index` keeps the live names, so a title fix in the generator reaches an existing course only if the live name still carries the broken form, or through a fresh build that passes the order check.
- Covers are skipped when the source is unchanged; a faststart remux changes file size, so the cover is regenerated once after it.
- Remux temps are hidden `.<name>.faststart.tmp.mp4` files; a killed run's temps are cleared by the next faststart run, and step a lists them.
