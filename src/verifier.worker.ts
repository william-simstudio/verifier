import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils';

import { GAME_SALT, PREV_GAME_SALT, PREV_CHAIN_LENGTH } from './constants';
import { gameResult } from './utils/math';
import { getVxSignature } from './utils/vx';

export type GameResult = {
  id: number;
  bust: number;
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
  const isPreviousChain = gameNumber < PREV_CHAIN_LENGTH;
  const chainStart = isPreviousChain ? 1 : PREV_CHAIN_LENGTH + 1;

  let gameHash = hexToBytes(gameHashHex);
  let gameId = gameNumber;

  for (; gameId >= chainStart; gameId--) {
    const currentGameHash = gameHash;

    if (isPreviousChain) {
      // hash of the hex-encoded value
      gameHash = sha256(bytesToHex(gameHash));
    } else {
      // hash of the binary value
      gameHash = sha256(gameHash);
    }

    let bust = 0;
    let verified = false;

    // only compute the game results we need
    if (iterations-- > 0) {
      if (isPreviousChain) {
        bust = gameResult(PREV_GAME_SALT, currentGameHash);
      } else {
        const vxSignature = await getVxSignature(
          gameId,
          GAME_SALT,
          currentGameHash
        );
        if (!vxSignature) {
          sendDoneSignal();
          sendError();
          break;
        }
        verified = vxSignature.verified;
        bust = gameResult(vxSignature.signature, currentGameHash);
      }

      sendGameResult({
        id: gameId,
        bust,
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

function sendError() {
  self.postMessage({
    failed: true,
  });
}

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
