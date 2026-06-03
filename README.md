# Thousand (1000)

A real-time, web implementation of the classic European trick-taking card game **Thousand** (Tysiącha), playable with **3 or 4 players**. First player to **1000 points** wins.

## Game Rules

**Deck:**

- **3 players** — 24 cards: 9, 10, J, Q, K, A in each of the four suits.
- **4 players** — 32 cards: the above plus 7 and 8 in each suit (both worth **0** points). In a 4-player round the declarer takes a **4-card talon** (holding 11), then passes one card to each of the three opponents.

**Card values (trick points):**

| A | 10 | K | Q | J | 9 |
|---|----|---|---|---|---|
| 11 | 10 | 4 | 3 | 2 | 0 |

### Round flow

1. **Deal** — 7 cards to each player; the remaining cards go face-down to the *talon* (3 cards with 3 players, 4 cards with 4 players).
2. **Bidding** — starting left of the dealer, players bid in steps of 5 from a minimum of **100** up to **300**. Pass once and you're out. Highest bidder becomes the **declarer**. If everyone else passes, the last remaining player is declarer at 100.
3. **Talon** — the declarer takes the talon cards.
4. **Selling (optional)** — the declarer may try to sell the bid up to 3 times by exposing 3 cards; an opponent can buy by bidding higher and becomes the new declarer.
5. **Card exchange** — the declarer passes 1 card to each opponent (everyone then holds 8).
6. **Trick play** — 8 tricks. The declarer leads the first; the winner of each trick leads the next.
   - You **must follow suit** if you can.
   - If you can't follow suit, you **must play trump** (if any has been declared and you hold one).
   - Highest trump wins; otherwise the highest card of the led suit wins.

### Marriages & trump

A **marriage** is the King + Queen of the same suit. While leading a trick on **tricks 2–6** (and holding at least 3 cards), playing the K or Q of a held marriage declares that suit as **trump** and scores a bonus:

| ♣ Clubs | ♠ Spades | ♥ Hearts | ♦ Diamonds |
|---------|----------|----------|------------|
| 100 | 80 | 60 | 40 |

A later marriage replaces the current trump. You may hold a marriage without declaring it.

### Four nines

If any player's 8-card hand holds **all four 9s** when trick play is about to begin, that player is automatically awarded a **+100** bonus on top of whatever they earn (or lose) during the hand.

### Crawling

If the declarer's trick-start hand contains **no ace**, they may *crawl* the first trick: instead of leading face-up, they play one card **face-down**. Each opponent then commits one of their own cards face-down, gambling on stealing the trick. Once all face-down cards are committed they are revealed simultaneously and the trick is resolved by the standard rules (the declarer's card sets the led suit; no trump applies on the first trick). A declarer holding any ace cannot crawl.

### Scoring

- **Round total** = trick points + declared marriage bonuses.
- **Declarer:** total ≥ bid → gain the **bid amount**; total < bid → **lose** the bid amount (scores can go negative).
- **Opponents:** gain their own round total.

### Special rules

- **Barrel (880–999):** a player in this range must bid at least **120** and has **3 rounds** to reach 1000. Failing that, they lose **120** and drop off the barrel.
- **Three consecutive zeros:** scoring 0 in 3 rounds in a row costs a **120** penalty.

### Winning

The first player to reach **1000+** wins, at the end of that round. Ties are broken by highest score, then declarer position.

> Full rulebook: [`docs/1000_Card_Game_Rules.txt`](docs/1000_Card_Game_Rules.txt)

## Running

```bash
npm start    # http://localhost:3000  (or $PORT)
npm test     # run the test suite
npm run lint # lint src/
```

No build step — vanilla JS frontend (ES modules) and a Node.js + WebSocket backend.
