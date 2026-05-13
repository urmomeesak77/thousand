// ============================================================
// BidControls — bid input + ±5 steppers + Bid + Pass per FR-028
// ============================================================

import BiddingControls from './BiddingControls.js';
import { MIN_BID } from './constants.js';

class BidControls extends BiddingControls {
  constructor(container, antlion, dispatcher) {
    super(container, antlion, {
      containerClass: 'bid-controls',
      defaultBid: MIN_BID,
      eventPrefix: 'bid',
      onBid: (amount) => dispatcher.sendBid(amount),
      onPass: () => dispatcher.sendPass(),
    });
  }

  setActiveState({ isActiveBidder, isEligible }) {
    this.setActive(isActiveBidder, isEligible);
  }
}

export default BidControls;
