<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Adding or changing a course

Asked to add, re-download or fix a course? Courses live in `/mnt/DATA/Archive/courses/<course folder>/`. After the download has finished, always run `scripts/onboard.py` from this repo, with the AIW2 venv python:

```bash
cd /mnt/DATA/projects/course-cms
/mnt/DATA/AIW2/venv/bin/python scripts/onboard.py "<course folder>" --audit-only   # read-only check
tmux new -d -s course_onboard_x 'cd /mnt/DATA/projects/course-cms && /mnt/DATA/AIW2/venv/bin/python scripts/onboard.py "<course folder>" --yes'   # fixes
```

- It builds or refreshes `_index.json` via `/mnt/DATA/AIW2/execution/course_cms_build_index.py`, remuxes for faststart losslessly and makes the cover. Do not hand-write `_index.json` unless the generator cannot handle the course; an existing hand or scraper index is refreshed in place with `--from-index`.
- Never change lesson order of an existing course: URLs are positional (`/course/{id}/{module}/{lesson}`).
- Done means: `/mnt/DATA/AIW2/.tmp/course_cms_onboard/<course folder>/REPORT.md` shows no auto-fixable items left (faststart census clean, index "already current", cover 200) and the app smoke step passes with 0 failing. Confirm with a final `--audit-only` rerun.
- Report-only findings (partial or duplicate files, unplayable codecs, high bitrate, broken resources, a build that would move lessons): tell the user, with the command REPORT.md gives. Never delete, rename or re-encode anything without the user saying so.
- If a file is still growing, the run is audit-only by design: wait and rerun.

Details: README.md "Adding a Course" and `docs/onboarding.md`. Helper locations are overridable (`COURSE_TOOLS_DIR`, `COURSE_TOOLS_PYTHON`, `COURSE_ONBOARD_OUT`).
