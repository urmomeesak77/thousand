# Thousand (1000)

A real-time, 3-player web implementation of the classic European trick-taking card game **Thousand** (Tysiącha). First player to **1000 points** wins.

## Game Rules

**Deck:** 24 cards — 9, 10, J, Q, K, A in each of the four suits. 3 players.

**Card values (trick points):**

| A | 10 | K | Q | J | 9 |
|---|----|---|---|---|---|
| 11 | 10 | 4 | 3 | 2 | 0 |

### Round flow

1. **Deal** — 7 cards to each player; 3 cards go face-down to the *talon*.
2. **Bidding** — starting left of the dealer, players bid in steps of 5 from a minimum of **100** up to **300**. Pass once and you're out. Highest bidder becomes the **declarer**. If all pass, the dealer is declarer at 100.
3. **Talon** — the declarer takes the 3 talon cards (now holding 10).
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
