import type { BridgeMessage } from "./types.js";

/** Chrome Native Messaging: 4-byte little-endian length + UTF-8 JSON */
export function encodeNativeMessage(message: BridgeMessage): Buffer {
  const json = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return Buffer.concat([header, json]);
}

export function createNativeMessageReader(
  onMessage: (msg: BridgeMessage) => void,
  onError?: (err: Error) => void,
): (chunk: Buffer) => void {
  let buffer = Buffer.alloc(0);

  return (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const len = buffer.readUInt32LE(0);
      if (len > 1024 * 1024) {
        onError?.(new Error(`Native message too large: ${len}`));
        buffer = Buffer.alloc(0);
        return;
      }
      if (buffer.length < 4 + len) return;
      const body = buffer.subarray(4, 4 + len);
      buffer = buffer.subarray(4 + len);
      try {
        const parsed = JSON.parse(body.toString("utf8")) as BridgeMessage;
        onMessage(parsed);
      } catch (e) {
        onError?.(e instanceof Error ? e : new Error(String(e)));
      }
    }
  };
}

export function parseBridgeMessage(raw: string): BridgeMessage {
  return JSON.parse(raw) as BridgeMessage;
}
