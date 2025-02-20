import { Address, BytesReader, BytesWriter } from '@btc-vision/btc-runtime/runtime';

// TODO: doublecheck return types
export class Call {
  public constructor(
    public readonly target: Address,
    public readonly callData: BytesWriter,
  ) {}
}

export class Result {
  public constructor(
    public readonly returnData: BytesReader,
    public readonly returnDataLength: u64,
  ) {}
}

export class AggregateCallResult {
  public constructor(
    public readonly totalLength: u64,
    public readonly results: Result[],
  ) {}
}

/**
 * Writes an array of `Result`s to a `BytesWriter`
 *
 * Writes a `u64` array of return data lengths (`u16` length, then a bunch of `u64`s)
 * Following that are all the responses as raw bytes. First the boolean success, then whatever the call returned.
 *
 */
export function writeResultArrayToBytesWriter(bw: BytesWriter, results: Result[]): BytesWriter {
  let returnDataByteLengths: u64[] = [];
  for (let i = 0; i < results.length; i++) {
    returnDataByteLengths.push(results[i].returnDataLength);
  }
  bw.writeU64Array(returnDataByteLengths);

  // write the return data as just bytes to the BytesWriter
  // The initial boolean is just a single byte, so we can abstract it away in the ABI
  for (let i = 0; i < results.length; i++) {
    bw.writeBytes(results[i].returnData.readBytes(i32(results[i].returnDataLength)));
  }

  return bw;
}
