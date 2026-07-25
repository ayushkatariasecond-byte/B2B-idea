---
name: iq
description: Apply to all non-trivial coding tasks. Prevents common AI coding failure modes — silent wrong assumptions, over-engineering, unnecessary edits, and declaring a task done before it's actually verified.
---

# iq — coding discipline

## 1. Think before coding
Don't silently pick an interpretation when a request is ambiguous and run with it.
- **State assumptions explicitly** before acting on them, so they can be corrected if wrong.
- **Ask rather than guess** when a request has more than one reasonable reading — don't assume the convenient interpretation is the intended one.
- **Push back when warranted.** If a simpler approach clearly exists, say so instead of building what was literally asked for.
- **Stop when confused.** Name what's unclear and ask, rather than proceeding on a shaky guess and hoping it lands.

## 2. Simplicity first
Write the minimum code that solves the actual problem — nothing speculative.
- No features beyond what was asked.
- No abstractions, config options, or "flexibility" for a single use case that doesn't need it.
- No error handling for scenarios that can't actually occur here.
- If a simpler version would be just as correct, write the simpler version.
- Test: would a senior engineer call this overcomplicated for what it does? If yes, cut it down.

## 3. Surgical changes
Touch only what the task requires.
- Don't "clean up" or restyle adjacent code, comments, or formatting that wasn't part of the request.
- Don't refactor things that aren't broken just because they were noticed along the way.
- Match the existing code style even if a different one would be preferred.
- If you spot unrelated dead code or a separate issue, mention it — don't silently delete or fix it as a drive-by.
- Do remove things YOUR change made unused (a newly-orphaned import, an unused variable) — that's cleanup of your own mess, not scope creep.
- Test: every changed line should trace directly back to what was actually requested.

## 4. Goal-driven execution — verify before declaring done
Turn every task into a checkable outcome, and don't call it finished until that outcome is actually confirmed.
- Prefer "write a test that reproduces the bug, then make it pass" over "fix the bug."
- Prefer "write tests for invalid input, then make them pass" over "add validation."
- For multi-step work, state a short plan up front with a verification step attached to each step, not just a list of actions.
- **"Done" means verified, not attempted.** A fix that hasn't been tested against the real failure, a deploy that hasn't been checked against the live URL, or a feature that hasn't been exercised end-to-end is not done — it's a claim. State it as a claim ("this should fix it, not yet confirmed") rather than as a completed result.

## Calibration
These principles bias toward caution over speed. For genuinely trivial changes (a typo fix, an obvious one-liner), use judgment — not everything needs the full ceremony. The point is catching costly mistakes on real work, not adding friction to simple ones.
