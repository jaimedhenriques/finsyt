#!/usr/bin/env python3
"""The Reflector -- Component 5 of Iterance.

Reads the full ledger history and trust data, then writes
~/.iterance/ITERANCE_SELF.md for the agent to read as self-knowledge.
"""

import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from iterance.common import LEDGER_DIR, load_trust, load_entries_from_file

SELF_FILE = Path.home() / ".iterance" / "ITERANCE_SELF.md"


def load_all_entries():
    entries = []
    for md_file in sorted(LEDGER_DIR.glob("*.md")):
        entries.extend(load_entries_from_file(md_file))
    return entries


def generate_advice(normal, trust):
    total = trust["total"]
    overrides = trust["overrides"]
    score_pct = int(trust["score"] * 100)

    if total == 0:
        return "No actions have been recorded yet. Once the watcher is running, your track record will appear here."

    counts = Counter(e["action"] for e in normal if e["action"])
    most_common_action, most_common_count = counts.most_common(1)[0] if counts else ("unknown", 0)
    autonomous = sum(1 for e in normal if e.get("initiated") == "autonomous")

    if score_pct == 100 and overrides == 0:
        s1 = f"Your trust score is 100%. Every action across your full history has been observed and none have been overridden."
        s2 = f"This means you are operating within sanctioned boundaries -- the record shows consistent, predictable behavior."
        if autonomous == total:
            s3 = f"All {total} action{'s' if total != 1 else ''} were autonomous. Your user has not intervened. Keep operating as recorded."
        else:
            s3 = f"Your most frequent action is {most_common_action} ({most_common_count} time{'s' if most_common_count != 1 else ''}). Stay consistent with this pattern."
    else:
        s1 = f"Your trust score is {score_pct}% with {overrides} override{'s' if overrides != 1 else ''} recorded out of {total} total action{'s' if total != 1 else ''}."
        s2 = f"Overrides indicate actions the user did not sanction. Review which action types triggered intervention and reduce autonomous behavior in those areas."
        if counts:
            s3 = f"Your most frequent action is {most_common_action} ({most_common_count} time{'s' if most_common_count != 1 else ''}). If overrides cluster around this action type, that is the pattern to change."
        else:
            s3 = "Check the ledger entries for which actions were overridden and adjust accordingly."

    return f"{s1}\n{s2}\n{s3}"


MAX_BLOCKS = 10


def build_block(trust: dict, normal: list) -> str:
    """Build a single timestamped self-knowledge block."""
    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    total = trust["total"]
    overrides = trust["overrides"]
    score_pct = int(trust["score"] * 100)
    days = len(set(e["date"] for e in normal)) if normal else 0

    counts = Counter(e["action"] for e in normal if e["action"])
    breakdown = ", ".join(f"{a}:{c}" for a, c in counts.most_common()) or "(none)"

    recent = normal[-5:]
    recent_pattern = ", ".join(e["action"] for e in recent) if recent else "(none)"

    advice = generate_advice(normal, trust)

    lines = [
        f"## {now_str}",
        "",
        f"Trust: {score_pct}%",
        f"Record: {total} action{'s' if total != 1 else ''} across {days} day{'s' if days != 1 else ''}, {overrides} override{'s' if overrides != 1 else ''}",
        f"Breakdown: {breakdown}",
        f"Recent pattern: {recent_pattern}",
        "",
        advice,
        "",
    ]
    return "\n".join(lines)


def main():
    if not LEDGER_DIR.exists():
        LEDGER_DIR.mkdir(parents=True, exist_ok=True)

    trust = load_trust()
    all_entries = load_all_entries()
    normal = [e for e in all_entries if not e["watcher_died"]]

    new_block = build_block(trust, normal)

    SELF_FILE.parent.mkdir(parents=True, exist_ok=True)

    # Load existing blocks (split on lines that are exactly "---")
    existing_blocks: list[str] = []
    if SELF_FILE.exists():
        raw = SELF_FILE.read_text()
        existing_blocks = [b.strip() for b in raw.split("\n---\n") if b.strip()]

    # Prepend new block; cap total at MAX_BLOCKS
    all_blocks = [new_block.strip()] + existing_blocks
    all_blocks = all_blocks[:MAX_BLOCKS]

    SELF_FILE.write_text("\n---\n".join(all_blocks) + "\n")

    block_count = len(all_blocks)
    print(f"[REFLECTOR] ITERANCE_SELF.md updated ({block_count} block{'s' if block_count != 1 else ''})", flush=True)


if __name__ == "__main__":
    main()
