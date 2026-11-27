import { deserialize, serialize } from '../sim/save';
import type { GameState } from '../sim/types';

/**
 * Hand-over codes (PRD v2 F14): a save as a compact text code, so a friend can take over the shift.
 * No backend: the code is the save, compressed with gzip when the browser can, then base64url.
 */
const PREFIX_GZ = 'DCM2:';
const PREFIX_RAW = 'DCM2U:';

const toB64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromB64 = (text: string): Uint8Array => {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeHandover(s: GameState): Promise<string> {
  const bytes = new TextEncoder().encode(serialize(s));
  if (typeof CompressionStream !== 'undefined') {
    try {
      return PREFIX_GZ + toB64(await pipe(bytes, new CompressionStream('gzip')));
    } catch {
      /* fall through to the uncompressed form */
    }
  }
  return PREFIX_RAW + toB64(bytes);
}

export async function decodeHandover(code: string): Promise<GameState> {
  const text = code.trim().replace(/\s+/g, '');
  if (text.startsWith(PREFIX_GZ)) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot unpack the code.');
    const bytes = await pipe(fromB64(text.slice(PREFIX_GZ.length)), new DecompressionStream('gzip'));
    return deserialize(new TextDecoder().decode(bytes));
  }
  if (text.startsWith(PREFIX_RAW)) return deserialize(new TextDecoder().decode(fromB64(text.slice(PREFIX_RAW.length))));
  throw new Error('That does not look like a hand-over code.');
}
