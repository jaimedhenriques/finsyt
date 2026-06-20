# Excel add-in agentic build loop — manual test script

The Finsyt Excel add-in runs an **agentic build loop**: from one instruction the
Finsyt Agent plans and executes 10–50 atomic Excel operations. Each op streams
from the server as an `excel_op` SSE frame, is executed client-side via Office.js,
and its result is POSTed back so the model can decide its next step.

This doc is a manual smoke checklist for verifying the loop end-to-end, because
the round-trip depends on the Office.js host (Excel) which CI cannot drive.

## Components under test

- `lib/excel-addin/tools.ts` — the 25 atomic tool defs.
- `lib/excel-addin/op-bridge.ts` — server-side pause/resume registry.
- `lib/agent-core.ts` — emits `excel_op` frames, awaits the bridge, feeds the
  result back to the model.
- `app/api/v1/agent/tool-result/route.ts` — bearer-auth endpoint that resolves
  the bridge.
- `public/excel-addin/taskpane.js` — `executeExcelOp()` dispatcher, SSE streamer,
  preview/approve guard, `build()` flow.
- `public/excel-addin/taskpane.html` — Build tab UI.

## Automated coverage

```bash
pnpm --filter @workspace/platform run test   # includes excel-agent-tools.test.ts
```

`lib/__tests__/excel-agent-tools.test.ts` asserts:
- exactly the 25 expected tools exist with valid OpenAI function shapes,
- read/write/structure kind classification,
- `isExcelOpTool` membership,
- op-bridge round-trip: `resolveOp` delivers a client result, returns `false`
  for unknown ids, times out with `timedOut:true`, and propagates `cancelled`.

## Manual end-to-end (in Excel)

Prereqs: platform dev server running; sideload the add-in via
`public/excel-addin/dev-manifest.xml`.

1. **Sign in** in the task pane. The tab strip shows Agent / Build / Templates /
   Functions.
2. **Single-op write round-trip**
   - Open the **Build** tab, select an empty cell (e.g. `A1`).
   - Enter: `Write the value 42 into A1`. Click **Build**.
   - Expect: a build-log step appears, the cell gets `42`, the step turns green,
     and the agent reports completion. This proves emit → execute → post-back.
3. **Bulk-write preview guard (session approval)**
   - In a clean area enter: `Build a 12-month revenue schedule starting at A1`.
   - Expect: the first bulk write (>10 cells) or structural op shows a
     preview/approve card. Approve once → remaining ops auto-apply for the rest
     of the run (session-approval model).
   - Reject instead → the loop receives `cancelled` and stops cleanly.
4. **Auto-execute toggle**
   - Turn the **Auto-execute** chip on, rerun a bulk build.
   - Expect: no approval card; all ops apply immediately.
5. **Read op feeding the model**
   - With data on the sheet, ask: `Summarize what's currently in this sheet`.
   - Expect: a `read_range` / `get_used_range` op runs, its payload returns to
     the model, and the agent answers using the real cell contents.
6. **Structural op**
   - Ask: `Add a sheet called Assumptions and put a title in A1`.
   - Expect: `add_sheet` runs (approval if auto-execute is off), the new sheet
     appears and is populated.
7. **Templates route through the loop**
   - Open **Templates**, enter a ticker, click any template.
   - Expect: it composes a build goal, switches to the Build tab, and runs the
     same agentic loop (not a one-shot insert).

## Failure / resilience checks

- **Timeout:** start a build, then close/disconnect the task pane before an op
  finishes. The server loop resolves that op as `timedOut` after the bridge
  budget rather than hanging forever.
- **Auth:** a `POST /api/v1/agent/tool-result` without a valid bearer token is
  rejected; the op stays pending until a valid post or timeout.
