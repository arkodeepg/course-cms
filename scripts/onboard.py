#!/usr/bin/env python3
"""Onboard a newly added course folder into course-cms in one command.

DESCRIPTION:
Audit a course folder under /mnt/DATA/Archive/courses and apply only the safe
fixes: lossless container repair and faststart remux (verified, IO throttled),
an index rebuild that never changes lesson order, and a cover. Everything else
(incomplete downloads, duplicate files, codecs a browser cannot play, high
bitrates, broken resources, app errors) is written to a report with the exact
command to act on it. Never re-encodes, never deletes, never touches anything
lossy. Every step is idempotent, so rerunning after a re-download just works.

INPUTS:
- course: the course folder name ("Andrew Mioch - Lasting System") or its path
- --audit-only: run every check, apply no fix (index, remux, cover untouched)
- --yes: apply the fixes without asking (needed when stdin is not a terminal)
- --root DIR: archive root (default /mnt/DATA/Archive/courses)
- --app-url URL: course-cms base (default http://100.97.39.56:3004)
- --settle-secs N: gap between the two size snapshots (default 60)
- --bitrate-mbps N: report files above this bitrate (default 6)
- --tools-dir DIR: where the helper scripts live (env COURSE_TOOLS_DIR,
  default /mnt/DATA/AIW2/execution)
- --tools-python PATH: python that runs the helpers (env COURSE_TOOLS_PYTHON,
  default /mnt/DATA/AIW2/venv/bin/python). Run this script with the same
  python: it imports two helpers and needs tqdm.
- --out-root DIR: report root (env COURSE_ONBOARD_OUT, default
  /mnt/DATA/AIW2/.tmp/course_cms_onboard, kept there so earlier runs, index
  backups and history stay in one place and nothing lands in this git repo)
- env COURSE_CMS_COVER_MANIFEST: cover manifest the cover step reads
  (default /mnt/DATA/projects/course-cms/data/covers/manifest.json)

OUTPUTS:
- <out-root>/<course folder>/REPORT.md and
  report.json: one section per step (a..i) with status OK / FIXED / REPORT /
  FAIL / SKIPPED, findings, and the commands to act on report-only items
- .../history/REPORT_<ts>_<mode>.md: a copy per run
- .../backup_<ts>/_index.json: the previous live index, before any rewrite
- .../stage/{full,from}/<course>/_index.json: candidate indexes
- .../remux/: census.csv, census_summary.json, results.jsonl of the remux runs
- Fixes (unless --audit-only): videos remuxed in place (mtime kept), the live
  <course>/_index.json, and the cover in course-cms data/covers

ERRORS:
- A file still growing between the two snapshots blocks every fix (audit only).
- An index whose lesson order differs from the previous live index is never
  installed; a failed install is rolled back from the backup.
- Failed remux files are left as they were (the remux script verifies and
  only ever deletes its own temp). Exit 1 when any step is FAIL.

DEPENDENCIES:
- ffmpeg, ffprobe on PATH; tqdm in <tools-python> (the AIW2 venv)
- <tools-dir>/course_cms_build_index.py, course_remux_to_mp4.py and
  course_cms_covers.py, in the AIW2 workspace (run as subprocesses with
  <tools-python>, and the first two imported via sys.path)
- Lives in the course-cms repo as scripts/onboard.py; SOP in docs/onboarding.md
- Long runs: launch inside tmux, the remux runs under nice -n 19 with
  --io-throttle --app-url, because the disk is shared with the app's SQLite

EXAMPLES:
cd /mnt/DATA/projects/course-cms
/mnt/DATA/AIW2/venv/bin/python scripts/onboard.py "Andrew Mioch - Lasting System" --audit-only
tmux new -d -s course_onboard_x 'cd /mnt/DATA/projects/course-cms && /mnt/DATA/AIW2/venv/bin/python scripts/onboard.py "<course folder>" --yes'
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shlex
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from tqdm import tqdm

# ------------------------------------------------------------------ config
# Every external location is set here, from env vars; the flags --tools-dir,
# --tools-python and --out-root override them. The helper scripts stay in the
# AIW2 workspace; only this orchestrator lives in the course-cms repo.
TOOLS_DIR = Path(os.environ.get("COURSE_TOOLS_DIR", "/mnt/DATA/AIW2/execution"))
TOOLS_PY = os.environ.get("COURSE_TOOLS_PYTHON", "/mnt/DATA/AIW2/venv/bin/python")
OUT_ROOT = Path(os.environ.get("COURSE_ONBOARD_OUT", "/mnt/DATA/AIW2/.tmp/course_cms_onboard"))
COVER_MANIFEST = Path(os.environ.get(
    "COURSE_CMS_COVER_MANIFEST", "/mnt/DATA/projects/course-cms/data/covers/manifest.json"))


def _early_flag(name: str) -> str | None:
    """Read --tools-dir / --tools-python before argparse, because the imports need them."""
    for i, a in enumerate(sys.argv):
        if a == name and i + 1 < len(sys.argv):
            return sys.argv[i + 1]
        if a.startswith(name + "="):
            return a.split("=", 1)[1]
    return None


TOOLS_DIR = Path(_early_flag("--tools-dir") or TOOLS_DIR)
TOOLS_PY = _early_flag("--tools-python") or TOOLS_PY
if not (TOOLS_DIR / "course_cms_build_index.py").is_file():
    raise SystemExit(f"course tools not found in {TOOLS_DIR} (set COURSE_TOOLS_DIR or --tools-dir)")
sys.path.insert(0, str(TOOLS_DIR))
import course_cms_build_index as gen  # noqa: E402
import course_remux_to_mp4 as remux  # noqa: E402

PY = TOOLS_PY
GEN = TOOLS_DIR / "course_cms_build_index.py"
REMUX = TOOLS_DIR / "course_remux_to_mp4.py"
COVERS = TOOLS_DIR / "course_cms_covers.py"
DEFAULT_ROOT = Path("/mnt/DATA/Archive/courses")
DEFAULT_APP = "http://100.97.39.56:3004"

PARTIAL_SUFFIXES = (".part", ".crdownload", ".!qb", ".partial", ".download", ".tmp", ".aria2")
VIDEO_PROBE_EXTS = gen.VIDEO_EXTS | {".flv", ".wmv", ".ts"}
BROWSER_VCODECS = {"h264"}
BROWSER_ACODECS = {"aac", "mp3"}
REPORT_VCODECS = {"hevc", "av1", "vp9", "vp8", "mpeg4", "msmpeg4v3", "wmv3", "flv1", "mpeg2video"}
LEGACY = {".avi", ".flv", ".wmv", ".mov"}
STATUS_RANK = {"OK": 0, "SKIPPED": 0, "FIXED": 1, "REPORT": 2, "FAIL": 3}


def log(msg: str) -> None:
    tqdm.write(f"{time.strftime('%H:%M:%S')} {msg}")


# ------------------------------------------------------------------ report

class Report:
    def __init__(self, course: str, out_dir: Path, audit_only: bool):
        self.out_dir = out_dir
        self.data = {"course_folder": course, "started": time.strftime("%Y-%m-%dT%H:%M:%S"),
                     "mode": "audit-only" if audit_only else "fix", "steps": {}}

    def step(self, key: str, title: str) -> dict:
        s = {"title": title, "status": "OK", "findings": [], "actions": [], "commands": []}
        self.data["steps"][key] = s
        log(f"== {key}. {title}")
        return s

    @staticmethod
    def bump(s: dict, status: str) -> None:
        if STATUS_RANK[status] > STATUS_RANK[s["status"]] or s["status"] == "SKIPPED":
            s["status"] = status

    def save(self) -> None:
        self.data["finished"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        self.out_dir.mkdir(parents=True, exist_ok=True)
        (self.out_dir / "report.json").write_text(
            json.dumps(self.data, indent=2, ensure_ascii=False), encoding="utf-8")
        lines = [f"# Onboard report: {self.data['course_folder']}", "",
                 f"- Course id: `{self.data.get('course_id', '?')}`",
                 f"- Mode: {self.data['mode']}",
                 f"- Run: {self.data['started']} to {self.data['finished']}", "",
                 "| Step | Status | Summary |", "|---|---|---|"]
        for k, s in self.data["steps"].items():
            summ = s.get("summary", "")
            lines.append(f"| {k}. {s['title']} | {s['status']} | {summ} |")
        lines.append("")
        for k, s in self.data["steps"].items():
            lines += [f"## {k}. {s['title']}: {s['status']}", ""]
            if s.get("summary"):
                lines += [s["summary"], ""]
            if s["actions"]:
                lines += ["Done automatically:", ""] + [f"- {a}" for a in s["actions"]] + [""]
            if s["findings"]:
                lines += ["Findings:", ""] + [f"- {f}" for f in s["findings"][:400]]
                if len(s["findings"]) > 400:
                    lines.append(f"- ... {len(s['findings']) - 400} more in report.json")
                lines.append("")
            if s["commands"]:
                lines += ["Commands (run only after reading the finding, never blind):", ""]
                lines += ["```"] + s["commands"] + ["```", ""]
        (self.out_dir / "REPORT.md").write_text("\n".join(lines), encoding="utf-8")
        # Every run also keeps its own copy, so a rerun never hides an earlier finding.
        hist = self.out_dir / "history"
        hist.mkdir(exist_ok=True)
        tag = self.data["started"].replace(":", "").replace("-", "") + "_" + self.data["mode"].split()[0]
        (hist / f"REPORT_{tag}.md").write_text("\n".join(lines), encoding="utf-8")


# ------------------------------------------------------------------ helpers

def rel(p: Path, course_dir: Path) -> str:
    return str(p.relative_to(course_dir))


def all_files(course_dir: Path) -> list[Path]:
    return sorted(p for p in course_dir.rglob("*") if p.is_file())


def is_remux_tmp(p: Path) -> bool:
    return remux.is_our_tmp(p) or p.name.endswith(".remux.mp4")


def http(url: str, headers: dict | None = None, read: int = 65536, timeout: float = 30):
    """(status, headers, body bytes) for a GET, reading at most `read` bytes."""
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = r.read(read) if read else b""
            return r.status, {k.lower(): v for k, v in r.headers.items()}, body
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, b""
    except (urllib.error.URLError, OSError) as e:
        return 0, {"error": str(e)}, b""


def quote_path(p: str) -> str:
    return "/".join(urllib.parse.quote(s, safe="") for s in p.split("/"))


def load_json(p: Path) -> dict | None:
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def lesson_rows(j: dict):
    for ci, c in enumerate(j["categories"]):
        for si, s in enumerate(c["sections"]):
            for li, l in enumerate(s["lessons"]):
                f = Path(l["file"])
                yield (ci, c.get("index"), c.get("folder"), si, s.get("index"), s.get("folder"),
                       li, l.get("index"), f.stem), f.suffix.lower()


def order_check(ref: dict, new: dict) -> str:
    """Same positional check as .tmp/course_cms_rebuild/verify_order.py: lesson
    URLs are positional, so categories, sections and lessons must keep their
    positions, indices, folders and file stems (legacy -> .mp4 swap allowed)."""
    a, b = list(lesson_rows(ref)), list(lesson_rows(new))
    if len(a) != len(b):
        return f"FAIL lesson count {len(a)} -> {len(b)}"
    ca = [(c.get("index"), c.get("folder"), len(c["sections"])) for c in ref["categories"]]
    cb = [(c.get("index"), c.get("folder"), len(c["sections"])) for c in new["categories"]]
    if ca != cb:
        return "FAIL category structure"
    for (ka, ea), (kb, eb) in zip(a, b):
        if ka != kb:
            return f"FAIL position {ka} -> {kb}"
        if ea != eb and not (ea in LEGACY and eb == ".mp4"):
            return f"FAIL extension {ka[-1]} {ea} -> {eb}"
    if ref.get("course") != new.get("course"):
        return f"FAIL course id {ref.get('course')} -> {new.get('course')}"
    return f"PASS lessons={len(a)}"


def new_dups(ref: dict, new: dict) -> list[str]:
    """Sibling titles that collide in `new` but were distinct in `ref`."""
    def key(n):
        return n.split("\n")[0].casefold()

    def grp(r, n, where):
        d = defaultdict(list)
        for i, x in enumerate(n):
            d[key(x)].append(i)
        return [f"{where}: {n[m[0]].splitlines()[0]} x{len(m)}" for m in d.values()
                if len(m) > 1 and len({key(r[i]) for i in m}) > 1]
    out = grp([c["name"] for c in ref["categories"]], [c["name"] for c in new["categories"]], "modules")
    for cr, cn in zip(ref["categories"], new["categories"]):
        out += grp([s["name"] for s in cr["sections"]], [s["name"] for s in cn["sections"]], cn["name"])
        for sr, sn in zip(cr["sections"], cn["sections"]):
            out += grp([l["name"] for l in sr["lessons"]], [l["name"] for l in sn["lessons"]],
                       f"{cn['name']} / {sn['name']}")
    return out


def scraper_built(j: dict) -> bool:
    """An index written by a platform scraper carries data a fresh build would
    lose (lesson urls, descriptions, platform state): refresh it, never rebuild."""
    if any(k in j for k in ("kajabi_state", "source_url", "last_refreshed", "platform")):
        return True
    for c in j.get("categories", []):
        for s in c.get("sections", []):
            for l in s.get("lessons", []):
                if l.get("url") or l.get("has_description") or l.get("description"):
                    return True
    return False


def all_resources(j: dict) -> list[tuple[str, str, str]]:
    """(level, course-relative path, display name) the way the app resolves them."""
    out = []
    for r in j.get("resources", []):
        out.append(("course", r.get("path") or r["file"], r["name"]))
    for c in j.get("categories", []):
        for r in c.get("resources", []):
            out.append((f"module {c.get('index')}", r.get("path") or r["file"], r["name"]))
        for s in c["sections"]:
            for l in s["lessons"]:
                for r in l.get("resources", []):
                    p = r.get("path") or "/".join(x for x in (c.get("folder", ""), s.get("folder", ""),
                                                              r["file"]) if x)
                    out.append((f"lesson {l.get('index')}", p, r["name"]))
    return out


def sha256(p: Path, bar: tqdm | None = None) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        while True:
            b = f.read(8 << 20)
            if not b:
                break
            h.update(b)
            if bar is not None:
                bar.update(len(b))
    return h.hexdigest()


def ffprobe_full(p: Path) -> dict | None:
    r = subprocess.run(["nice", "-n", "19", "ffprobe", "-v", "error", "-print_format", "json",
                        "-show_format", "-show_streams", str(p)], capture_output=True, text=True)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


# ------------------------------------------------------------------ steps

def step_a(rep: Report, course_dir: Path, settle: int) -> bool:
    """Download completeness. Returns True when the folder is settled."""
    s = rep.step("a", "Download completeness")
    files = all_files(course_dir)
    partial = [p for p in files if p.name.lower().endswith(PARTIAL_SUFFIXES) and not is_remux_tmp(p)]
    hidden = [p for p in files if p.name.startswith(".") and not is_remux_tmp(p)]
    ours = [p for p in files if is_remux_tmp(p)]
    zero = [p for p in files if p.stat().st_size == 0]
    for p in partial:
        s["findings"].append(f"PARTIAL download file: `{rel(p, course_dir)}`")
    for p in hidden:
        if p not in partial:
            s["findings"].append(f"Hidden file (temp or metadata): `{rel(p, course_dir)}`")
    for p in ours:
        s["findings"].append(f"Leftover remux temp from a killed run (the next faststart run clears it): "
                             f"`{rel(p, course_dir)}`")
    for p in zero:
        s["findings"].append(f"ZERO-BYTE file (failed download, re-download it): `{rel(p, course_dir)}`")

    snap1 = {p: p.stat().st_size for p in files if p.exists()}
    log(f"   size snapshot 1 taken, waiting {settle}s for snapshot 2")
    for _ in tqdm(range(settle), desc="settle", unit="s", leave=False):
        time.sleep(1)
    files2 = all_files(course_dir)
    snap2 = {p: p.stat().st_size for p in files2 if p.exists()}
    growing = [p for p in snap2 if p in snap1 and snap2[p] != snap1[p]]
    appeared = [p for p in snap2 if p not in snap1 and not is_remux_tmp(p)]
    for p in growing:
        s["findings"].append(f"STILL GROWING: `{rel(p, course_dir)}` {snap1[p]} -> {snap2[p]} bytes")
    for p in appeared:
        s["findings"].append(f"APPEARED during the check: `{rel(p, course_dir)}`")
    settled = not growing and not appeared and not partial

    # Index lesson count vs video files on disk.
    live = load_json(course_dir / "_index.json")
    disk_videos = []
    for p in files2:
        if p.suffix.lower() in gen.VIDEO_EXTS and not p.name.startswith(".") and not is_remux_tmp(p) \
                and not any(part in gen.SKIP_DIR_NAMES or part.startswith(".")
                            for part in p.relative_to(course_dir).parts[:-1]):
            disk_videos.append(p)
    disk_rel = set()
    for p in disk_videos:
        if p.suffix.lower() in LEGACY and p.with_suffix(".mp4").is_file():
            continue
        disk_rel.add(rel(p, course_dir))
    if live:
        idx_rel = set()
        for c in live["categories"]:
            for sec in c["sections"]:
                for l in sec["lessons"]:
                    idx_rel.add(str(Path(c.get("folder", "")) / sec.get("folder", "") / l["file"]))
        not_indexed = sorted(x for x in disk_rel - idx_rel)
        not_on_disk = sorted(x for x in idx_rel - set(rel(p, course_dir) for p in files2))
        s["counts"] = {"index_lessons": live.get("total_lessons"), "videos_on_disk": len(disk_rel)}
        for x in not_indexed:
            s["findings"].append(f"Video on disk but not in the live index: `{x}`")
        for x in not_on_disk:
            s["findings"].append(f"Index lesson whose file is missing on disk: `{x}`")
        count_note = f"index {live.get('total_lessons')} lessons, {len(disk_rel)} videos on disk"
    else:
        count_note = f"no live index yet, {len(disk_rel)} videos on disk"
    s["summary"] = (f"{len(files2)} files; {count_note}; partial {len(partial)}, zero-byte {len(zero)}, "
                    f"growing {len(growing)}. " + ("Settled." if settled else "NOT settled: fixes blocked."))
    if s["findings"]:
        rep.bump(s, "REPORT")
    if not settled:
        rep.bump(s, "FAIL")
    return settled


def step_c_probe(course_dir: Path) -> dict[Path, dict | None]:
    vids = [p for p in all_files(course_dir)
            if p.suffix.lower() in VIDEO_PROBE_EXTS and not p.name.startswith(".") and not is_remux_tmp(p)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        res = list(tqdm(pool.map(ffprobe_full, vids), total=len(vids), desc="ffprobe", unit="file"))
    return dict(zip(vids, res))


def step_b(rep: Report, course_dir: Path, probes: dict[Path, dict | None]) -> None:
    s = rep.step("b", "Duplicate content")
    files = [p for p in all_files(course_dir) if p.stat().st_size > 0 and not p.name.startswith(".")
             and not p.name.startswith("_index") and not is_remux_tmp(p)]
    by_size = defaultdict(list)
    for p in files:
        by_size[p.stat().st_size].append(p)
    cands = [g for g in by_size.values() if len(g) > 1]
    total = sum(p.stat().st_size for g in cands for p in g)
    groups = []
    with tqdm(total=total, desc="hash same-size", unit="B", unit_scale=True) as bar:
        for g in cands:
            by_hash = defaultdict(list)
            for p in g:
                by_hash[sha256(p, bar)].append(p)
            groups += [m for m in by_hash.values() if len(m) > 1]
    for m in groups:
        names = ", ".join(f"`{rel(p, course_dir)}`" for p in m)
        s["findings"].append(f"BYTE-IDENTICAL ({m[0].stat().st_size} bytes): {names}. The later lesson is "
                             "most likely a wrong download: re-download it from the source; delete nothing "
                             "without the user")
    identical = {p for m in groups for p in m}
    by_dur = defaultdict(list)
    for p, info in probes.items():
        try:
            d = round(float(info["format"]["duration"]), 2) if info else None
        except (KeyError, TypeError, ValueError):
            d = None
        if d:
            by_dur[d].append(p)
    for d, m in by_dur.items():
        if len(m) > 1 and not set(m) <= identical:
            names = ", ".join(f"`{rel(p, course_dir)}`" for p in m)
            s["findings"].append(f"Same duration {d}s, different bytes (check by eye): {names}")
    s["summary"] = f"{len(groups)} byte-identical group(s), {len(cands)} same-size group(s) hashed"
    if s["findings"]:
        rep.bump(s, "REPORT")


def manual_transcode_cmd(p: Path, info_raw: dict, audio_only: bool) -> str:
    out = p.with_name(f".{p.stem}.x264.mp4")
    if audio_only:
        cmd = ["nice", "-n", "19", "ffmpeg", "-nostdin", "-i", str(p), "-map", "0:v:0", "-map", "0:a:0?",
               "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)]
    else:
        info = {"streams": info_raw.get("streams", [])}
        cmd = remux.transcode_cmd(p, info, out, "x264")
        cmd = [c for c in cmd if c not in ("-progress", "pipe:1", "-nostats")]
        cmd = ["nice", "-n", "19"] + cmd
    return shlex.join(cmd)


def step_c(rep: Report, course_dir: Path, probes: dict[Path, dict | None], args) -> list[Path]:
    """Container/codec audit. Returns the MPEG-TS-behind-.mp4 files (losslessly fixable)."""
    s = rep.step("c", "Container and codec audit")
    ts_files, legacy, heavy = [], [], []
    for p, info in probes.items():
        r = rel(p, course_dir)
        ext = p.suffix.lower()
        if info is None:
            s["findings"].append(f"UNREADABLE (ffprobe fails, truncated or corrupt): `{r}`. Re-download it")
            continue
        fmt = set(info.get("format", {}).get("format_name", "").split(","))
        streams = info.get("streams", [])
        v = next((x for x in streams if x.get("codec_type") == "video"), None)
        auds = [x for x in streams if x.get("codec_type") == "audio"]
        if ext in (".mp4", ".m4v") and not fmt & remux.MP4_FORMATS:
            ts_files.append(p)
            s["findings"].append(f"{'/'.join(sorted(fmt))} behind {ext} (lossless container remux "
                                 f"{'applied' if not args.audit_only else 'pending'}): `{r}`")
            continue
        if ext in gen.UNPLAYABLE_EXTS | LEGACY:
            if p.with_suffix(".mp4").is_file():
                continue
            legacy.append(p)
            s["findings"].append(f"Container a browser will not play ({ext}), no .mp4 sibling: `{r}`")
            continue
        try:
            dur = float(info.get("format", {}).get("duration") or 0)
        except ValueError:
            dur = 0
        if not dur:
            s["findings"].append(f"No duration (truncated?): `{r}`")
        if v is None:
            s["findings"].append(f"No video stream: `{r}`")
            continue
        vc, pix = v.get("codec_name"), v.get("pix_fmt") or ""
        problems = []
        if vc not in BROWSER_VCODECS:
            problems.append(f"video codec {vc}")
        if "10" in pix or "12" in pix or "422" in pix or "444" in pix:
            problems.append(f"pix_fmt {pix}")
        audio_bad = [a.get("codec_name") for a in auds if a.get("codec_name") not in BROWSER_ACODECS]
        if not auds:
            s["findings"].append(f"No audio stream (fine for a silent screencast, check it): `{r}`")
        if problems:
            heavy.append(p)
            s["findings"].append(f"{', '.join(problems)}: will not play everywhere: `{r}`")
            s["commands"].append(manual_transcode_cmd(p, info, audio_only=False))
        elif audio_bad:
            s["findings"].append(f"audio codec {', '.join(audio_bad)} (video is fine): `{r}`")
            s["commands"].append(manual_transcode_cmd(p, info, audio_only=True))
    if legacy:
        s["commands"].insert(0, shlex.join(["nice", "-n", "19", PY, str(REMUX), str(course_dir), "--mode",
                                            "transcode", "--io-throttle", "--app-url", args.app_url + "/"]))
    if heavy or any("audio codec" in f for f in s["findings"]):
        s["commands"].append("# each command above writes a hidden .<stem>.x264.mp4 next to the source; "
                             "verify it plays, then replace the original only with the user's approval")
    n = len(probes)
    s["summary"] = (f"{n} video files probed; MPEG-TS-behind-mp4 {len(ts_files)}, legacy containers "
                    f"{len(legacy)}, codec/pix_fmt problems {len(heavy)}")
    if s["findings"]:
        rep.bump(s, "REPORT")
    return ts_files


def step_d(rep: Report, course_dir: Path, probes: dict[Path, dict | None], limit: float) -> None:
    s = rep.step("d", "Bitrate")
    hi = []
    for p, info in probes.items():
        try:
            br = float(info["format"]["bit_rate"]) / 1e6
        except (KeyError, TypeError, ValueError):
            continue
        if br > limit:
            hi.append((br, p))
    for br, p in sorted(hi, reverse=True):
        s["findings"].append(f"{br:.1f} Mbps, needs about {br * 2.5:.0f} Mbps sustained (2.5x) to stream "
                             f"without buffering: `{rel(p, course_dir)}`")
    s["summary"] = (f"{len(hi)} file(s) above {limit:g} Mbps. Remote playback over Tailscale needs about "
                    f"2.5x the file bitrate; nothing is re-encoded automatically")
    if hi:
        rep.bump(s, "REPORT")


def run_remux(mode: str, course_dir: Path, log_dir: Path, app_url: str) -> int:
    cmd = ["nice", "-n", "19", PY, str(REMUX), str(course_dir), "--log-dir", str(log_dir),
           "--io-throttle", "--app-url", app_url + "/"]
    if mode != "container":
        cmd += ["--mode", mode]
    log(f"   $ {shlex.join(cmd)}")
    return subprocess.run(cmd).returncode


def census(course_dir: Path, log_dir: Path) -> dict:
    subprocess.run([PY, str(REMUX), str(course_dir), "--mode", "census", "--log-dir", str(log_dir)],
                   stdout=subprocess.DEVNULL)
    return load_json(log_dir / "census_summary.json") or {}


def step_e(rep: Report, course_dir: Path, ts_files: list[Path], fix: bool, out: Path, app_url: str) -> None:
    s = rep.step("e", "Faststart (and lossless container repair)")
    log_dir = out / "remux"
    if ts_files:
        if fix:
            rc = run_remux("container", course_dir, log_dir, app_url)
            s["actions"].append(f"container remux (stream copy, verified) of {len(ts_files)} file(s), rc={rc}")
            if rc != 0:
                rep.bump(s, "FAIL")
                s["findings"].append("container remux reported failures: see the run output")
            else:
                rep.bump(s, "FIXED")
        else:
            s["commands"].append(shlex.join(["nice", "-n", "19", PY, str(REMUX), str(course_dir),
                                             "--io-throttle", "--app-url", app_url + "/"]))
    before = census(course_dir, log_dir)
    counts = before.get("counts", {})
    tail = counts.get("TAIL-MOOV", 0)
    s["census_before"] = counts
    for u in before.get("unparseable", []):
        s["findings"].append(f"UNPARSEABLE mp4 (truncated?): `{u['path']}` {u['detail'][:120]}")
        rep.bump(s, "REPORT")
    if tail and fix:
        size = sum(p.stat().st_size for p in course_dir.rglob("*.mp4") if p.is_file())
        log(f"   faststart remux of {tail} TAIL-MOOV file(s), about {size / 1e9:.2f} GB, throttled")
        started = time.time()
        rc = run_remux("faststart", course_dir, log_dir, app_url)
        after = census(course_dir, log_dir)
        s["census_after"] = after.get("counts", {})
        stats = defaultdict(int)
        for line in (log_dir / "results.jsonl").read_text(encoding="utf-8").splitlines():
            try:
                row = json.loads(line)
            except ValueError:
                continue
            if row.get("job") == "faststart" and row.get("ts", "") >= time.strftime(
                    "%Y-%m-%dT%H:%M:%S", time.localtime(started - 1)):
                stats[row.get("status")] += 1
        s["actions"].append(f"faststart remux rc={rc} in {time.time() - started:.0f}s: "
                            f"{dict(stats)}; census after: {s['census_after']}")
        left = s["census_after"].get("TAIL-MOOV", 0)
        if rc != 0 or left:
            rep.bump(s, "FAIL")
            s["findings"].append(f"{left} file(s) still TAIL-MOOV after the run; see {log_dir}/results.jsonl")
        else:
            rep.bump(s, "FIXED")
    elif tail:
        s["findings"].append(f"{tail} TAIL-MOOV file(s): playback waits for the index at the end of each "
                             "file (fixed automatically in a full run, lossless)")
        s["commands"].append(shlex.join(["nice", "-n", "19", PY, str(REMUX), str(course_dir), "--mode",
                                         "faststart", "--io-throttle", "--app-url", app_url + "/"]))
        rep.bump(s, "REPORT")
    s["summary"] = f"census before: {counts}" + (f"; after: {s.get('census_after')}" if "census_after" in s else "")


def gen_build(course_dir: Path, out_dir: Path, from_index: bool) -> tuple[dict | None, str]:
    cmd = [PY, str(GEN), str(course_dir), "--out-dir", str(out_dir)]
    if from_index:
        cmd.append("--from-index")
    r = subprocess.run(cmd, capture_output=True, text=True)
    j = load_json(out_dir / course_dir.name / "_index.json")
    return j, (r.stdout.strip().splitlines() or [""])[0] if r.returncode == 0 else r.stderr.strip()[-300:]


def step_f(rep: Report, course_dir: Path, fix: bool, out: Path) -> dict | None:
    """Index. Returns the index the app will serve after this step."""
    s = rep.step("f", "Index")
    live_p = course_dir / "_index.json"
    live = load_json(live_p)
    stage = out / "stage"
    shutil.rmtree(stage, ignore_errors=True)
    full, full_msg = gen_build(course_dir, stage / "full", from_index=False)
    chosen, why, src = None, "", ""
    if live is None:
        chosen, why, src = full, "no live index: fresh build", "full"
    else:
        rep.data["course_id"] = live.get("course")
        frm, _ = gen_build(course_dir, stage / "from", from_index=True)
        full_ok = order_check(live, full) if full else "FAIL build failed"
        from_ok = order_check(live, frm) if frm else "FAIL build failed"
        s["order_check"] = {"full": full_ok, "from_index": from_ok}
        if scraper_built(live):
            chosen, why, src = frm, "scraper-written index (urls/descriptions): --from-index refresh", "from"
            if not full_ok.startswith("PASS"):
                s["findings"].append(f"A fresh build would differ ({full_ok}); new files on disk stay out "
                                     "of the index until a positional check passes")
        elif full_ok.startswith("PASS"):
            chosen, why, src = full, "generator-built index and a fresh build keeps every position: fresh build", "full"
        else:
            chosen, why, src = frm, f"fresh build would move lessons ({full_ok}): --from-index refresh", "from"
            s["findings"].append(f"Fresh build changes lesson positions ({full_ok}). Lesson URLs are "
                                 "positional, so new or renamed files are NOT indexed. Decide with the user")
            rep.bump(s, "REPORT")
        if chosen is not None and not order_check(live, chosen).startswith("PASS"):
            s["findings"].append(f"Chosen index fails the order check: {order_check(live, chosen)}")
            rep.bump(s, "FAIL")
            chosen = None
    if chosen is None:
        s["summary"] = f"no installable index ({full_msg})"
        rep.bump(s, "FAIL")
        return live
    rep.data["course_id"] = chosen.get("course")
    dups = new_dups(live, chosen) if live else []
    for d in dups:
        s["findings"].append(f"NEW title collision: {d}")
    if dups:
        rep.bump(s, "FAIL")
        s["summary"] = "new sibling title collisions: not installed"
        return live
    # Show what the install changes.
    if live:
        def names(j):
            out_ = {}
            for ci, c in enumerate(j["categories"]):
                out_[("m", ci)] = c["name"]
                for si, sec in enumerate(c["sections"]):
                    out_[("s", ci, si)] = sec["name"]
                    for li, l in enumerate(sec["lessons"]):
                        out_[("l", ci, si, li)] = l["name"]
            return out_
        a, b = names(live), names(chosen)
        for k in a:
            if k in b and a[k] != b[k]:
                s["findings"].append(f"title: {a[k].splitlines()[0]!r} -> {b[k].splitlines()[0]!r}")
        ra = sorted((x[1], x[0].split()[0]) for x in all_resources(live))
        rb = sorted((x[1], x[0].split()[0]) for x in all_resources(chosen))
        if ra != rb:
            s["findings"].append(f"resources: {len(ra)} entries -> {len(rb)} entries "
                                 f"({len(set(ra))} -> {len(set(rb))} distinct file+level)")
    same = live is not None and json.dumps(live, sort_keys=True) == json.dumps(chosen, sort_keys=True)
    if same:
        s["summary"] = f"{why}; already current, nothing written"
        return live
    if not fix:
        s["summary"] = f"{why}; would install {stage / src / course_dir.name / '_index.json'} (audit-only: not written)"
        if s["findings"]:
            rep.bump(s, "REPORT")
        return live
    ts = time.strftime("%Y%m%d_%H%M%S")
    if live is not None:
        bdir = out / f"backup_{ts}"
        bdir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(live_p, bdir / "_index.json")
        s["actions"].append(f"backed up the previous index to {bdir}/_index.json")
    tmp = live_p.with_name("._index.json.onboard.tmp")
    tmp.write_text(json.dumps(chosen, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, live_p)
    check = load_json(live_p)
    ok = check is not None and (live is None or order_check(live, check).startswith("PASS"))
    if not ok:
        if live is not None:
            shutil.copy2(out / f"backup_{ts}" / "_index.json", live_p)
            s["actions"].append("post-install check failed: ROLLED BACK to the backup")
        rep.bump(s, "FAIL")
        return live
    s["actions"].append(f"installed the new index ({why})")
    s["backup"] = str(out / f"backup_{ts}") if live is not None else None
    rep.bump(s, "FIXED")
    s["summary"] = f"{why}; installed"
    return check


def step_g(rep: Report, course_id: str, fix: bool, app: str) -> None:
    s = rep.step("g", "Cover")
    code, hdr, _ = http(f"{app}/api/courses/{course_id}/cover", read=0)
    s["cover_http_before"] = code
    cmd = [PY, str(COVERS), "--only", course_id]
    if not fix:
        cmd.append("--dry-run")
    r = subprocess.run(cmd, capture_output=True, text=True)
    out = (r.stdout.strip() or r.stderr.strip())[-400:]
    if fix:
        s["actions"].append(f"course_cms_covers.py --only {course_id}: {out}")
    m = (load_json(COVER_MANIFEST) or {}).get(course_id)
    if m:
        t = f" at {m['time']}s" if m.get("time") is not None else ""
        s["chosen"] = m
        s["findings"].append(f"cover source: {m.get('source')} `{m.get('from')}`{t} -> "
                             f"{m.get('width')}x{m.get('height')}, {m.get('bytes')} bytes. Check it by eye; "
                             f"to pin another frame: {shlex.join([PY, str(COVERS), '--only', course_id, '--from', '<lesson path>', '--time', '<seconds>', '--force'])}")
    elif not fix:
        s["findings"].append(f"would generate: {out}")
    code2, hdr2, _ = http(f"{app}/api/courses/{course_id}/cover", read=0)
    s["cover_http_after"] = code2
    s["summary"] = f"cover HTTP {code} before, {code2} now"
    if r.returncode != 0:
        rep.bump(s, "FAIL")
    elif code2 != 200:
        rep.bump(s, "REPORT" if not fix else "FAIL")
    elif fix and code != 200:
        rep.bump(s, "FIXED")


def step_h(rep: Report, course_dir: Path, index: dict | None, app: str, root_in_app: str) -> None:
    s = rep.step("h", "Resources")
    if not index:
        s["status"] = "SKIPPED"
        return
    res = all_resources(index)
    seen = defaultdict(list)
    for level, p, name in res:
        seen[p].append(level)
    for p, levels in seen.items():
        if len(levels) > 1:
            s["findings"].append(f"DUPLICATE resource entry x{len(levels)} ({', '.join(levels[:8])}): `{p}`")
    bad = 0
    for p in tqdm(sorted(seen), desc="resources", unit="file", leave=False):
        url = f"{app}/api/resource{quote_path(root_in_app + '/' + course_dir.name + '/' + p)}"
        code, hdr, _ = http(url, headers={"Range": "bytes=0-0"}, read=1)
        ctype = hdr.get("content-type", "")
        expect = gen_ct(p)
        sensible = ctype.split(";")[0] == expect.split(";")[0] or (expect == "application/octet-stream")
        if code not in (200, 206) or not sensible:
            bad += 1
            s["findings"].append(f"HTTP {code} `{ctype}` (expected {expect}): `{p}`")
    s["summary"] = f"{len(res)} entries, {len(seen)} distinct files, {bad} failing"
    if s["findings"]:
        rep.bump(s, "REPORT" if not bad else "FAIL")


def gen_ct(p: str) -> str:
    table = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
             ".gif": "image/gif", ".webp": "image/webp", ".txt": "text/plain", ".csv": "text/csv",
             ".md": "text/markdown", ".json": "application/json", ".zip": "application/zip",
             ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".docx":
             "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
             ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
             ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}
    return table.get(Path(p).suffix.lower(), "application/octet-stream")


def step_i(rep: Report, course_dir: Path, index: dict | None, app: str, root_in_app: str) -> None:
    s = rep.step("i", "App smoke test")
    if not index:
        s["status"] = "SKIPPED"
        return
    cid = index["course"]
    checks = [(f"/course/{cid}", "course page")]
    for mi, c in enumerate(index["categories"], 1):
        checks.append((f"/course/{cid}/{mi}", f"module {mi}"))
        if any(sec["lessons"] for sec in c["sections"]):
            checks.append((f"/course/{cid}/{mi}/1", f"module {mi} first lesson"))
    fails = 0
    for path, label in tqdm(checks, desc="pages", unit="page", leave=False):
        code, _, _ = http(app + path, read=0, timeout=60)
        if code != 200:
            fails += 1
            s["findings"].append(f"HTTP {code}: {label} {path}")
    # One video Range request.
    c0 = index["categories"][0]
    sec0 = next(sec for sec in c0["sections"] if sec["lessons"])
    l0 = sec0["lessons"][0]
    vpath = "/".join(x for x in (root_in_app.strip("/"), course_dir.name, c0.get("folder", ""),
                                 sec0.get("folder", ""), l0["file"]) if x)
    code, hdr, _ = http(f"{app}/api/video/{quote_path(vpath)}", headers={"Range": "bytes=0-1023"}, read=1024)
    vt = hdr.get("content-type", "")
    expect = gen_ct(l0["file"])
    if code != 206 or vt.split(";")[0] != expect:
        fails += 1
        s["findings"].append(f"video Range request: HTTP {code} `{vt}` (expected 206 {expect})")
    code_c, hdr_c, _ = http(f"{app}/api/courses/{cid}/cover", read=0)
    if code_c != 200 or not hdr_c.get("content-type", "").startswith("image/"):
        fails += 1
        s["findings"].append(f"cover: HTTP {code_c} `{hdr_c.get('content-type', '')}`")
    try:
        with urllib.request.urlopen(f"{app}/api/search?q={urllib.parse.quote(index['title'])}", timeout=60) as r:
            found = any(x.get("courseId") == cid and x.get("kind") == "course" for x in json.loads(r.read()))
    except (OSError, ValueError):
        found = False
    if not found:
        fails += 1
        s["findings"].append(f"/api/search?q={index['title']!r} does not return the course")
    try:
        with urllib.request.urlopen(f"{app}/api/palette", timeout=60) as r:
            pal = json.loads(r.read())
        listed = any(row[0] == cid for row in pal.get("courses", []))
    except (OSError, ValueError, IndexError, TypeError):
        listed = False
    if not listed:
        fails += 1
        s["findings"].append("/api/palette does not list the course")
    s["summary"] = (f"{len(checks)} pages, video 206 {'ok' if code == 206 else 'FAIL'}, cover {code_c}, "
                    f"search {'found' if found else 'MISSING'}, palette {'listed' if listed else 'MISSING'}; "
                    f"{fails} failing")
    if fails:
        rep.bump(s, "FAIL")


# ------------------------------------------------------------------ main

def main() -> int:
    ap = argparse.ArgumentParser(description="Onboard a new course folder into course-cms")
    ap.add_argument("course")
    ap.add_argument("--audit-only", action="store_true")
    ap.add_argument("--yes", action="store_true")
    ap.add_argument("--root", default=str(DEFAULT_ROOT))
    ap.add_argument("--app-url", default=DEFAULT_APP)
    ap.add_argument("--settle-secs", type=int, default=60)
    ap.add_argument("--bitrate-mbps", type=float, default=6.0)
    ap.add_argument("--tools-dir", default=str(TOOLS_DIR),
                    help="dir holding course_cms_build_index.py etc. (env COURSE_TOOLS_DIR)")
    ap.add_argument("--tools-python", default=TOOLS_PY,
                    help="python that runs the helper scripts (env COURSE_TOOLS_PYTHON)")
    ap.add_argument("--out-root", default=str(OUT_ROOT),
                    help="report root, writes <out-root>/<course folder>/ (env COURSE_ONBOARD_OUT)")
    args = ap.parse_args()
    args.app_url = args.app_url.rstrip("/")

    cp = Path(args.course)
    course_dir = cp if cp.is_absolute() else Path(args.root) / args.course
    course_dir = Path(str(course_dir).rstrip("/"))
    if not course_dir.is_dir():
        raise SystemExit(f"Not a directory: {course_dir}")
    for tool in ("ffmpeg", "ffprobe"):
        if shutil.which(tool) is None:
            raise SystemExit(f"{tool} not found on PATH")
    out = Path(args.out_root) / course_dir.name
    out.mkdir(parents=True, exist_ok=True)
    rep = Report(course_dir.name, out, args.audit_only)
    live = load_json(course_dir / "_index.json")
    if live:
        rep.data["course_id"] = live.get("course")

    # The app serves files by their path inside its container (COURSES_PATH),
    # which the palette reports as "root".
    root_in_app = "/courses"
    try:
        with urllib.request.urlopen(f"{args.app_url}/api/palette", timeout=60) as r:
            root_in_app = json.loads(r.read()).get("root") or root_in_app
    except (OSError, ValueError):
        pass

    try:
        settled = step_a(rep, course_dir, args.settle_secs)
        rep.save()
        log("   probing videos")
        probes = step_c_probe(course_dir)
        step_b(rep, course_dir, probes)
        rep.save()
        ts_files = step_c(rep, course_dir, probes, args)
        step_d(rep, course_dir, probes, args.bitrate_mbps)
        rep.save()

        fix = not args.audit_only
        if fix and not settled:
            log("!! download not settled: every fix is skipped, rerun once it finishes")
            rep.data["fixes_blocked"] = "download not settled (step a)"
            fix = False
        if fix and not args.yes:
            if sys.stdin.isatty():
                ans = input("Apply the safe fixes (remux, index, cover)? [y/N] ").strip().lower()
                fix = ans in ("y", "yes")
            else:
                log("!! not a terminal and no --yes: running as audit-only")
                fix = False
            if not fix:
                rep.data["mode"] = "audit-only (fixes declined)"

        step_e(rep, course_dir, ts_files, fix, out, args.app_url)
        rep.save()
        index = step_f(rep, course_dir, fix, out)
        rep.save()
        cid = rep.data.get("course_id") or (index or {}).get("course")
        if cid:
            step_g(rep, cid, fix, args.app_url)
        rep.save()
        step_h(rep, course_dir, index, args.app_url, root_in_app)
        step_i(rep, course_dir, index, args.app_url, root_in_app)
    finally:
        rep.save()
    worst = max((STATUS_RANK[s["status"]] for s in rep.data["steps"].values()), default=0)
    print(f"\nREPORT: {out / 'REPORT.md'}")
    for k, s in rep.data["steps"].items():
        print(f"  {k}. {s['title']:<42} {s['status']:<8} {s.get('summary', '')[:110]}")
    return 1 if worst >= STATUS_RANK["FAIL"] else 0


if __name__ == "__main__":
    sys.exit(main())
