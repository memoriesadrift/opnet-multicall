import {
  Blockchain,
  BytesWriter,
  Calldata,
  encodeSelector,
  OP_NET,
  Selector,
  U16_BYTE_LENGTH,
  U64_BYTE_LENGTH,
} from '@btc-vision/btc-runtime/runtime';
import { AggregateCallResult, Call, Result, writeResultArrayToBytesWriter } from './Structs';

export class Multicall extends OP_NET {
  public constructor() {
    super();
  }

  /**
   * Aggregate calls, ensuring each returns success if required
   * @param {Call[]} calls the calls to be aggregated
   * @returns {Result[]} an array of call results
   */
  public aggregate(calls: Call[]): AggregateCallResult {
    const length = calls.length;
    const results: Result[] = [];
    let resultBytesWriterLength: u64 = 0;
    for (let i = 0; i < length; i++) {
      const call = calls[i];
      const result = Blockchain.call(call.target, call.callData);
      results[i] = new Result(result, result.byteLength());
      resultBytesWriterLength += result.byteLength();
    }
    return new AggregateCallResult(resultBytesWriterLength, results);
  }

  public override execute(method: Selector, calldata: Calldata): BytesWriter {
    switch (method) {
      case encodeSelector('aggregate'): {
        const length = calldata.readU64();
        const calls: Call[] = [];
        for (let i: u64 = 0; i < length; i++) {
          const target = calldata.readAddress();
          const calldataLength = calldata.readU32();
          const rawFwdCalldata = calldata.readBytes(calldataLength);
          const fwdCalldata = new BytesWriter(calldataLength);
          fwdCalldata.writeBytes(rawFwdCalldata);

          calls.push(new Call(target, fwdCalldata));
        }
        const aggregateResults = this.aggregate(calls);

        const bw = new BytesWriter(
          U16_BYTE_LENGTH + // Array length
            U64_BYTE_LENGTH * aggregateResults.results.length + // Array of data lengths
            i32(aggregateResults.totalLength), // Length of the return data
        );
        writeResultArrayToBytesWriter(bw, aggregateResults.results);

        return bw;
      }
      default:
        return super.execute(method, calldata);
    }
  }
}
