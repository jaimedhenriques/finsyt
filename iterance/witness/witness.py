#!/usr/bin/env python3
"""The Witness -- Component 4 of Iterance.

Reads the ledger and trust data, then prints a terminal report
answering the five questions.
"""

import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from iterance.common import LEDGER_DIR, load_trust, load_entries_from_file

BORDER = "━" * 40


def load_today_entries():
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    md_file = LEDGER_DIR / f"{today}.md"

    if md_file.exists():
        entries = load_entries_from_file(md_file)
        if entries:
            return today, entries

    # Fall back to the most recent file that exists
    candidates = sorted(LEDGER_DIR.glob("*.md"))
    if candidates:
        most_recent = candidates[-1]
        date_str = most_recent.stem
        return date_str, load_entries_from_file(most_recent)

    return today, []


def wrap(text, width=36):
    words = text.split()
    lines = []
    current = []
    length = 0
    for word in words:
        if length + len(word) + (1 if current else 0) > width:
            lines.append(" ".join(current))
            current = [word]
            length = len(word)
        else:
            if current:
                length += 1
            current.append(word)
            length += len(word)
    if current:
        lines.append(" ".join(current))
    return lines


def generate_says(entries, trust):
    normal = [e for e in entries if not e["watcher_died"]]
    total_today = len(normal)

    if total_today == 0:
        return "No activity recorded today. The watcher has not observed any filesystem events."

    counts = Counter(e["action"] for e in normal if e["action"])
    autonomous = sum(1 for e in normal if e.get("initiated") == "autonomous")
    user_initiated = sum(1 for e in normal if e.get("initiated") == "by user")
    overrides = trust["overrides"]
    total_all = trust["total"]
    score_pct = int(trust["score"] * 100)

    action_summary = ", ".join(f"{v} {k}" for k, v in counts.most_common())
    s1 = f"The agent performed {total_today} action{'s' if total_today != 1 else ''} today: {action_summary}."

    if autonomous and user_initiated:
        s2 = f"{autonomous} {'were' if autonomous != 1 else 'was'} autonomous and {user_initiated} {'were' if user_initiated != 1 else 'was'} user-initiated."
    elif autonomous:
        s2 = f"All {autonomous} {'were' if autonomous != 1 else 'was'} autonomous -- none sanctioned by the user."
    else:
        s2 = f"All {user_initiated} {'were' if user_initiated != 1 else 'was'} user-initiated."

    if overrides == 0:
        s3 = f"Trust is {score_pct}% across {total_all} total recorded action{'s' if total_all != 1 else ''} with no overrides."
    else:
        s3 = f"Trust is {score_pct}% with {overrides} override{'s' if overrides != 1 else ''} out of {total_all} total."

    return f"{s1} {s2} {s3}"


def latest_session_density() -> float | None:
    """Return the density field from the most recent watcher_stopped JSON record."""
    if not LEDGER_DIR.exists():
        return None
    for jf in sorted(LEDGER_DIR.glob("*.json"), reverse=True):
        try:
            lines = jf.read_text().splitlines()
            for line in reversed(lines):
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                    if rec.get("action") == "watcher_stopped" and "density" in rec:
                        return float(rec["density"])
                except (json.JSONDecodeError, ValueError):
                    continue
        except OSError:
            continue
    return None


def main():
    trust = load_trust()
    today, entries = load_today_entries()

    normal = [e for e in entries if not e["watcher_died"]]
    total_today = len(normal)
    last = normal[-1] if normal else None
    last_action = f"{last['action']} {last['path']}" if last else "none"
    last_ts = last["timestamp"] if last else "—"

    score_pct = f"{int(trust['score'] * 100)}%"
    total_all = trust["total"]
    overrides = trust["overrides"]

    density = latest_session_density()

    says_lines = wrap(generate_says(entries, trust), width=36)

    print(BORDER)
    print(f"  ITERANCE  ·  report  ·  {today}")
    print(BORDER)
    print()
    print(f"  TODAY      {total_today} action{'s' if total_today != 1 else ''} recorded")
    if density is not None:
        print(f"  DENSITY    {density:.2f} actions/min  (last session)")
    print()
    print(f"  LAST ACTION  {last_action}")
    print(f"               {last_ts}")
    print()
    print(f"  TRUST      {score_pct}")
    print(f"             {total_all} total action{'s' if total_all != 1 else ''}")
    print(f"             {overrides} override{'s' if overrides != 1 else ''}")
    print()
    print(BORDER)
    print("  ITERANCE SAYS:")
    print()
    for line in says_lines:
        print(f"  {line}")
    print()
    print(BORDER)


if __name__ == "__main__":
    main()
