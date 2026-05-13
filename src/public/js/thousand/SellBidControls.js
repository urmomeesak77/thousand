// ============================================================
// SellBidControls — opponent buy controls for the selling phase per FR-028
// ============================================================

import BiddingControls from './BiddingControls.js';
import { MIN_SELL_BID } from './constants.js';

class SellBidControls extends BiddingControls {
  constructor(container, antlion, dispatcher) {
    super(container, antlion, {
      containerClass: 'sell-bid-controls',
      defaultBid: MIN_SELL_BID,
      eventPrefix: 'sell-bid',
      onBid: (amount) => dispatcher.sendSellBid(amount),
      onPass: () => dispatcher.sendSellPass(),
    });
  }

  setActiveState({ isActiveSeller, isEligible }) {
    this.setActive(isActiveSeller, isEligible);
  }
}

export default SellBidControls;
