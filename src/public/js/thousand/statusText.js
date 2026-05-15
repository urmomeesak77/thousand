export const computeStatusText = (gameStatus, ctx) => {
  const { phase, viewerIsActive, activePlayer, declarer } = gameStatus;
  if (phase === 'Bidding') {
    if (viewerIsActive) {return { text: 'Your turn', isActive: true };}
    return { text: `Waiting for ${activePlayer?.nickname ?? '…'}`, isActive: false };
  }
  if (phase === 'Declarer deciding') {
    if (viewerIsActive) {
      if (ctx.viewerIsNewDeclarer) {return { text: 'Start the game', isActive: true };}
      return { text: 'Take the talon or sell?', isActive: true };
    }
    const name = declarer?.nickname ?? activePlayer?.nickname ?? '…';
    return { text: `Waiting for ${name}`, isActive: false };
  }
  if (phase === 'Selling') {
    if (ctx.sellSubPhase === 'selection') {
      if (viewerIsActive) {return { text: 'Choose 3 cards to show', isActive: true };}
      return { text: `Waiting for ${declarer?.nickname ?? '…'} to choose cards`, isActive: false };
    }
    if (viewerIsActive) {return { text: 'Your turn', isActive: true };}
    return { text: `Waiting for ${activePlayer?.nickname ?? '…'}`, isActive: false };
  }
  if (phase === 'Card exchange') {
    if (viewerIsActive) {return { text: 'Pass a card to each opponent', isActive: true };}
    return { text: `Waiting for ${declarer?.nickname ?? '…'} to pass cards`, isActive: false };
  }
  if (phase === 'Trick play') {
    if (viewerIsActive) {return { text: 'Your turn', isActive: true };}
    return { text: `Waiting for ${activePlayer?.nickname ?? '…'}`, isActive: false };
  }
  if (phase === 'Round complete') {
    return { text: 'Round complete', isActive: false };
  }
  if (phase === 'Game over') {
    return { text: 'Game over', isActive: false };
  }
  if (phase === 'Game aborted') {
    return { text: 'Game aborted', isActive: false };
  }
  return { text: '', isActive: false };
};
