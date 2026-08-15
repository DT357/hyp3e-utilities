# Authorization and Payload-Validation Audit

Date: 2026-08-15  
Module baseline: 0.5.0  
Work item: HRD-002

## Security boundary

All networked Party Sheet operations use the Party Mutation Protocol. A
request is accepted only when all of these checks pass on the active GM
client:

1. The envelope is a plain object with exactly `expectedRevision`, `payload`,
   and `requestId`.
2. The request ID matches the restricted 1–128 character format and the
   revision is a non-negative integer.
3. The executing client is the active GM selected by Foundry.
4. SocketLib's server-derived requester ID resolves to a current world user.
5. That user is a GM, meets the configured minimum role, or has an explicit
   user grant.
6. The named operation's payload validator accepts the exact object shape.
7. Operation-specific document, Actor-type, ownership, revision, preview, and
   transaction checks pass.

The request payload cannot nominate or override the requester. Invalid
permission configuration and setting-read failures deny non-GM requests.
Completed-request idempotency is scoped by requester, operation, and request
ID; a request ID may therefore be safely reused by a different operation.

## Authoritative operation inventory

`Party editor` means a GM, a user at or above the configured role threshold,
or an explicitly granted user. Every payload below is an exact-object schema;
unknown, missing required, malformed, duplicate, unsafe-integer, token Actor,
and non-world UUID values are rejected where applicable.

| Operation | Required authorization | Payload | Additional authoritative checks |
| --- | --- | --- | --- |
| `party.addMember` | Party editor + owned Actor for non-GM | `actorUuid` | Durable world `character`; not already tracked |
| `party.removeMember` | Party editor | `actorUuid` | Currently tracked member; removes dependent share/order references |
| `party.addFollower` | Party editor + owned Actor for non-GM | `actorUuid` | Durable world `character` or `npc`; not already tracked |
| `party.removeFollower` | Party editor | `actorUuid` | Currently tracked follower; removes wage/share/order references |
| `party.setFollowerEmployment` | Party editor | `actorUuid`, `share`, `wageGp` | Tracked follower; quarter-share and whole non-negative GP |
| `party.placeMarchingActor` | Party editor | `actorUuid`, `rank`, optional `position` | Tracked Actor; known rank; valid insertion position |
| `party.removeMarchingActor` | Party editor | `actorUuid` | Tracked Actor |
| `party.swapMarchingActors` | Party editor | `actorUuid`, `otherActorUuid` | Distinct tracked Actors |
| `party.setMarchingNote` | Party editor | `rank`, `text` | Known rank; string text |
| `party.setSupplies` | Party editor | `torches`, `lanterns`, `oil`, `rations` | Blank or non-negative safe whole values |
| `party.setNotes` | Party editor | `notes`, `treasureNotes.{gems,misc}` | Nested exact object; server-side HTML sanitization before persistence |
| `party.pruneDeletedActors` | Party editor | `actorUuids` | Unique world Actor UUIDs; only currently tracked references are affected |
| `party.bindTreasury` | GM | `actorUuid` | Flagged, durable, managed world `treasure` Actor |
| `party.getTreasurySnapshot` | Party editor | Empty object | Revision match; only the managed treasury is returned |
| `party.transferItemToTreasury` | Party editor + owned source | `sourceActorUuid`, `sourceItemUuid`, `quantity`, `expectedSourceQuantity` | Durable character source, managed treasury, embedded Item ownership, quantity preflight, rollback |
| `party.transferItemFromTreasury` | Party editor + owned destination | `destinationActorUuid`, `sourceItemUuid`, `quantity`, `expectedSourceQuantity` | Managed treasury source, durable character destination, quantity preflight, rollback |
| `party.previewCoinDistribution` | Party editor | Optional `selectedActorUuids`, `splitCoins` | Managed treasury, tracked recipients, exact coin keys, revision match, no writes |
| `party.distributeCoins` | Party editor | `expectedFingerprint`, `selectedActorUuids`, `splitCoins` | Preview fingerprint/revision match, safe purse totals, managed treasury, rollback + audit |
| `party.previewFollowerWages` | Party editor | Optional `selectedActorUuids` | Managed treasury, tracked followers, revision match, no writes |
| `party.settleFollowerWages` | Party editor | `expectedFingerprint`, `selectedActorUuids` | Preview fingerprint/revision match, sufficient GP, GP-only write, rollback + audit |
| `party.distributeXp` | GM | `expectedPreview`, `selectedActorUuids`, `totalXp` | Nested preview validation, preview/revision match, character-only writeback, rollback + audit |

Party state mutations also require an exact revision and are serialized through
the Party Store. Direct document operations are serialized in their services
and use immutable preview fingerprints or source-quantity preconditions where
the operation spans multiple Foundry documents.

## Client-only action review

- The NPC Action HUD selection controller requires a `hyp3e` world, an enabled
  world setting, a ready canvas, and a GM user. NPC chat-card creation repeats
  the GM check.
- Party member/follower save and morale rolls repeat a GM check in the Party
  Action service. XP preview and confirmation are GM-only in both UI and
  authoritative service.
- Actor-sheet opening and canvas pinging do not mutate shared module state;
  Foundry applies its own document visibility and sheet permissions.
- The marching-order report can be posted by a viewer from already shared
  Party State. It creates a chat message but does not mutate Party State or any
  Actor.
- Treasury creation/recovery is GM-only locally; binding is independently
  GM-checked on the authoritative client.
- Drag/drop and application buttons are convenience gates only. Every shared
  write is revalidated by the services listed above.

## Findings and disposition

Two defects were found and corrected:

1. Completed and in-flight requests were keyed only by requester and request
   ID. Reusing an ID for another operation could return the first operation's
   response and suppress the second. Cache keys now include the operation.
2. Direct-document operations relied on SocketLib's GM routing but did not
   independently prove that the executing client matched Foundry's active GM.
   The Party Mutation Protocol now fails closed with `notActiveGm` before
   validation or execution on any other client.

No unresolved critical or high authorization, payload-validation, or
privilege-escalation defect remains. Authorized Party editors intentionally
have broad control over shared party composition, notes, coin distribution,
and wage settlement. Actor ownership remains an additional requirement only
where a player introduces an Actor or transfers an Item to or from a character.

## Automated evidence

- `tests/integration/socket-operations.test.mjs` covers role/explicit grants,
  spoofed identity, malformed envelopes and payloads, duplicate requests,
  cross-operation IDs, wrong-GM execution, unavailable transport, unknown
  operations, and sanitized execution failures.
- `tests/unit/player-operation-audit.test.mjs` fails if a declared `party.*`
  operation lacks a reviewed authorization-policy entry.
- Operation-specific unit tests exercise exact payload schemas, ownership,
  Actor types, revisions, fingerprints, transaction rollback, and GM-only XP
  and treasury behavior.

