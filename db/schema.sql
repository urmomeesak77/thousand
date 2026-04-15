CREATE TABLE IF NOT EXISTS games (
  id          CHAR(6)                              NOT NULL,
  type        ENUM('public', 'private')            NOT NULL,
  host_id     CHAR(36)                             NOT NULL,
  max_players TINYINT UNSIGNED                     NOT NULL DEFAULT 4,
  status      ENUM('waiting', 'playing', 'finished') NOT NULL DEFAULT 'waiting',
  invite_code CHAR(6)                              NULL,
  created_at  BIGINT UNSIGNED                      NOT NULL,
  PRIMARY KEY (id),
  UNIQUE  KEY uq_invite_code (invite_code)
);

-- Players table excludes the `ws` field (live socket — never persisted)
CREATE TABLE IF NOT EXISTS players (
  id        CHAR(36)    NOT NULL,
  nickname  VARCHAR(20) NULL,
  game_id   CHAR(6)     NULL,
  PRIMARY KEY (id)
);

-- Junction table replaces the in-memory Set<playerId> on each game
CREATE TABLE IF NOT EXISTS game_players (
  game_id    CHAR(6)         NOT NULL,
  player_id  CHAR(36)        NOT NULL,
  joined_at  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (game_id, player_id),
  CONSTRAINT fk_gp_game   FOREIGN KEY (game_id)   REFERENCES games(id)   ON DELETE CASCADE,
  CONSTRAINT fk_gp_player FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
