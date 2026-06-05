// ============================================================
// TurnReminder — while it is the local player's turn, replays the
// wakeup cue every 30s until they act. Armed/disarmed on the edges
// of viewerIsActive; emits sound:wakeup (a no-op when muted).
// ============================================================

const REMINDER_INTERVAL_MS = 30000;

class TurnReminder {
  constructor(antlion) {
    this._antlion = antlion;
    this._timerId = null;
  }

  // Drive from each status render: arm on the inactive→active edge,
  // disarm on active→inactive. Idempotent in both directions.
  update(isViewerActive) {
    if (isViewerActive) {
      this._arm();
    } else {
      this.stop();
    }
  }

  _arm() {
    if (this._timerId !== null) {
      return;
    }
    this._timerId = this._antlion.scheduleInterval(
      REMINDER_INTERVAL_MS,
      () => this._antlion.emit('sound:wakeup'),
    );
  }

  stop() {
    if (this._timerId === null) {
      return;
    }
    this._antlion.cancelInterval(this._timerId);
    this._timerId = null;
  }
}

export default TurnReminder;
