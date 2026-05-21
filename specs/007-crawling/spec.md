# Feature Specification: Crawling

**Feature Branch**: `007-crawling`
**Created**: 2026-05-21
**Status**: Draft
**Input**: User description: "New feature. crawling. On the first trick, if the declarer does not have any ace, he can crawl: select some random card from his stack that is moved face down to talon. other opponents try to guess can they steal it by selecting any of their cards that is sent to talon face down as well. after all players have sent their card to talon, the cards are opened and winner is detected (by standard rules)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Ace-less Declarer Crawls the First Trick (Priority: P1)

Trick play is about to begin and the declarer is on lead for trick 1. The declarer looks at their 8-card trick-start hand and discovers it contains no ace of any suit. Because an ace-less hand is weak on lead, the declarer is offered a special option for this first trick only: **crawl**. Instead of leading a card face-up, the declarer chooses one card from their hand and plays it **face-down** into the centre. The two opponents are then each asked to commit one of their own cards face-down as well — they are gambling on whether their hidden card can beat the declarer's hidden card and steal the trick. Nobody can see any of the three cards while choices are being made. Once all three face-down cards are committed, they are revealed simultaneously and the trick is resolved by the standard trick rules: the declarer's card sets the led suit, there is no trump on the first trick, and the highest card of the led suit wins. The winner collects all three cards into their tricks pile (those card points count toward the round) and leads trick 2. Play then continues normally for tricks 2 through 8.

**Why this priority**: This is the entire feature — the crawl mechanic on the first trick. Without it there is no crawling at all. It is a single, self-contained variation of the first trick that delivers its full value the moment an ace-less declarer is on lead.

**Independent Test**: Drive a hand to trick-play start with a declarer whose 8-card hand holds no ace. Observe that the declarer is offered the crawl option, can pick any card to play face-down, both opponents are then prompted to commit a face-down card, none of the three cards is visible until all three are committed, and on reveal the trick is awarded to the correct player by standard rank/led-suit rules, who then leads trick 2.

**Acceptance Scenarios**:

1. **Given** trick play is about to begin and the declarer's 8-card trick-start hand contains no ace, **When** it is the declarer's turn to lead trick 1, **Then** the declarer is offered the crawl option (in addition to leading normally) and may select any single card from their hand to play face-down into the centre.
2. **Given** the declarer has crawled a card face-down, **When** it becomes each opponent's turn, **Then** each opponent in turn commits exactly one of their own cards face-down; no committed card (declarer's or opponents') is revealed to anyone until all three have been committed.
3. **Given** all three players have committed a face-down card, **When** the cards are revealed, **Then** the trick is resolved by standard rules — the declarer's card sets the led suit, no trump applies on the first trick, and the highest card of the led suit wins — and the winner collects all three cards into their tricks pile and becomes the leader of trick 2.
4. **Given** the crawl trick has been resolved, **When** trick 2 begins, **Then** play proceeds entirely normally (follow-suit and trump priority enforced, marriages allowed on tricks 2–6) for the remaining tricks, and round-end scoring counts the crawl trick's card points for whoever won it.

---

### User Story 2 — Declarer With An Ace Cannot Crawl (Priority: P1)

When the declarer's 8-card trick-start hand contains at least one ace, the crawl option is not available. The declarer simply leads trick 1 normally, face-up, and the round plays out exactly as it does today. This guards the rule: crawling is strictly a relief mechanic for an ace-less declarer and must never be offered otherwise.

**Why this priority**: Eligibility gating is part of the core rule. Offering crawl to an ace-holding declarer would be a correctness defect, so this is P1 alongside US1.

**Independent Test**: Drive a hand to trick-play start with a declarer whose 8-card hand holds one or more aces. Confirm the crawl option is never offered and the declarer leads trick 1 face-up as normal.

**Acceptance Scenarios**:

1. **Given** the declarer's 8-card trick-start hand contains one or more aces, **When** it is the declarer's turn to lead trick 1, **Then** the crawl option is not offered and the only available action is a normal face-up lead.
2. **Given** the declarer holds no ace and is therefore offered crawl, **When** the declarer instead chooses to lead a normal face-up card, **Then** the crawl is declined and trick 1 proceeds as a normal trick (declarer's card face-up, opponents follow under standard follow-suit rules).

---

### User Story 3 — Crawl Is Visible and Auditable to All Players (Priority: P2)

All three players can follow what is happening during a crawl: that a crawl is in progress, that face-down cards are being committed (without seeing their faces), and — once revealed — which three cards were played and who won the trick. After the round, the fact that trick 1 was crawled is reflected consistently for everyone, so the outcome is understandable and trustworthy.

**Why this priority**: The mechanic in US1 is the functional core; clear shared visibility makes the gamble fair and the result trustworthy, but the rule is correct without polished surfacing. P2 because it builds on the existing trick-play and reveal flows.

**Independent Test**: During a crawl, confirm all three clients show that a crawl is underway and indicate committed-but-hidden cards without exposing faces; on reveal, confirm all three clients show the same three cards and the same winner.

**Acceptance Scenarios**:

1. **Given** a crawl is underway, **When** a player has committed their face-down card, **Then** all three clients indicate that the card is committed (e.g., a face-down placeholder) without revealing its face to anyone.
2. **Given** all three face-down cards are committed, **When** they are revealed, **Then** all three clients display the same three card faces and identify the same winning player consistently.

---

### Edge Cases

- **Declarer declines the crawl**: an ace-less declarer is offered crawl but may instead lead normally; choosing the normal lead makes trick 1 an ordinary face-up trick with standard follow-suit enforcement (US2 AS-2).
- **Tie / no card matches the led suit**: the declarer's face-down card always defines the led suit and is itself of that suit, so at least one card (the declarer's) is always a candidate; the highest led-suit card wins. An opponent whose blind card is of a different suit simply cannot win (no trump on trick 1).
- **Follow-suit is suspended only for the crawl trick**: because opponents commit blind, they may play any card on the crawl trick; this suspension applies to trick 1 only. From trick 2 onward, standard follow-suit and trump-priority rules apply to all players, including any card an opponent "wasted" on the crawl.
- **The crawled card wins or loses for the declarer**: the declarer's hidden card may or may not win; whoever wins collects the three cards' points and leads trick 2 — the declarer gains no special advantage beyond hiding their lead.
- **Interaction with the four-nines bonus (feature 006)**: if a four-nines bonus is awarded this hand, its blocking acknowledgment modal gates the first trick lead (feature 006 FR-003). The crawl offer/decision is part of that first trick lead and MUST NOT begin until all three four-nines acknowledgments are recorded.
- **A player disconnects mid-crawl** (after the crawl starts but before all three cards are committed, or after commit but before reveal): grace-period and reconnect handling follow features 004/005. A committed face-down card is sticky and survives reconnect; on reconnect within grace the player sees the crawl in its current pending state with their own commitment (if any) preserved. Grace expiry mid-crawl aborts the round per the existing disconnect posture.
- **No ace anywhere is irrelevant to opponents**: eligibility depends only on the *declarer's* hand. Whether opponents hold aces has no bearing on whether crawl is offered.
- **Marriages and trump**: trump is never active on trick 1 (marriages may only be declared on tricks 2–6), so the crawl trick is always resolved with no trump — strictly by led suit and rank.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: At the start of trick play, when the declarer is on lead for trick 1, the server MUST determine whether the declarer's 8-card trick-start hand (post-talon-pickup, post-exchange) contains any ace. The crawl option MUST be offered to the declarer **if and only if** that hand contains zero aces.
- **FR-002**: Crawling MUST be **optional** for an ace-less declarer: the declarer MAY either crawl or lead trick 1 normally (face-up). If the declarer leads normally, trick 1 proceeds as an ordinary trick under standard follow-suit and trump rules.
- **FR-003**: When the declarer chooses to crawl, the declarer MUST be able to select **any one card** from their hand to play; the system MUST NOT auto-select or restrict which card is crawled. The selected card is placed **face-down** into the trick centre and MUST NOT be revealed to any player (including its rank/suit) until the crawl trick is fully resolved (FR-006).
- **FR-004**: After the declarer crawls, the server MUST require **each of the two opponents** to commit exactly one card from their own hand, played **face-down**, in turn order. On the crawl trick, follow-suit and trump-priority restrictions MUST be suspended — an opponent may commit any card in their hand — because the committed cards are hidden.
- **FR-005**: While the crawl is in progress, no committed card's face (rank or suit) — the declarer's or either opponent's — MUST be visible to any player. Clients MUST be able to indicate that a card has been committed (a face-down placeholder) without exposing its identity.
- **FR-006**: Once all three players have committed their face-down cards, the server MUST reveal all three simultaneously and resolve the trick by the **standard trick rules**: the declarer's crawled card sets the led suit; no trump applies on trick 1; the highest card of the led suit wins.
- **FR-007**: The winner of the crawl trick MUST collect all three played cards into their collected-tricks pile (so their card points count toward round-end scoring exactly as a normal trick) and MUST become the leader of trick 2.
- **FR-008**: From trick 2 onward, play MUST proceed entirely normally per features 004/005 — standard follow-suit, trump priority, and marriage declarations (tricks 2–6) all apply. The crawl mechanic affects **only** trick 1.
- **FR-009**: The crawl option MUST NOT be offered, and crawling MUST NOT be possible, when the declarer's trick-start hand contains one or more aces; in that case the declarer leads trick 1 normally.
- **FR-010**: All three clients MUST observe the crawl consistently: the indication that a crawl is underway, face-down committed cards (without faces), and — on reveal — the same three card faces and the same winning player.
- **FR-011**: When a four-nines bonus is awarded this hand (feature 006), the crawl offer and the entire crawl sequence MUST be gated behind the four-nines acknowledgment modal: the crawl MUST NOT begin until all three four-nines acknowledgments are recorded, consistent with feature 006 FR-003 gating the first trick lead.
- **FR-012**: The reconnect-rehydration snapshot (feature 005 FR-026 / feature 004 FR-027) MUST reflect crawl state in progress: a player reconnecting during a crawl sees that a crawl is underway, which cards have been committed (face-down, faces hidden), and their own committed card (if any) recorded as already-played (the commitment is sticky). After the crawl resolves, the snapshot reflects the resolved trick like any other.

### Key Entities

- **TrickPlay** (extended from feature 005): the first-trick state must additionally represent the crawl sub-state — whether a crawl is in progress, which seats have committed a face-down card, and the hidden card committed by each seat — and must suspend follow-suit/trump enforcement for the crawl trick only. On reveal it resolves and collects the trick exactly as the standard resolver does.
- **Declarer eligibility (derived)**: a per-hand, trick-start determination of whether the declarer holds zero aces, gating whether the crawl option is offered.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Across 100 hands in which the declarer's trick-start hand holds no ace, 100% offer the declarer the crawl option, and 0 hands in which the declarer holds at least one ace offer it.
- **SC-002**: In 100% of crawls, no client exposes any committed card's face (rank or suit) before all three cards are committed; on reveal, 100% of clients show the same three faces and the same winner within 1 second.
- **SC-003**: In 100% of resolved crawl tricks, the winner is the player whose card is highest in the declarer-led suit (no trump), the three cards' points are credited to that winner's round total, and that winner leads trick 2.
- **SC-004**: In 100% of hands where the declarer declines the crawl (or holds an ace), trick 1 plays out as a normal face-up trick with standard follow-suit enforcement, and the rest of the round is unaffected.
- **SC-005**: From trick 2 onward in 100% of crawled hands, standard follow-suit, trump-priority, and marriage rules are enforced exactly as in a non-crawled hand.

## Assumptions

- **Builds on features 004 and 005**: deal sequence (7 cards before bidding, 3 in the talon), bidding/selling, the declarer decision, card exchange, the 8-trick play loop with follow-suit/trump/marriages, and round-end scoring are all assumed implemented. This feature adds a first-trick variation on top of that loop; it does not redefine the rest.
- **Three players**: the game is three-handed (declarer plus two opponents), so a crawl trick is always exactly three face-down cards.
- **"Talon" in the description means the trick centre, not the kitty**: the user's "moved face down to talon" refers to the centre of the table where the three face-down cards accumulate and are then revealed and resolved as a trick. The committed cards are **not** added to the 3-card kitty/widow and are **not** removed from play; they form a normal trick whose points are collected by the winner (per clarification — "Normal trick: winner collects + leads").
- **Declarer freely chooses the crawled card** (per clarification): despite the description's word "random", the declarer selects any card from their hand; the system does not auto-pick. The card is hidden (face-down), which is the only sense in which it is "random" to opponents.
- **Crawling is optional** (per clarification): an ace-less declarer may crawl or lead normally; it is never forced.
- **Follow-suit is suspended for the crawl trick only**: because opponents commit blind, they cannot be required to follow suit on trick 1. From trick 2 onward all standard restrictions apply, including to any card spent on the crawl.
- **No trump on the first trick**: trump is established only via a declared marriage (tricks 2–6), so the crawl trick is always resolved with no trump.
- **Eligibility is based on the trick-start hand**: the same 8-card hand used by feature 006's four-nines check (post-talon-pickup, post-exchange) is the hand inspected for aces.
- **Disconnect/grace posture unchanged**: grace-period and reconnect handling follow features 004/005 without modification; a committed face-down card is sticky on reconnect.

## Clarifications

### Session 2026-05-21

- Q: When an ace-less declarer crawls, which card goes face-down — does the declarer choose, or does the system pick at random? → A: The declarer freely chooses any card from their hand; the card is face-down (hidden to opponents). (Encoded in FR-003 and Assumptions.)
- Q: Is crawling optional or forced for an ace-less declarer? → A: Optional — the declarer may crawl or lead trick 1 normally. (Encoded in FR-002, US2 AS-2.)
- Q: After the three face-down cards are revealed, how does the trick resolve — as a normal trick the winner collects, or are the cards discarded to the kitty? → A: Normal trick: declarer's card sets the led suit, no trump on trick 1, highest led-suit card wins, winner collects the three cards (points count) and leads trick 2; follow-suit is suspended because cards are committed blind. (Encoded in FR-004, FR-006, FR-007, and Assumptions.)
