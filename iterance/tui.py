#!/usr/bin/env python3
"""Iterance TUI — Textual dashboard for the behavioral witness layer."""

import asyncio
import os
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from iterance.common import (
    LEDGER_DIR,
    TRUST_FILE,
    load_trust,
    save_trust,
    load_entries_from_file,
)

from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.containers import Container, Horizontal, ScrollableContainer, Vertical
from textual.screen import ModalScreen
from textual.widgets import Button, Footer, Input, RichLog, Static

# ─────────────────────────────────────── constants ──────────────────────────────────────

ITERANCE_DIR = Path.home() / ".iterance"
PID_FILE     = ITERANCE_DIR / "watch.pid"
DIR_FILE     = ITERANCE_DIR / "watch.dir"
START_FILE   = ITERANCE_DIR / "watch.start"
COUNT_FILE   = ITERANCE_DIR / "watch.count0"
CLI_PATH     = Path(__file__).resolve().parent / "cli.py"
PYTHON       = sys.executable

ACTION_COLORS = {
    "created":       "#00ff88",
    "modified":      "#ffaa00",
    "deleted":       "#ff4444",
    "moved":         "#44aaff",
    "watcher_died":  "#ff44ff",
    "loop_detected": "#ff8800",   # orange warning
}

# ─────────────────────────────────────── helpers ────────────────────────────────────────

def _truncate_path(path: str, maxlen: int = 45) -> str:
    if not path:
        return ""
    return ("..." + path[-(maxlen - 3):]) if len(path) > maxlen else path


def _trust_bar(pct: int, width: int = 14) -> str:
    filled = max(0, min(width, round(pct / 100 * width)))
    return "█" * filled + "░" * (width - filled)


def _entry_key(e: dict) -> tuple:
    return (e.get("timestamp", ""), e.get("path", ""))


def _load_all_entries() -> list:
    if not LEDGER_DIR.exists():
        return []
    entries = []
    for md_file in sorted(LEDGER_DIR.glob("*.md")):
        entries.extend(load_entries_from_file(md_file))
    return [e for e in entries if not e.get("watcher_died")]


def _load_today_entries() -> tuple:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if LEDGER_DIR.exists():
        md_file = LEDGER_DIR / f"{today}.md"
        if md_file.exists():
            entries = [e for e in load_entries_from_file(md_file) if not e.get("watcher_died")]
            if entries:
                return today, entries
        candidates = sorted(LEDGER_DIR.glob("*.md"))
        if candidates:
            recent = candidates[-1]
            return recent.stem, [e for e in load_entries_from_file(recent) if not e.get("watcher_died")]
    return today, []


def _get_session_info() -> dict:
    if not PID_FILE.exists():
        return {"active": False}
    try:
        pids = [int(l) for l in PID_FILE.read_text().splitlines() if l.strip().isdigit()]
    except (OSError, ValueError):
        return {"active": False}
    alive = False
    for pid in pids:
        try:
            os.kill(pid, 0)
            alive = True
            break
        except (ProcessLookupError, PermissionError):
            pass
    if not alive:
        return {"active": False}
    watch_dir = DIR_FILE.read_text().strip() if DIR_FILE.exists() else "unknown"
    elapsed = "?"
    if START_FILE.exists():
        try:
            secs = datetime.now(timezone.utc).timestamp() - float(START_FILE.read_text().strip())
            if secs < 60:
                elapsed = f"{int(secs)}s"
            elif secs < 3600:
                elapsed = f"{int(secs // 60)}m"
            else:
                elapsed = f"{int(secs // 3600)}h{int((secs % 3600) // 60)}m"
        except (ValueError, OSError):
            pass
    entry_count = "?"
    density_str = ""
    if COUNT_FILE.exists():
        try:
            trust_total = load_trust()["total"]
            entries_since = max(0, trust_total - int(COUNT_FILE.read_text().strip()))
            entry_count = str(entries_since)
            if START_FILE.exists():
                elapsed_s = datetime.now(timezone.utc).timestamp() - float(START_FILE.read_text().strip())
                elapsed_min = max(0.001, elapsed_s / 60.0)
                density = entries_since / elapsed_min
                density_str = f"{density:.1f}/min"
        except (ValueError, OSError):
            pass
    return {"active": True, "dir": watch_dir, "elapsed": elapsed,
            "count": entry_count, "density": density_str}


def _generate_says(entries: list, trust: dict) -> str:
    if not entries:
        return "No activity recorded today."
    counts    = Counter(e.get("action") for e in entries if e.get("action"))
    autonomous = sum(1 for e in entries if e.get("initiated") == "autonomous")
    user_init  = sum(1 for e in entries if e.get("initiated") == "by user")
    score_pct  = int(trust["score"] * 100)
    total_all  = trust["total"]
    overrides  = trust["overrides"]
    n          = len(entries)
    summary    = ", ".join(f"{v} {k}" for k, v in counts.most_common())
    s1 = f"The agent performed {n} action{'s' if n != 1 else ''} today: {summary}."
    if autonomous and user_init:
        s2 = f"{autonomous} autonomous, {user_init} user-initiated."
    elif autonomous:
        s2 = "All autonomous — none sanctioned by the user."
    else:
        s2 = "All user-initiated."
    if overrides == 0:
        s3 = f"Trust is {score_pct}% across {total_all} total with no overrides."
    else:
        s3 = f"Trust is {score_pct}% with {overrides} override{'s' if overrides != 1 else ''} out of {total_all} total."
    return f"{s1} {s2} {s3}"


def _format_live_line(e: dict) -> str:
    ts     = e.get("timestamp", "")[-8:] if e.get("timestamp") else "        "
    action = e.get("action") or ""
    color  = ACTION_COLORS.get(action, "#ffffff")
    path   = _truncate_path(e.get("path") or "")
    return f"[dim]{ts}[/dim]  [{color}]●[/] [{color}]{action:<8}[/]  {path}"


def _mark_override_in_file(md_file: Path, entry: dict) -> bool:
    text   = md_file.read_text()
    lines  = text.splitlines()
    target = f"[{entry['timestamp']}]"
    result = []
    i      = 0
    found  = False
    while i < len(lines):
        result.append(lines[i])
        if lines[i] == target and not found:
            i += 1
            while i < len(lines) and lines[i] != "":
                result.append(lines[i])
                i += 1
            result.append("[OVERRIDE] marked by user")
            found = True
            continue
        i += 1
    if not found:
        return False
    md_file.write_text("\n".join(result) + "\n")
    return True


# ─────────────────────────────────────── override modal ─────────────────────────────────

class OverrideModal(ModalScreen):

    CSS = """
    OverrideModal {
        align: center middle;
    }
    #modal-box {
        width: 74;
        height: auto;
        max-height: 36;
        background: #111111;
        border: solid #00b5ad;
        padding: 1 2;
    }
    #modal-title {
        text-align: center;
        color: #00b5ad;
        text-style: bold;
        padding-bottom: 1;
    }
    #modal-scroll {
        height: auto;
        max-height: 20;
        overflow-y: auto;
    }
    #modal-body {
        color: #ffffff;
    }
    #modal-prompt {
        color: #666666;
        padding-top: 1;
        padding-bottom: 1;
    }
    #modal-input {
        height: 1;
        border: solid #333333;
        background: #0d0d0d;
        color: #ffffff;
        margin-bottom: 1;
    }
    #modal-btns Button {
        margin-right: 1;
    }
    """

    def __init__(self, md_file: Path, entries: list):
        super().__init__()
        self._md_file  = md_file
        self._entries  = entries[-10:]
        self._step     = "list"
        self._selected = None

    def compose(self) -> ComposeResult:
        with Vertical(id="modal-box"):
            yield Static("OVERRIDE", id="modal-title")
            with ScrollableContainer(id="modal-scroll"):
                yield Static("", id="modal-body")
            yield Static("", id="modal-prompt")
            yield Input(id="modal-input")
            with Horizontal(id="modal-btns"):
                yield Button("Quit [q]",           id="btn-quit",    variant="default")
                yield Button("Back [n]",           id="btn-back",    variant="default")
                yield Button("Mark Override [y]",  id="btn-confirm", variant="error")

    def on_mount(self) -> None:
        self._show_list()

    def _show_list(self) -> None:
        self._step = "list"
        self._selected = None
        lines = []
        for i, e in enumerate(self._entries, 1):
            color = ACTION_COLORS.get(e.get("action", ""), "#ffffff")
            path  = _truncate_path(e.get("path") or "", 48)
            lines.append(
                f"  [bold]{i:2}.[/bold]  {e['timestamp']}  [{color}]{e.get('action', ''):<8}[/]  {path}"
            )
        self.query_one("#modal-body",   Static).update("\n".join(lines))
        self.query_one("#modal-prompt", Static).update(
            f"Enter number to inspect · [bold]q[/bold] to quit"
        )
        self.query_one("#btn-back",    Button).display = False
        self.query_one("#btn-confirm", Button).display = False
        inp             = self.query_one("#modal-input", Input)
        inp.value       = ""
        inp.placeholder = f"1–{len(self._entries)} or q"
        inp.focus()

    def _show_inspect(self, entry: dict) -> None:
        self._step     = "inspect"
        self._selected = entry
        trust          = load_trust()
        score_pct      = int(trust["score"] * 100)
        sep            = "[dim]" + "─" * 44 + "[/dim]"
        lines = [
            sep,
            f"  WHEN       {entry.get('timestamp', '')}",
            f"  ACTION     {entry.get('action', '')}",
            f"  PATH       {entry.get('path') or ''}",
            f"  INITIATED  {entry.get('initiated') or 'unknown'}",
            sep,
            f"  TRUST      {score_pct}%  ·  {trust['total']} actions  ·  {trust['overrides']} overrides",
            sep,
        ]
        self.query_one("#modal-body",   Static).update("\n".join(lines))
        self.query_one("#modal-prompt", Static).update(
            "[bold]y[/bold] mark override  ·  [bold]n[/bold] back to list  ·  [bold]q[/bold] quit"
        )
        self.query_one("#btn-back",    Button).display = True
        self.query_one("#btn-confirm", Button).display = True
        inp             = self.query_one("#modal-input", Input)
        inp.value       = ""
        inp.placeholder = "y / n / q"
        inp.focus()

    def on_input_submitted(self, event: Input.Submitted) -> None:
        val = event.value.strip().lower()
        event.input.value = ""
        if self._step == "list":
            if val in ("q", ""):
                self.dismiss(None)
                return
            try:
                idx = int(val)
                if 1 <= idx <= len(self._entries):
                    self._show_inspect(self._entries[idx - 1])
            except ValueError:
                pass
        else:
            if val == "q":
                self.dismiss(None)
            elif val == "n":
                self._show_list()
            elif val == "y" and self._selected:
                self.dismiss(self._selected)

    def on_button_pressed(self, event: Button.Pressed) -> None:
        btn = event.button.id
        if btn == "btn-quit":
            self.dismiss(None)
        elif btn == "btn-back":
            self._show_list()
        elif btn == "btn-confirm" and self._selected:
            self.dismiss(self._selected)

    def on_key(self, event) -> None:
        if event.key == "escape":
            self.dismiss(None)


# ─────────────────────────────────────── reset modal ────────────────────────────────────

class ResetModal(ModalScreen):

    CSS = """
    ResetModal {
        align: center middle;
    }
    #reset-box {
        width: 56;
        height: auto;
        background: #111111;
        border: solid #ff4444;
        padding: 1 2;
    }
    #reset-title {
        text-align: center;
        text-style: bold;
        color: #ff4444;
        padding-bottom: 1;
    }
    #reset-body {
        color: #aaaaaa;
        padding-bottom: 1;
    }
    #reset-btns Button {
        margin-right: 1;
    }
    """

    def compose(self) -> ComposeResult:
        with Vertical(id="reset-box"):
            yield Static("⚠  RESET", id="reset-title")
            yield Static(
                "Delete all ledger data, trust score, and session files.\n"
                "ignore.conf will be preserved.\n"
                "This cannot be undone.",
                id="reset-body",
            )
            with Horizontal(id="reset-btns"):
                yield Button("Cancel",          id="btn-cancel",  variant="default")
                yield Button("YES, DELETE ALL", id="btn-confirm", variant="error")

    def on_button_pressed(self, event: Button.Pressed) -> None:
        self.dismiss(event.button.id == "btn-confirm")

    def on_key(self, event) -> None:
        if event.key == "escape":
            self.dismiss(False)


# ─────────────────────────────────────── splash screen ──────────────────────────────────

class SplashScreen(ModalScreen):
    """Full-screen startup splash. Dismisses after 2 seconds or on any keypress."""

    SPLASH_LOGO = (
        "██╗████████╗███████╗██████╗  █████╗ ███╗  ██╗ ██████╗███████╗\n"
        "██║╚══██╔══╝██╔════╝██╔══██╗██╔══██╗████╗ ██║██╔════╝██╔════╝\n"
        "██║   ██║   █████╗  ██████╔╝███████║██╔██╗██║██║     █████╗  \n"
        "██║   ██║   ██╔══╝  ██╔══██╗██╔══██║██║╚████║██║     ██╔══╝  \n"
        "██║   ██║   ███████╗██║  ██║██║  ██║██║ ╚███║╚██████╗███████╗\n"
        "╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚══╝ ╚═════╝╚══════╝"
    )

    CSS = """
    SplashScreen {
        background: #0d0d0d;
        align: center middle;
    }
    #splash-inner {
        width: 100%;
        height: auto;
        align: center middle;
    }
    #splash-logo {
        width: 100%;
        color: #00b5ad;
        text-align: center;
        text-style: bold;
        padding-bottom: 1;
    }
    #splash-tagline {
        width: 100%;
        color: #4a4a4a;
        text-align: center;
        padding-bottom: 1;
    }
    #splash-trust {
        width: 100%;
        text-align: center;
        padding-bottom: 2;
    }
    #splash-hint {
        width: 100%;
        color: #333333;
        text-align: center;
    }
    """

    def compose(self) -> ComposeResult:
        trust     = load_trust()
        score_pct = int(trust["score"] * 100)
        bar       = _trust_bar(score_pct, width=20)

        with Vertical(id="splash-inner"):
            yield Static(self.SPLASH_LOGO, id="splash-logo")
            yield Static(
                "That which time makes visible through accumulated behavior.",
                id="splash-tagline",
            )
            yield Static(
                f"[#00b5ad]{bar}[/]  [bold]{score_pct}%[/bold]"
                f"  ·  {trust['total']} action{'s' if trust['total'] != 1 else ''}",
                id="splash-trust",
            )
            yield Static("[dim]Press any key to begin[/dim]", id="splash-hint")

    def on_mount(self) -> None:
        self._timer = self.set_timer(2.0, self._do_dismiss)

    def _do_dismiss(self) -> None:
        self.dismiss()

    def on_key(self, event) -> None:
        self._timer.stop()
        self.dismiss()
        event.stop()


# ─────────────────────────────────────── main TUI ───────────────────────────────────────

class IteranceTUI(App):

    LOGO_LARGE = (
        "██╗████████╗███████╗██████╗  █████╗ ███╗  ██╗ ██████╗███████╗\n"
        "██║╚══██╔══╝██╔════╝██╔══██╗██╔══██╗████╗ ██║██╔════╝██╔════╝\n"
        "██║   ██║   █████╗  ██████╔╝███████║██╔██╗██║██║     █████╗  \n"
        "██║   ██║   ██╔══╝  ██╔══██╗██╔══██║██║╚████║██║     ██╔══╝  \n"
        "██║   ██║   ███████╗██║  ██║██║  ██║██║ ╚███║╚██████╗███████╗\n"
        "╚═╝   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚══╝ ╚═════╝╚══════╝\n"
    )  # 7 lines: 6 content + 1 blank separator

    LOGO_MEDIUM = (
        "  ┬ ┌┬┐ ┌─┐ ┬─┐ ┌─┐ ┌┐┌ ┌─┐ ┌─┐\n"
        "  │  │  ├┤  ├┬┘ ├─┤ │││ │   ├┤ \n"
        "  ┴  ┴  └─┘ ┴└─ ┴ ┴ ┘└┘ └─┘ └─┘\n"
    )  # 4 lines: 3 content + 1 blank separator

    LOGO_SMALL = "ITΞRΛNCΞ\n"  # 2 lines: 1 content + 1 blank separator


    CSS = """
    Screen {
        background: #0d0d0d;
        layers: base modal;
    }

    #iterance-logo {
        dock: top;
        color: #00b5ad;
        text-align: center;
        padding-top: 2;
    }

    /* ── header ─────────────────────────────────────────────── */
    #header-bar {
        dock: top;
        height: 1;
        background: #00b5ad;
        color: #ffffff;
        padding: 0 1;
        content-align: left middle;
    }

    /* ── main panel area ─────────────────────────────────────── */
    #main-panels {
        height: 1fr;
        overflow-y: auto;
        background: #0d0d0d;
    }

    .panel {
        height: auto;
        min-height: 1;
    }

    .panel-header {
        height: 1;
        background: #1a1a1a;
        color: #cccccc;
        padding: 0 1;
        content-align: left middle;
    }

    /* ── live feed ───────────────────────────────────────────── */
    #live-content {
        height: 12;
        background: #0d0d0d;
        padding: 0 1;
        overflow-y: auto;
    }
    #live-log {
        background: #0d0d0d;
        color: #ffffff;
    }

    /* ── iterance says ───────────────────────────────────────── */
    #says-content {
        height: 8;
        background: #0d0d0d;
        padding: 0 1;
        overflow-y: auto;
    }
    #says-body {
        color: #ffffff;
    }

    /* ── output ──────────────────────────────────────────────── */
    #panel-output {
        height: 1fr;
    }
    #output-content {
        height: 1fr;
        background: #0d0d0d;
        padding: 0 1;
        overflow-y: auto;
    }
    #output-body {
        color: #cccccc;
    }

    /* ── command bar ─────────────────────────────────────────── */
    #cmd-container {
        dock: bottom;
        height: 3;
        background: #111111;
        border-top: tall #00b5ad;
        align: left middle;
        padding: 0 1;
    }
    #cmd-label {
        width: 2;
        color: #00b5ad;
        content-align: left middle;
    }
    #cmd-input {
        width: 1fr;
        height: 1;
        border: none;
        background: #111111;
        color: #ffffff;
        padding: 0;
    }

    /* ── footer ──────────────────────────────────────────────── */
    Footer {
        background: #111111;
        color: #555555;
        height: 1;
    }
    Footer > .footer--highlight {
        background: #111111;
        color: #00b5ad;
    }
    Footer > .footer--key {
        background: #1a1a1a;
        color: #00b5ad;
    }
    Footer > .footer--description {
        color: #888888;
    }
    """

    BINDINGS = [
        Binding("1",             "panel_live",   "Live Feed",     show=True),
        Binding("2",             "panel_says",   "ITΞRΛNCΞ SAYS", show=True),
        Binding("3",             "panel_output", "Output",        show=True),
        Binding("w",             "focus_watch",  "Watch",         show=True),
        Binding("s",             "run_stop",     "Stop",          show=True),
        Binding("r",             "run_refresh",  "Refresh",       show=True),
        Binding("o",             "run_override", "Override",      show=True),
        Binding("question_mark", "run_help",     "Help",          show=True),
        Binding("q",             "quit",         "Quit",          show=True),
    ]

    # ── compose ──────────────────────────────────────────────────────────────

    def compose(self) -> ComposeResult:
        yield Static("", id="iterance-logo")
        yield Static("", id="header-bar")

        with Vertical(id="main-panels"):
            # Panel 1: Live Feed
            with Vertical(id="panel-live", classes="panel"):
                yield Static("", id="live-header", classes="panel-header")
                with Container(id="live-content"):
                    yield RichLog(id="live-log", highlight=False, markup=True, auto_scroll=True)

            # Panel 2: ITERANCE SAYS
            with Vertical(id="panel-says", classes="panel"):
                yield Static("", id="says-header", classes="panel-header")
                with ScrollableContainer(id="says-content"):
                    yield Static("", id="says-body")

            # Panel 3: OUTPUT (hidden until first command)
            with Vertical(id="panel-output", classes="panel"):
                yield Static("", id="output-header", classes="panel-header")
                with ScrollableContainer(id="output-content"):
                    yield Static("", id="output-body")

        with Horizontal(id="cmd-container"):
            yield Static(">", id="cmd-label")
            yield Input(
                placeholder="watch /path  ·  log  ·  trust  ·  stop  ·  report  ·  reflect …",
                id="cmd-input",
            )

        yield Footer()

    # ── lifecycle ─────────────────────────────────────────────────────────────

    def on_mount(self) -> None:
        self._update_logo() # Set initial logo

        # panel state
        self._live_collapsed   = False
        self._says_collapsed   = False
        self._output_visible   = False
        self._output_collapsed = False

        # live feed tracking
        self._known_keys: set  = set()
        self._live_count: int  = 0
        self._last_ts: str     = ""
        self._last_action: str = ""
        self._last_fname: str  = ""

        # output tracking
        self._last_cmd: str    = ""

        # hide output panel until first command runs
        self.query_one("#panel-output").display = False

        # initial renders
        self._refresh_header()
        self._refresh_live_feed()
        self._refresh_says()
        self._update_live_header()
        self._update_says_header()
        self._update_output_header()

        # polling timers
        self.set_interval(2.0, self._refresh_live_feed)
        self.set_interval(5.0, self._refresh_says)
        self.set_interval(3.0, self._refresh_header)

        # clean SIGTERM handler so the process exits via self.exit() not mid-render kill
        import signal
        signal.signal(signal.SIGTERM, lambda s, f: self.exit())

        # start with cursor in command input
        self.query_one("#cmd-input", Input).focus()

        # Splash screen over the initialized main TUI
        self.push_screen(SplashScreen())

    def on_resize(self) -> None:
        self._update_logo()

    def _update_logo(self) -> None:
        width  = self.app.size.width
        height = self.app.size.height
        logo   = self.query_one("#iterance-logo", Static)

        # Heights include the trailing blank separator line embedded in each string.
        if width >= 64 and height > 10:
            logo.update(self.LOGO_LARGE)
            logo.styles.height = 7   # 6 content lines + 1 blank
        elif width >= 38 and height > 6:
            logo.update(self.LOGO_MEDIUM)
            logo.styles.height = 4   # 3 content lines + 1 blank
        else:
            logo.update(self.LOGO_SMALL)
            logo.styles.height = 2   # 1 content line + 1 blank

    # ── timer callbacks ───────────────────────────────────────────────────────

    def _refresh_header(self) -> None:
        trust     = load_trust()
        score_pct = int(trust["score"] * 100)
        session   = _get_session_info()
        if session["active"]:
            indicator = "[#00ff00]◉[/]" # Bright green
            location  = session["dir"]
        else:
            indicator = "[#00b5ad]◈[/]" # Teal
            location  = "idle"
        self.query_one("#header-bar", Static).update(
            f" ITΞRΛNCΞ   {indicator} {location}   trust {score_pct}%"
        )

    def _refresh_live_feed(self) -> None:
        all_entries = _load_all_entries()
        new = [e for e in all_entries if _entry_key(e) not in self._known_keys]

        if new:
            log = self.query_one("#live-log", RichLog)
            for e in new:
                self._known_keys.add(_entry_key(e))
                log.write(_format_live_line(e))
            self._live_count = len(self._known_keys)
            last = all_entries[-1]
            ts   = last.get("timestamp", "")
            self._last_ts     = ts[-8:] if ts else ""
            self._last_action = last.get("action") or ""
            self._last_fname  = Path(last.get("path") or "").name

        self._update_live_header()

    def _refresh_says(self) -> None:
        trust     = load_trust()
        score_pct = int(trust["score"] * 100)
        _date, entries = _load_today_entries()
        session   = _get_session_info()

        says_text = _generate_says(entries, trust)
        bar       = _trust_bar(score_pct)

        if session["active"]:
            density_part = f" · {session['density']}" if session.get("density") else ""
            session_line = (
                f"◉ watching {session['dir']}"
                f" · {session['elapsed']} ago"
                f" · {session['count']} this session"
                f"{density_part}"
            )
        else:
            session_line = "○ idle"

        says_lines = says_text.splitlines()
        says_formatted = "\n".join(
            [f"  [#00b5ad]▎[/] [italic #cccccc]{line}[/italic #cccccc]" for line in says_lines]
        )

        markup = (
            f"[#00b5ad]{bar}[/]  [bold]{score_pct}%[/bold]"
            f"  ·  {trust['total']} action{'s' if trust['total'] != 1 else ''}"
            f"  ·  {trust['overrides']} override{'s' if trust['overrides'] != 1 else ''}\n"
            f"[dim]{session_line}[/dim]\n"
            f"[dim]────────────────────────────[/dim]\n"
            f"{says_formatted}"
        )
        self.query_one("#says-body", Static).update(markup)
        self._update_says_header()

    # ── panel header text ─────────────────────────────────────────────────────

    def _update_live_header(self) -> None:
        hdr = self.query_one("#live-header", Static)
        if self._live_collapsed:
            last = (
                f"last: {self._last_ts} {self._last_action} {self._last_fname}"
                if self._last_ts else "no entries"
            )
            hdr.update(
                f"━━ LIVE FEED · {self._live_count} entries · {last} ━━  [dim][1 to expand][/dim]"
            )
        else:
            hdr.update(f"[bold]━━ LIVE FEED[/bold]  [dim][1 to collapse][/dim]")

    def _update_says_header(self) -> None:
        trust     = load_trust()
        score_pct = int(trust["score"] * 100)
        hdr       = self.query_one("#says-header", Static)
        if self._says_collapsed:
            hdr.update(
                f"━━ ITΞRΛNCΞ SAYS · trust {score_pct}% · {trust['total']} actions ━━"
                f"  [dim][2 to expand][/dim]"
            )
        else:
            hdr.update(f"[bold]━━ ITΞRΛNCΞ SAYS[/bold]  [dim][2 to collapse][/dim]")

    def _update_output_header(self) -> None:
        hdr = self.query_one("#output-header", Static)
        if not self._output_visible:
            hdr.update(f"[bold]━━ OUTPUT[/bold]  [dim][3 toggle][/dim]")
        elif self._output_collapsed:
            hdr.update(
                f"━━ OUTPUT · last: [bold]{self._last_cmd}[/bold] ━━  [dim][3 to expand][/dim]"
            )
        else:
            hdr.update(
                f"[bold]━━ OUTPUT · {self._last_cmd}[/bold]  [dim][3 to collapse][/dim]"
            )

    # ── panel toggle actions ──────────────────────────────────────────────────

    def action_panel_live(self) -> None:
        self._live_collapsed = not self._live_collapsed
        self.query_one("#live-content").display = not self._live_collapsed
        self._update_live_header()

    def action_panel_says(self) -> None:
        self._says_collapsed = not self._says_collapsed
        self.query_one("#says-content").display = not self._says_collapsed
        self._update_says_header()

    def action_panel_output(self) -> None:
        if not self._output_visible:
            return
        self._output_collapsed = not self._output_collapsed
        self.query_one("#output-content").display = not self._output_collapsed
        self._update_output_header()

    # ── shortcut actions ──────────────────────────────────────────────────────

    def action_focus_watch(self) -> None:
        inp = self.query_one("#cmd-input", Input)
        inp.value           = "watch "
        inp.cursor_position = len(inp.value)
        inp.focus()

    def action_run_stop(self) -> None:
        self._dispatch_command("stop")

    def action_run_refresh(self) -> None:
        self._known_keys.clear()
        self.query_one("#live-log", RichLog).clear()
        self._live_count = 0
        self._refresh_header()
        self._refresh_live_feed()
        self._refresh_says()

    def action_run_override(self) -> None:
        self._do_override()

    def action_run_help(self) -> None:
        self._dispatch_command("howto")

    # ── command input ─────────────────────────────────────────────────────────

    def on_input_submitted(self, event: Input.Submitted) -> None:
        if event.input.id != "cmd-input":
            return
        cmd_line = event.value.strip()
        event.input.value = ""
        if cmd_line:
            self._dispatch_command(cmd_line)

    def _dispatch_command(self, cmd_line: str) -> None:
        parts = cmd_line.strip().split()
        if not parts:
            return
        cmd = parts[0].lower()

        if cmd == "override":
            self._do_override()
            return
        if cmd == "reset":
            self._do_reset()
            return
        if cmd == "watch" and "--background" not in parts:
            parts.append("--background")

        asyncio.create_task(self._exec_cli_async(parts))

    async def _exec_cli_async(self, parts: list) -> None:
        cmd = parts[0] if parts else ""
        try:
            proc = await asyncio.create_subprocess_exec(
                PYTHON, str(CLI_PATH), *parts,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
            output = (stdout.decode() + stderr.decode()).strip()
        except asyncio.TimeoutError:
            output = "Command timed out (30s)."
        except Exception as exc:
            output = f"Error: {exc}"

        self._show_output(cmd, output)
        if cmd in ("watch", "stop", "reset", "reflect"):
            self._refresh_header()
            self._refresh_says()

    def _show_output(self, cmd: str, output: str) -> None:
        self._last_cmd        = cmd
        self._output_visible  = True
        self._output_collapsed = False

        self.query_one("#panel-output").display  = True
        self.query_one("#output-content").display = True
        self.query_one("#output-body", Static).update(output or "(no output)")
        self._update_output_header()

    # ── override ──────────────────────────────────────────────────────────────

    def _do_override(self) -> None:
        if not LEDGER_DIR.exists():
            self._show_output("override", "No ledger entries found.")
            return
        md_file = None
        entries = []
        for f in reversed(sorted(LEDGER_DIR.glob("*.md"))):
            all_e = [e for e in load_entries_from_file(f) if not e.get("watcher_died")]
            if all_e:
                md_file = f
                entries = all_e
                break
        if not entries:
            self._show_output("override", "No entries to override.")
            return

        def _on_result(entry) -> None:
            if entry is None:
                return
            if not _mark_override_in_file(md_file, entry):
                self._show_output("override", "Could not locate entry in ledger file.")
                return
            subprocess.run(
                ["git", "add", md_file.name], cwd=LEDGER_DIR, capture_output=True
            )
            subprocess.run(
                ["git", "commit", "-m", f"override marked: {entry.get('timestamp', '')}"],
                cwd=LEDGER_DIR, capture_output=True,
            )
            trust  = load_trust()
            new_ov = trust["overrides"] + 1
            save_trust(trust["total"], new_ov)
            new_pct = (
                int(((trust["total"] - new_ov) / trust["total"]) * 100)
                if trust["total"] else 100
            )
            self._show_output(
                "override",
                f"Marked as override: {entry.get('action', '')} {entry.get('path') or ''}\n"
                f"Trust updated: {new_pct}%  ·  {new_ov} override{'s' if new_ov != 1 else ''}",
            )
            self._refresh_says()
            self._refresh_header()

        self.push_screen(OverrideModal(md_file, entries), _on_result)

    # ── reset ─────────────────────────────────────────────────────────────────

    def _do_reset(self) -> None:
        def _on_result(confirmed: bool) -> None:
            if not confirmed:
                return
            try:
                result = subprocess.run(
                    [PYTHON, str(CLI_PATH), "reset"],
                    input="YES\n",
                    capture_output=True, text=True, timeout=15,
                )
                output = (result.stdout + result.stderr).strip()
            except Exception as exc:
                output = f"Error during reset: {exc}"
            self._show_output("reset", output)
            self._known_keys.clear()
            self.query_one("#live-log", RichLog).clear()
            self._live_count  = 0
            self._last_ts     = ""
            self._last_action = ""
            self._last_fname  = ""
            self._refresh_header()
            self._refresh_says()
            self._update_live_header()

        self.push_screen(ResetModal(), _on_result)


# ─────────────────────────────────────── entry point ────────────────────────────────────

def run_tui() -> None:
    IteranceTUI().run()


if __name__ == "__main__":
    run_tui()
