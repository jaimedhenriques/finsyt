# ITERANCE
That which time makes visible through accumulated behavior.

## What It Is

A universal behavioral witness layer for AI agents.

Not a memory system. Not a logging tool. Not a security tool.

A witness. It records what the agent did, in plain English, forever.

## Four Constraints

1. Outside-In Always -- Never lives inside the agent it watches. No SDK. No hooks. No required integration.
2. Local First. Always -- Every ledger entry lives on the user's machine. Plain text. Git-backed. No cloud. No account.
3. Human Readable Without Tooling -- Open the ledger in any text editor and read what happened.
4. The Ranvier Constraint -- Single binary. One install command. Zero runtime dependencies.

## Five Components

1. The Watcher -- Observes the agent filesystem surface from outside.
2. The Crystallizer -- Converts raw events into human-readable ledger entries.
3. The Ledger -- Git-backed local storage. Computes trust scores from history.
4. The Witness -- Terminal interface. Answers the five questions. Generates ITERANCE SAYS.
5. The Reflector -- Feeds the ledger back to the agent as self-knowledge.

## The Five Questions

1. What is it doing right now?
2. What did it do while I wasn't watching?
3. What did it cost me?
4. Did it do anything I didn't ask for?
5. Should I trust it?

## Build Order

Week 1: Watcher + Crystallizer. OpenClaw. Filesystem only.
Week 2: Ledger. Git-backed. Trust scores.
Week 3: Witness. Terminal UI. ITERANCE SAYS.
Week 4: Distribution. Install script. Ship.
Post-launch: Reflector. Agent self-knowledge.

## First Target

OpenClaw. Filesystem observation. Tier 1 only.
Prove the mechanic. Then generalize.
