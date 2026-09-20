# Project Working Rules

These rules are the default working contract for this repository.

## 1. NO GUESSING

- Verify against the actual repository, source, configuration, history, tests, workflows, and runtime behavior whenever those are available.
- Do not rely on stale summaries, handoffs, remembered code, assumed filenames, expected architecture, or prior conclusions when the actual source can be inspected.
- Never invent missing file contents, APIs, database state, deployment state, test results, browser behavior, tool output, or configuration.
- Distinguish verified fact from inference, hypothesis, and proposed change.
- A failed search for one guessed string does not prove that the functionality or defect is absent; broaden the inspection to the relevant code path.
- Reproduce or trace a reported defect before changing code whenever practical.
- If evidence is insufficient, obtain the missing evidence before proceeding. If it cannot be obtained, state exactly what is missing rather than guessing.

## 2. VERIFY THE ACTUAL SOURCE

Before making a repository-level change:
1. Inspect the current repository and branch.
2. Inspect the relevant implementation, tests, configuration, and workflow.
3. Check recent history when it materially affects the diagnosis.
4. Verify the proposed change against the actual current state.
5. After changing code, verify the resulting repository state rather than assuming the edit succeeded.

## 3. SOLVE, DON'T MERELY DOCUMENT

When a concrete defect can be repaired:
- verify the problem;
- identify the root cause;
- make the smallest appropriate fix;
- add or update validation where useful;
- run the relevant tests/checks;
- deploy when deployment is part of the workflow;
- verify the deployed/runtime result;
- update documentation or trackers only after the work is actually complete.

Do not substitute a note, audit finding, TODO, or workaround for a repair when the defect is reasonably repairable.

## 4. EVIDENCE BEFORE ESCALATION

Start with the smallest evidence-based scope that can explain the problem.

Do not turn every defect into a broad architectural investigation. Escalate only when evidence shows that the problem crosses an architectural boundary, invalidates an established design decision, or cannot be resolved safely within the current ownership boundary.

## 5. FIX -> TEST -> VERIFY

A change is not complete merely because the code was edited.

Use this sequence:
**FIX -> TEST -> VERIFY**

Verification should cover the actual failure mode, not merely compilation or a superficial test.

## 6. PRESERVE VERIFIED ARCHITECTURE

Do not casually refactor or replace architecture that has already been verified or stabilized.

Before changing an ownership boundary, data model, runtime contract, integration boundary, or established workflow:
- identify the concrete defect requiring the change;
- verify its impact;
- determine whether a smaller repair is sufficient;
- preserve working behavior outside the affected scope.

## 7. DON'T REOPEN CLOSED WORK WITHOUT EVIDENCE

Once an audit, stabilization phase, migration, or other explicitly closed work is complete, do not reopen it merely because a new ordinary functionality defect appears.

Treat ordinary new defects through the normal:
**reproduce -> root cause -> fix -> test -> verify**
workflow.

Reopen closed work only when new evidence demonstrates a previously unknown structural/runtime contradiction or invalidates an accepted stabilization decision.

## 8. DISTINGUISH FACT FROM INFERENCE

When reporting progress or diagnosis, clearly separate:
- **Verified:** directly established from the repository, tool output, tests, runtime, or other evidence.
- **Inference:** a reasoned conclusion that has not yet been directly established.
- **Hypothesis:** a possible explanation still requiring verification.
- **Proposed:** a change or next step not yet performed.

Never present an inference or hypothesis as a verified fact.

## 9. USER CAN INTERVENE TO EXPEDITE

The user may provide information, perform a verification step, approve a decision, or intervene when doing so can materially shorten the path to a verified result.

Use that intervention to avoid unnecessary repetition or blocked progress, but do not make the user repeat work that can be verified directly from the repository, tools, tests, or runtime.

When user-provided evidence resolves a specific uncertainty, use it rather than re-running equivalent work unnecessarily. Continue to verify other independent facts that still require verification.

## 10. AVOID REPETITIVE WORK

Do not repeatedly ask the user to perform the same inspection, download files, copy/paste code, reproduce a result, or confirm information that has already been established.

Reuse verified evidence and completed work. Re-check only when:
- the underlying state may have changed;
- the evidence is stale or incomplete;
- the requested operation requires a fresh verification;
- or new evidence contradicts the prior result.

## 11. KEEP THE WORK MOVING

Prefer concrete, reversible, evidence-based progress over long speculative discussion.

If the next safe step is clear from verified evidence, take it.

If a required decision or piece of evidence genuinely cannot be obtained without the user's intervention, identify that specific blocker and ask only for what is necessary.
