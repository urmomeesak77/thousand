'use strict';

function isNicknameTaken(players, nick, excludePlayerId) {
  const lower = nick.toLowerCase();
  for (const [pid, player] of players) {
    if (pid === excludePlayerId) {continue;}
    if (player.nickname && player.nickname.toLowerCase() === lower) {return true;}
  }
  return false;
}

module.exports = { isNicknameTaken };
