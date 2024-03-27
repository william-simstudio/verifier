import { bls12_381 as bls } from '@noble/curves/bls12-381';
import { sha256 } from '@noble/hashes/sha256';
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  utf8ToBytes,
} from '@noble/hashes/utils';

import { APP_SLUG, COMMITMENT, VX_PUB_KEY } from '../constants';

export async function getVxSignature(
  gameId: number,
  clientSeed: string,
  gameHash: Uint8Array
) {
  const vxData = await getVxData(APP_SLUG, gameId, COMMITMENT);
  if (!vxData) {
    return null;
  }

  const message = concatBytes(sha256(gameHash), utf8ToBytes(clientSeed));
  const signature = hexToBytes(vxData.vx_signature);
  const verified =
    bytesToHex(message) === vxData.message &&
    bls.verify(signature, message, hexToBytes(VX_PUB_KEY));

  return {
    signature,
    verified,
  };
}

async function getVxData(appSlug: string, index: number, commitment: string) {
  const query = `
    query AppsMessagesByIndex($appSlug: String!, $index: Int!, $commitment: String!) {
      appBySlug(slug: $appSlug) {
        id
        name
        vx {
          messagesByIndex(commitment: $commitment, index: $index) {
            vx_signature
            message
          }
        }
      }
    }
  `;

  const response = await fetch('https://server.actuallyfair.com/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      variables: {
        appSlug,
        index,
        commitment,
      },
    }),
  });

  if (response.status !== 200) {
    console.error(
      'Looks like there was a Vx lookup error. Status code: ' +
        response.status +
        ', response body: ' +
        (await response.text())
    );
    return null;
  }

  const json = await response.json();
  if (json.errors) {
    console.error('There was a Vx error: ' + json.errors[0].message);
    return null;
  }

  return json.data?.appBySlug?.vx?.messagesByIndex?.[0];
}
