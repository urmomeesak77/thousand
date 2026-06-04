# Feature Specification: Bot Card Memory

**Feature Branch**: `009-ai-opponents` (no new branch created)
**Created**: 2026-06-04
**Status**: Draft
**Input**: User description: "lets create memory for AI. how much they remember what cards are already gone. use fourier transform formula"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Bots play using what they remember is gone (Priority: P1)

A bot keeps track of the cards that have already been played to tricks during the
current round and factors that knowledge into its decisions. Because it knows which
cards are gone, it stops making plays that only make sense if a card it has already
seen were still live (for example, it no longer leads into a suit it has seen
exhausted, and it no longer plays as if an honour card it watched being played were
still out there).

**Why this priority**: This is the foundational slice — a memory that actually
influences play. On its own it already makes bots noticeably more believable, and
every other story builds on the existence of this memory.

**Independent Test**: Drive a round to a point where several cards of one suit have
been played, then trigger a bot's turn and confirm its chosen action is consistent
with those cards being gone (rather than a choice that assumes they are still live).

**Acceptance Scenarios**:

1. **Given** a bot whose turn it is and a suit it has seen fully played out, **When** the bot chooses an action, **Then** the action does not assume any card of that exhausted suit is still in play.
2. **Given** a round where every card a bot needs to reason about is still recalled, **When** the bot decides, **Then** its decision reflects the full set of cards it has seen played.
3. **Given** the very first action of a round (nothing played yet), **When** a bot decides, **Then** it behaves as a bot with an empty memory and never references a played card.

---

### User Story 2 - Memory fades over the round, so bots are imperfect (Priority: P2)

A bot does not have a perfect ledger. The longer ago a card was played, the more
likely the bot has lost track of it. Recall of a card it saw in the last trick is
strong; recall of a card played many tricks earlier is weak and may be gone entirely.
As a result the bot occasionally misjudges — acting as if a long-gone card were still
live — which makes it beatable and feels human rather than omniscient.

**Why this priority**: This is the heart of the request ("how much they remember").
It converts a perfect card-counter into a realistic, fallible opponent. It depends on
Story 1's memory existing first.

**Independent Test**: Replay an identical play history and compare a bot's recall of a
card played in the most recent trick against its recall of a card played early in the
round; confirm the recent card is recalled and the early card has a meaningful chance
of being forgotten.

**Acceptance Scenarios**:

1. **Given** a card played in the immediately preceding trick, **When** the bot's recall is evaluated, **Then** the card is recalled.
2. **Given** a card played several tricks ago and many cards played since, **When** the bot's recall is evaluated repeatedly across comparable rounds, **Then** there is a non-zero chance the card is not recalled.
3. **Given** enough elapsed play, **When** a bot decides, **Then** it can make a choice consistent with a forgotten card still being live (a memory mistake), demonstrating it is not omniscient.
4. **Given** the same bot, the same memory skill, the same play history, and the same elapsed time, **When** recall is evaluated, **Then** the result is reproducible (deterministic under a fixed seed) for testing.

---

### User Story 3 - Each bot has its own memory skill (Priority: P3)

Different bots at the same table remember differently. Each bot is assigned a memory
skill that parameterizes the same underlying formula: a higher-skill bot recalls more
cards and holds onto them longer; a lower-skill bot forgets sooner. Two bots watching
the identical sequence of plays can therefore end up "knowing" different things.

**Why this priority**: Variety and personality. Valuable polish, but the feature is
already useful with a single shared skill level, so this is the lowest priority.

**Independent Test**: Seat two bots with clearly different memory skills, feed them an
identical play history, and confirm their recalled-card sets differ in the expected
direction (the higher-skill bot recalls a superset-leaning, longer-lived set).

**Acceptance Scenarios**:

1. **Given** two bots with different memory skills and one identical play history, **When** recall is evaluated for both, **Then** their recalled-card sets measurably differ.
2. **Given** a higher-skill and a lower-skill bot and a card played long ago, **When** recall is evaluated, **Then** the higher-skill bot is at least as likely to recall it as the lower-skill bot.
3. **Given** a table of bots, **When** bots are created, **Then** each is assigned a memory skill independently of the others.

---

### Edge Cases

- **Empty memory**: the first decision of a round, before any card is played, must not reference any played card.
- **A bot's own just-played card**: a card the bot itself just played is recalled like any other recently played card.
- **Fully exhausted suit**: when all cards of a suit have been played and are recalled, the bot must treat the suit as void; if some of those plays have been forgotten, it may not.
- **Very short vs very long rounds**: decay behaviour must be sensible whether few or many cards have been played.
- **Threshold ties**: a recall strength sitting exactly at the recall boundary must resolve deterministically.
- **Multiple bots, shared name pool**: each bot's memory is independent; one bot forgetting a card does not affect another's recall.
- **Round reset / abort / reconnect**: memory is per-round and starts empty for every new round; an aborted or restarted round does not inherit prior recollection.

## Requirements *(mandatory)*

### Functional Requirements

**Memory tracking**

- **FR-001**: Each bot MUST maintain its own memory of the cards that have been played to tricks during the current round.
- **FR-002**: A bot's card memory MUST be scoped to a single round — it MUST begin empty at the start of each round and MUST NOT carry recollection of played cards from one round into the next.
- **FR-003**: When a card is played to a trick, the system MUST record that card in each bot's memory together with the elapsed-play marker (e.g., trick/turn index) needed to compute how long ago it was played.

**Recall and forgetting**

- **FR-004**: For each remembered card, the system MUST compute a recall strength that decreases as more play elapses since the card was played, using a Fourier-transform-based formula (the user-mandated mechanism for this feature).
- **FR-005**: A bot MUST classify each remembered card as recalled or forgotten based on its current recall strength.
- **FR-006**: Recall MUST be re-evaluated as the round progresses, so that a card played recently is more likely to be recalled than one played many tricks earlier.
- **FR-007**: A bot MUST NOT have perfect memory — after sufficient elapsed play there MUST be a non-zero chance that a previously played card is not recalled.
- **FR-008**: Recall results MUST be reproducible given identical inputs (bot, memory skill, play history, elapsed time) so behaviour is deterministic under a fixed seed for testing.

**Per-bot memory skill**

- **FR-009**: Each bot MUST be assigned a memory-skill value that parameterizes the recall formula.
- **FR-010**: Memory skill MUST be assigned per bot and independently, so different bots at the same table can recall different cards from the same play history.
- **FR-011**: A higher memory skill MUST result in stronger and longer-lasting recall than a lower memory skill, all else equal.

**Integration with bot decisions**

- **FR-012**: Bot decision-making MUST act only on the cards the bot currently recalls as gone — never on the full ground-truth set of played cards.
- **FR-013**: When a bot recalls that a suit is exhausted or that a specific card is gone, its action selection MUST reflect that knowledge; when it has forgotten such a card, its action selection MUST be allowed to proceed as if that card were still live.
- **FR-014**: The memory layer MUST integrate with existing bot turn-taking without changing the externally observable game rules — only the *quality* of bot decisions changes.

**Non-functional**

- **FR-015**: Recall computation for a bot's turn MUST complete well within the bot's existing decision-timing budget and MUST NOT introduce a perceptible delay to other players.

### Key Entities *(include if feature involves data)*

- **Bot Card Memory**: a per-bot, per-round collection of the cards the bot has observed played, each with the marker of when it was played. Reset every round.
- **Played-Card Record**: one entry in a Bot Card Memory — the identity of a played card plus its elapsed-play marker (trick/turn index).
- **Memory Skill**: a per-bot attribute, set when the bot is created, that parameterizes the recall formula and determines how strongly and how long that bot retains recall.
- **Recall Strength**: a derived value for a remembered card at a given moment, produced by the Fourier-transform-based formula from the card's age and the bot's memory skill; compared against a recall boundary to decide recalled vs forgotten.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In automated play, a bot's decisions are always consistent with its current recalled set and never reference a played card it has not recalled (0 violations across a test suite of simulated rounds).
- **SC-002**: A maximum-skill bot recalls a card played in the immediately preceding trick 100% of the time; a minimum-skill bot's recall of a card played at least four tricks earlier falls below 50%.
- **SC-003**: Two bots with clearly different memory skills, given an identical play history, produce recalled-card sets that differ in at least one card in a measurable fraction of test scenarios.
- **SC-004**: Across many simulated rounds, a forgetting-enabled bot commits measurably more "memory mistakes" (acting as if a gone card were still live) than a perfect-memory baseline, confirming imperfection is observable.
- **SC-005**: Memory skill is the only lever needed to move a bot along the spectrum from near-perfect recall to weak recall — adjusting it alone changes recall outcomes in the expected direction with no other tuning.
- **SC-006**: Recall computation adds no more than 50 ms to any single bot decision.

## Assumptions

- **Scope of memory**: only cards played to tricks ("cards already gone") are remembered; cards seen solely during the talon/exchange phase are out of scope for this feature.
- **Decay axis**: "time" for forgetting is measured in elapsed play (tricks/turns since a card was played), not wall-clock time.
- **Forgetting model**: recall is probabilistic, driven by the Fourier-transform-derived recall strength, and uses a seedable random source so tests are deterministic (satisfies FR-008).
- **Memory skill assignment**: memory skill is a new per-bot attribute set at bot creation, independent of the existing aggressiveness trait, per the decision that the formula defines each bot's memory skill.
- **Formula as a mandated constraint**: the Fourier-transform formula is an explicit user-requested mechanism. Exact filter shape, parameters, and recall boundary are deferred to the planning phase; this spec fixes only the observable behaviour the formula must produce.
- **Dependencies**: builds on the feature 009 server-side bots (bot strategy, bot turn-taking, card-evaluation helpers) and the existing trick-play history; no human-facing UI changes are required, since memory only affects bot decision quality.
