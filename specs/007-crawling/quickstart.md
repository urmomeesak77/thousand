# Quickstart: Crawling

Manual end-to-end verification of the crawl mechanic with three browsers. Crawl requires the **declarer to hold no ace** at trick-play start — astronomically rare in a fair deal — so use the deterministic deck seam.

## Prerequisites

- `npm install` done; no build step (constitution §V).
- Three browser windows/tabs (or the `thousand-live-e2e` skill for an automated run).

## 1. Start the server with the no-ace-declarer deck seam

The seam is inert in production and only activates when `THOUSAND_STACK_DECK` is set (mirrors the `four-nines` seam in `Round._stackedDeckForTest`). The `no-ace-declarer` mode places all four aces on the two non-declarer seats and keeps them out of the talon, so the intended declarer holds no ace through the talon pickup and the exchange.

```powershell
$env:THOUSAND_STACK_DECK = 'no-ace-declarer'   # forces an ace-less hand for the intended declarer seat
npm start                                       # http://localhost:3000
```

Unset it afterwards (`Remove-Item Env:THOUSAND_STACK_DECK`) to return to fair deals.

## 2. Seat three players and drive to trick play

1. Open three tabs, set nicknames, create/join one game (host + 2 joiners).
2. Bid so the **ace-less seat declares** (the seam documents which seat is ace-less). Complete the declarer decision and the two-card exchange.
3. Trick play begins. If a four-nines bonus also fires (independent), acknowledge it on all three tabs first — the crawl offer appears only after the gate clears (FR-011).

## 3. Verify the crawl offer (US1 / US2)

- ✅ The declarer's tab shows a **Crawl / Lead normally** choice (FR-002). Opponent tabs show no such choice.
- ✅ If you instead seat an ace-holding declarer (run without the seam, or with a seam mode that gives the declarer an ace), **no** crawl offer appears and the declarer simply leads face-up (FR-009).

## 4. Crawl and steal (US1)

1. On the declarer's tab, choose **Crawl** and click any card. It goes **face-down** to the centre; no tab shows its face (FR-003, FR-005).
2. ✅ Each opponent tab is prompted to **commit a card face-down**. Commit any card on each — including an off-suit card to confirm follow-suit is suspended (FR-004). Each placeholder appears face-down on all tabs.
3. After the third commit, ✅ all three tabs **reveal** the same three faces and the same **winner** within ~1 s (FR-006, SC-002). The winner's collected-tricks stack gains the three cards and the winner is on lead for trick 2 (FR-007).

## 5. Verify trick 2 is normal (US1)

- ✅ From trick 2 on, follow-suit and trump priority are enforced again for everyone, including any off-suit card an opponent spent on the crawl (FR-008). Marriages are offerable on tricks 2–6 as usual.
- ✅ Round-end scoring counts the crawl trick's points for whoever won it; the round summary and history look exactly like a normal hand (research Decision 7).

## 6. Decline path (US2)

Restart, force an ace-less declarer again, but on the declarer's tab choose **Lead normally** and play a card face-up.
- ✅ The crawl offer disappears; trick 1 proceeds as an ordinary face-up trick with standard follow-suit enforcement (FR-002). The rest of the round is unaffected.

## 7. Reconnect mid-crawl (FR-012)

During an active crawl (after at least one commit, before the third), close and reopen one tab.
- ✅ On reconnect, the tab shows the crawl is underway, which seats have committed (face-down, no faces), and — if that player had already committed — their **own** committed card preserved (sticky). Other players' faces stay hidden until the third commit.

## Automated checks

```powershell
npm test         # includes Scoring.crawl, TrickPlay.crawl, Round.crawl, round-messages.crawl, CrawlControls
npm run lint
```

All green and coverage ≥ 90% before opening the PR.
