import CardSprite from './CardSprite.js';

const HAND_AFTER_SELL_TAKE = 10;
const HAND_AFTER_EXPOSE = 7;
const SPRITE_OFFSET = 18;
const SPRITE_ANIM_MS = 300;

class SellPhaseView {
  constructor(gameScreen) {
    this._gs = gameScreen;
  }

  initFromSnapshot(msg) {
    if (msg.gameStatus.phase !== 'Selling') {
      return;
    }
    const gs = this._gs;
    if (msg.exposed && msg.exposed.length > 0) {
      gs._sellSubPhase = 'bidding';
      gs._exposedCardIds = msg.exposedSellCardIds ?? msg.exposed.map((c) => c.id);
    } else {
      gs._sellSubPhase = 'selection';
    }
  }

  enterSellSelection(gameStatus) {
    const gs = this._gs;
    gs._sellSubPhase = 'selection';
    gs._sellWinnerNickname = null;
    gs._lastGameStatus = gameStatus;
    gs._renderStatus(gameStatus);
    if (!gs._isControlsLocked) {gs._controls.mountForPhase(gameStatus);}
  }

  enterSellBidding(msg) {
    const gs = this._gs;
    const { declarerId, exposedIds, identities, gameStatus } = msg;

    if (identities) {
      for (const id of exposedIds) {
        const ident = identities[String(id)];
        if (ident) {gs._cardsById[id] = { id, ...ident };}
      }
    }

    gs._exposedCardIds = [...exposedIds];
    gs._sellSubPhase = 'bidding';
    gs._renderStatus(gameStatus);
    gs._lastGameStatus = gameStatus;
    gs._isControlsLocked = true;

    gs._handView.setSelectionMode(false);
    gs._controls.clearSellSelection();
    gs._controlsEl.textContent = '';

    const viewerSeat = gs._seats?.self;
    const declarerSeat = gs._seatOf(declarerId);
    const viewerIsDeclarer = viewerSeat === declarerSeat;

    if (viewerIsDeclarer) {
      const exposed = new Set(exposedIds);
      gs._handView.setHand(Object.values(gs._cardsById).filter(c => !exposed.has(c.id)));
    } else {
      gs._opponentForSeat(declarerSeat)?.setCardCount(HAND_AFTER_EXPOSE);
    }

    const slots = gs._cardTable.slotsForSeat(viewerSeat);
    const fromSlot = (declarerSeat != null ? slots[declarerSeat] : null) ?? gs._cardTable.getSlot('talon');
    const toSlot = gs._cardTable.getSlot('talon');

    this._animateSprites(exposedIds, fromSlot, toSlot, () => {
      const talonCards = exposedIds.map(id => gs._cardsById[id]).filter(Boolean);
      gs._talonView.setCards(talonCards);
      gs._isControlsLocked = false;
      gs._controls.mountForPhase(gs._lastGameStatus);
    });
  }

  exitSelling(msg) {
    const gs = this._gs;
    const { outcome, oldDeclarerId, newDeclarerId, exposedIds, gameStatus } = msg;
    const viewerSeat = gs._seats?.self;

    gs._renderStatus(gameStatus);
    gs._lastGameStatus = gameStatus;
    gs._isControlsLocked = true;

    gs._handView.setSelectionMode(false);
    gs._controls.clearSellBid();
    gs._controls.clearSellSelection();
    gs._controlsEl.textContent = '';

    const oldDeclarerSeat = gs._seatOf(oldDeclarerId);
    const newDeclarerSeat = newDeclarerId ? gs._seatOf(newDeclarerId) : null;

    const slots = gs._cardTable.slotsForSeat(viewerSeat);
    const talonSlot = gs._cardTable.getSlot('talon');
    const destSeat = outcome === 'sold' ? newDeclarerSeat : oldDeclarerSeat;
    const destSlot = (destSeat != null ? slots[destSeat] : null) ?? talonSlot;

    gs._talonView.clear();

    this._animateSprites(exposedIds, talonSlot, destSlot, () => {
      this._applySellResolved(outcome, exposedIds, oldDeclarerSeat, newDeclarerSeat, viewerSeat);
      gs._sellSubPhase = null;
      gs._exposedCardIds = [];
      gs._isControlsLocked = false;
      gs._renderStatus(gs._lastGameStatus);
      gs._controls.mountForPhase(gs._lastGameStatus);
    });
  }

  _applySellResolved(outcome, exposedIds, oldDeclarerSeat, newDeclarerSeat, viewerSeat) {
    const gs = this._gs;
    if (outcome === 'returned') {
      if (viewerSeat === oldDeclarerSeat) {
        gs._handView.setHand(Object.values(gs._cardsById));
      } else {
        for (const id of exposedIds) {delete gs._cardsById[id];}
        gs._opponentForSeat(oldDeclarerSeat)?.setCardCount(HAND_AFTER_SELL_TAKE);
      }
    } else if (outcome === 'sold') {
      gs._viewerIsNewDeclarer = (viewerSeat === newDeclarerSeat);
      const winnerPlayer = gs._seats?.players.find(p => p.seat === newDeclarerSeat);
      const winnerNickname = winnerPlayer?.nickname;
      const winnerAmount = gs._lastGameStatus?.currentHighBid;
      gs._sellWinnerNickname = winnerNickname
        ? `${winnerNickname}${winnerAmount != null ? ` (${winnerAmount})` : ''}`
        : null;
      if (viewerSeat === newDeclarerSeat) {
        gs._handView.setHand(Object.values(gs._cardsById));
      } else {
        for (const id of exposedIds) {delete gs._cardsById[id];}
        if (viewerSeat === oldDeclarerSeat) {
          gs._handView.setHand(Object.values(gs._cardsById));
        }
      }
      gs._opponentForSeat(newDeclarerSeat)?.setCardCount(HAND_AFTER_SELL_TAKE);
      gs._opponentForSeat(oldDeclarerSeat)?.setCardCount(HAND_AFTER_EXPOSE);
    }
  }

  absorbTalon(msg) {
    const gs = this._gs;
    const { declarerId, talonIds, identities, gameStatus } = msg;
    const viewerSeat = gs._seats?.self;
    const declarerSeat = gs._seatOf(declarerId);
    const viewerIsDeclarer = viewerSeat === declarerSeat;

    gs._renderStatus(gameStatus);
    gs._lastGameStatus = gameStatus;
    gs._isControlsLocked = true;

    // Remove the static talon sprites so they don't stay visible during animation
    gs._talonView.clear();

    const talonSlot = gs._cardTable.getSlot('talon');
    const slots = gs._cardTable.slotsForSeat(viewerSeat);
    const destSlot = slots[declarerSeat] ?? talonSlot;

    this._animateSprites(talonIds, talonSlot, destSlot, () => {
      if (viewerIsDeclarer) {
        if (identities) {
          for (const id of talonIds) {
            const identity = identities[String(id)];
            if (identity) {gs._cardsById[id] = { id, ...identity };}
          }
        }
        gs._handView.setHand(Object.values(gs._cardsById));
      } else {
        for (const id of talonIds) {
          delete gs._cardsById[id];
        }
        gs._opponentForSeat(declarerSeat)?.setCardCount(HAND_AFTER_SELL_TAKE);
      }
      gs._isControlsLocked = false;
      gs._controls.mountForPhase(gs._lastGameStatus);
    });
  }

  _animateSprites(ids, fromSlot, toSlot, onComplete) {
    const gs = this._gs;
    const sprites = ids.map((id, i) => {
      const sprite = new CardSprite(id);
      sprite.setFace('up');
      const identity = gs._cardsById[id];
      if (identity) {sprite.setIdentity(identity);}
      sprite.setPosition(fromSlot.x + i * SPRITE_OFFSET, fromSlot.y);
      gs._tableEl.appendChild(sprite.element);
      sprite.setPosition(toSlot.x + i * SPRITE_OFFSET, toSlot.y, SPRITE_ANIM_MS);
      return sprite;
    });

    const cancelTick = gs._antlion.onTick(() => {
      let anyAnimating = false;
      for (const sprite of sprites) {
        if (sprite.update()) {anyAnimating = true;}
      }
      if (anyAnimating) {return;}
      cancelTick();
      for (const sprite of sprites) {sprite.element.remove();}
      onComplete();
    });
  }
}

export default SellPhaseView;
