// Pure status-line formatter: phase/turn labels resolve through i18n keys,
// player names ride as params and are never translated (FR-012).
export const computeStatusText = (t, gameStatus, ctx) => {
  const { phase, viewerIsActive, activePlayer, declarer } = gameStatus;
  const activeName = activePlayer?.nickname ?? '…';
  if (phase === 'Bidding') {
    if (viewerIsActive) {return { text: t('status.yourTurn'), isActive: true };}
    return { text: t('status.waitingFor', { name: activeName }), isActive: false };
  }
  if (phase === 'Declarer deciding') {
    if (viewerIsActive) {
      if (ctx.viewerIsNewDeclarer) {return { text: t('status.startGame'), isActive: true };}
      return { text: t('status.takeOrSell'), isActive: true };
    }
    const name = declarer?.nickname ?? activeName;
    return { text: t('status.waitingFor', { name }), isActive: false };
  }
  if (phase === 'Selling') {
    if (ctx.sellSubPhase === 'selection') {
      if (viewerIsActive) {return { text: t('status.chooseCards'), isActive: true };}
      return {
        text: t('status.waitingChooseCards', { name: declarer?.nickname ?? '…' }),
        isActive: false,
      };
    }
    if (viewerIsActive) {return { text: t('status.yourTurn'), isActive: true };}
    return { text: t('status.waitingFor', { name: activeName }), isActive: false };
  }
  if (phase === 'Card exchange') {
    if (viewerIsActive) {return { text: t('status.passCards'), isActive: true };}
    return {
      text: t('status.waitingPassCards', { name: declarer?.nickname ?? '…' }),
      isActive: false,
    };
  }
  if (phase === 'Trick play') {
    if (viewerIsActive) {return { text: t('status.yourTurn'), isActive: true };}
    return { text: t('status.waitingFor', { name: activeName }), isActive: false };
  }
  if (phase === 'Round complete') {
    return { text: t('status.roundComplete'), isActive: false };
  }
  if (phase === 'Game over') {
    return { text: t('status.gameOver'), isActive: false };
  }
  if (phase === 'Game aborted') {
    return { text: t('status.gameAborted'), isActive: false };
  }
  return { text: '', isActive: false };
};
