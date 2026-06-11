// ============================================================
// historyEntryText — pure formatter turning a HistoryEntry into
// a display string for the history panel (feature 012). Seats are
// resolved to nicknames at render time so a name change never
// corrupts a stored entry (FR-016). Wording resolves through the
// passed t() so retained entries re-word on a language switch
// (feature 013, FR-011); names/suit symbols ride as params (FR-012).
// ============================================================

// Resolve a seat to its current nickname, falling back to a stable seat label.
function seatName(t, seat, seats) {
  const player = seats?.players?.find((p) => p.seat === seat);
  return player?.nickname || t('history.seatFallback', { seat });
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function roundScoreText(t, entry, seats) {
  const { perSeat } = entry.data;
  const parts = Object.keys(perSeat)
    .map(Number)
    .sort((a, b) => a - b)
    .map((seat) => `${seatName(t, seat, seats)} ${signed(perSeat[seat])}`);
  return t('history.roundScore', { round: entry.roundNumber, parts: parts.join(', ') });
}

function historyEntryText(t, entry, seats) {
  const name = seatName(t, entry.seat, seats);
  switch (entry.kind) {
    case 'bid': return t('history.bid', { name, amount: entry.data.amount });
    case 'pass': return t('history.pass', { name });
    case 'sell-start': return t('history.sellStart', { name });
    case 'sell-bid': return t('history.sellBid', { name, amount: entry.data.amount });
    case 'sell-pass': return t('history.sellPass', { name });
    case 'sell-sold': return t('history.sellSold', { name, amount: entry.data.amount });
    case 'sell-returned': return t('history.sellReturned', { name });
    case 'marriage':
      return t('history.marriage', { name, suit: entry.data.suit, bonus: entry.data.bonus });
    case 'trick': return t('history.trick', { number: entry.data.trickNumber, name });
    case 'round-score': return roundScoreText(t, entry, seats);
    case 'four-nines': return t('history.fourNines', { name, amount: signed(entry.data.amount) });
    case 'barrel': return t('history.barrel', { name, amount: signed(entry.data.amount) });
    case 'zeros': return t('history.zeros', { name, amount: signed(entry.data.amount) });
    default: return '';
  }
}

export default historyEntryText;
