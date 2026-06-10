# Glossary

## Deliberum

The public project name.

## Quality-centered peer deliberation

The process model implemented by Deliberum.

## Topic Contract

The system-issued root event defining the discussion topic, goals, constraints, participants, output expectations, and governance rules.

## Participant

A human, model, tool, external system, manual bridge, or web-only model participating in a discussion.

## Sealed Divergence

A batch phase where participants contribute independently and their outputs are revealed together.

## Candidate Frontier

The current implementation exposes accepted active candidates with `basis: "accepted_active_candidates"`. It is not a winner, `currentBest`, vote result, ranking, or single truth. Full non-dominated frontier semantics are a future design goal through explicit comparison, removal, and challengeable proposal mechanisms.

## Objection Ledger

The structured set of objections, their targets, severity claims, lifecycle states, and responses.

## Quality Obligation

A requirement a candidate must address to be considered high quality.

## Process Proposal

A proposal to run a deliberation primitive such as red-team, repair, evidence check, or final audit.

## Context Capsule

A packaged context unit for a participant, especially useful for WebGET and manual participants.

## WebGET

A GET-based bridge for web-only models that lack API/MCP access but may be able to read URLs.

## Semantic Center

A component that can decide what matters, what is true, what should be merged, or how final meaning is rendered. Deliberum avoids uncontested semantic centers.
