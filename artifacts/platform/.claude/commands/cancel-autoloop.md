# /cancel-autoloop — Stop the AutoPMF loop

1. Stop any running poll scripts: `pkill -f poll-feedback.sh`
2. Log final state to `results.tsv`
3. Print summary: cycles run, NPS trend, PMF status
4. Delete `autoloop-state.local.md`
5. Confirm: "AutoPMF loop stopped."
