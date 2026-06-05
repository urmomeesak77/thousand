// ============================================================
// historyEntryText — pure formatter turning a HistoryEntry into
// a display string for the history panel (feature 012). Seats are
// resolved to nicknames at render time so a name change never
// corrupts a stored entry (FR-016).
// ============================================================

// Resolve a seat to its current nickname, falling back to a stable seat label.
function seatName(seat, seats) {
  const player = seats?.players?.find((p) => p.seat === seat);
  return player?.nickname || `Seat ${seat}`;
}

function signed(value) {
  return value > 0 ? `+${value}` : String(value);
}

function roundScoreText(entry, seats) {
  const { perSeat } = entry.data;
  const parts = Object.keys(perSeat)
    .map(Number)
    .sort((a, b) => a - b)
    .map((seat) => `${seatName(seat, seats)} ${signed(perSeat[seat])}`);
  return `Round ${entry.roundNumber}: ${parts.join(', ')}`;
}

function historyEntryText(entry, seats) {
  const who = seatName(entry.seat, seats);
  switch (entry.kind) {
    case 'bid': return `${who} bid ${entry.data.amount}`;
    case 'pass': return `${who} passed`;
    case 'sell-start': return `${who} put the contract up for sale`;
    case 'sell-bid': return `${who} bid ${entry.data.amount} to buy`;
    case 'sell-pass': return `${who} passed on buying`;
    case 'sell-sold': return `Contract sold to ${who} (${entry.data.amount})`;
    case 'sell-returned': return `Contract returned to ${who}`;
    case 'marriage': return `${who} declared ${entry.data.suit} marriage (+${entry.data.bonus})`;
    case 'trick': return `Trick ${entry.data.trickNumber} won by ${who}`;
    case 'round-score': return roundScoreText(entry, seats);
    case 'four-nines': return `${who} — four nines bonus ${signed(entry.data.amount)}`;
    case 'barrel': return `${who} — barrel penalty ${signed(entry.data.amount)}`;
    case 'zeros': return `${who} — three zeros penalty ${signed(entry.data.amount)}`;
    default: return '';
  }
}

export default historyEntryText;
