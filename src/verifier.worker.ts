import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

import { GAME_SALT } from './constants';
import { gameResult } from './utils/math';

export type GameResult = {
  id: number;
  crashPoint: number;
  verified: boolean;
  hash: string;
};

export interface VerificationValues {
  gameHash: string;
  gameNumber: number;
  iterations: number;
  verifyChain: boolean;
}

// Contains the logic to verify game results and the terminating hash.
// It sends results to the main thread, which listens to messages from the worker.
// Note: it can only verify games from either the current or the previous hash-chain at a time.
async function calculateResults(
  gameNumber: number,
  gameHashHex: string,
  iterations: number,
  verifyChain: boolean
) {
  const chainStart = 10000000;

  let gameHash = hexToBytes(gameHashHex);
  let gameId = gameNumber - 1;

  for (; gameId >= chainStart; gameId--) {
    const currentGameHash = gameHash;

    gameHash = sha256(bytesToHex(gameHash));
    let crashPoint = 0;
    let verified = false;

    // only compute the game results we need
    if (iterations-- > 0) {
      crashPoint = gameResult(GAME_SALT, currentGameHash);
      sendGameResult({
        id: gameId + 1,
        crashPoint,
        verified,
        hash: bytesToHex(currentGameHash),
      });

      if (iterations === 0 || gameId === chainStart) {
        sendDoneSignal();
        if (!verifyChain) {
          break;
        }
      }
    }
  }

  if (verifyChain) {
    sendTerminatingHash(bytesToHex(gameHash));
  }
}

self.addEventListener(
  'message',
  async ({
    data: { gameHash, gameNumber, iterations, verifyChain },
  }: MessageEvent<VerificationValues>) => {
    await calculateResults(gameNumber, gameHash, iterations, verifyChain);
  }
);

function sendDoneSignal() {
  self.postMessage({
    done: true,
  });
}

function sendGameResult(gameResult: GameResult) {
  self.postMessage({
    gameResult,
  });
}

function sendTerminatingHash(terminatingHash: string) {
  self.postMessage({
    terminatingHash,
  });
}
