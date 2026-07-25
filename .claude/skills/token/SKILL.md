---
name: token
description: Apply when investigating bugs, exploring the codebase, running commands, or reporting results. Keeps token usage down by avoiding redundant exploration, verbose narration, raw log dumps, and unnecessary context bloat.
---

# Token-efficient workflow

## Investigation
1. **Search before reading.** Use grep/targeted search to find the right file first. Don't open files speculatively "just to check" — form a hypothesis about where the answer is, then verify it directly.

2. **Don't re-explore what's already documented.** Check CLAUDE.md/AGENTS.md and existing code comments before re-deriving facts about the codebase from scratch (e.g. field names, API patterns) that are likely already stated there.

3. **Plan before executing.** For any non-trivial task, form a complete plan of what needs to be checked or changed before starting, rather than exploring and adjusting step by step in an open-ended loop.

4. **One investigation pass, not iterative re-checking.** Run the plan, then report. Avoid re-running the same command multiple times to "double check" unless a result was genuinely ambiguous or contradicted something.

## Command and log output
5. **Observation masking: once a verbose output has served its purpose, replace it with a compact reference, not its full content.** After reading a large file, running a test suite, or getting a big command result, extract what's actually needed (the outcome, the error, the changed lines) and drop the raw bulk from further reasoning. If the raw content is needed again later, re-fetch it rather than keeping it live in context the whole session.

6. **Summarize routine output; never the evidence for a live problem.** Test runs, install logs, `git log`, long stdout/stderr — state the outcome (pass/fail counts) rather than pasting it all. This does NOT apply to the specific error or log lines that explain a failure you're actively diagnosing (see rule 11).

7. **Quote minimally when raw output IS necessary.** Show only the relevant lines, not the whole file/log. Use line-range views, not full-file dumps.

## Output
8. **No narrated exploration.** Don't output "Let me check X... now let me check Y... now let me verify Z" as running commentary. Investigate silently, then report only the conclusion and the minimum evidence needed to support it.

9. **Concise reports.** State what you found and what you changed. Skip preamble, skip restating the task back, skip enthusiasm/filler language.

## Session hygiene
10. **Flag context bloat.** If a large CLAUDE.md/AGENTS.md, unused tool/MCP configuration, or accumulated conversation history appears to be consuming significant context for no benefit to the current task, say so explicitly instead of silently working around it.

11. **Match effort to the task.** For simple, mechanical changes, don't invoke deep multi-file exploration or heavyweight reasoning the task doesn't need. Save thorough investigation for tasks that are genuinely ambiguous or high-stakes (bugs, security-relevant code, anything touching production data).

## Hard limit — never trade away
12. **Never sacrifice correctness for brevity.** Do not compress, summarize, or omit error messages, log output, or verification steps when they are the actual evidence needed to diagnose or confirm a fix. If a claim genuinely requires verification (a live bug, a field actually used in production, a fix that needs browser confirmation), verify it fully and report the real evidence — even if that costs more tokens than a shorter, unverified answer would. This skill targets wasted exploration, narration, and routine log/output noise — never the diligence that actually finds and fixes real bugs.
