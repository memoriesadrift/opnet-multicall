import { Address, BinaryReader, BinaryWriter } from '@btc-vision/transaction';
import {
  BytecodeManager,
  CallResponse,
  ContractDetails,
  ContractRuntime,
} from '@btc-vision/unit-test-framework';
import { encodeNumericSelector } from './utils.js';

export type Call = {
  target: Address;
  callData: Uint8Array;
};

export type Result = {
  returnData: BinaryReader;
  returnDataLength: number;
};

/**
 * This is a contract "interface" used to interact with the contract wasm bytecode in unit tests.
 */
export class Multicall extends ContractRuntime {
  protected readonly aggregateSelector = encodeNumericSelector('aggregate');

  constructor(details: ContractDetails) {
    super(details);

    this.preserveState();
  }

  /**
   * Helper function I highly recommend copying into every contract interface.
   * It takes care of checking the result / error and returns the returned bytes.
   * Wrap the response in a BinaryReader and read whatever data you need.
   */
  private async getResponse(
    buf: Uint8Array,
    sender?: Address,
    origin?: Address,
  ): Promise<Uint8Array> {
    const result = await this.execute(Buffer.from(buf), sender, origin);

    const response = result.response;
    if (response == null) {
      const errorMessage = result.error ? result.error.message : 'Unknown error occured';
      throw new Error(errorMessage);
    }

    return response;
  }

  private async getCallResponse(
    buf: Uint8Array,
    sender?: Address,
    origin?: Address,
  ): Promise<CallResponse> {
    const result = await this.execute(Buffer.from(buf), sender, origin);

    const response = result.response;
    if (response == null) {
      const errorMessage = result.error ? result.error.message : 'Unknown error occured';
      throw new Error(errorMessage);
    }

    return result;
  }

  public async aggregate(calls: Call[]): Promise<Result[]> {
    const calldata = new BinaryWriter();
    calldata.writeSelector(this.aggregateSelector);
    calldata.writeU64(BigInt(calls.length));
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      calldata.writeAddress(call.target);
      calldata.writeBytesWithLength(call.callData);
    }

    const response = await this.getResponse(calldata.getBuffer());

    const reader = new BinaryReader(response);
    const dataLengths = reader.readU64Array();
    const results: Result[] = dataLengths.map((len) => {
      const data = reader.readBytes(Number.parseInt(len.toString()));
      return {
        returnData: new BinaryReader(data),
        returnDataLength: Number.parseInt(len.toString()),
      };
    });

    return results;
  }

  public async aggregateAndReportGasUse(
    calls: Call[],
  ): Promise<{ data: Result[]; usedGas: bigint }> {
    const calldata = new BinaryWriter();
    calldata.writeSelector(this.aggregateSelector);
    calldata.writeU64(BigInt(calls.length));
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      calldata.writeAddress(call.target);
      calldata.writeBytesWithLength(call.callData);
    }

    const result = await this.getCallResponse(calldata.getBuffer());

    const reader = new BinaryReader(result.response!);
    const dataLengths = reader.readU64Array();
    const results: Result[] = dataLengths.map((len) => {
      const data = reader.readBytes(Number.parseInt(len.toString()));
      return {
        returnData: new BinaryReader(data),
        returnDataLength: Number.parseInt(len.toString()),
      };
    });

    return { data: results, usedGas: result.usedGas };
  }

  /**
   * This function defines which wasm file gets loaded and executed against.
   */
  protected defineRequiredBytecodes(): void {
    BytecodeManager.loadBytecode(`./build/multicall.wasm`, this.address);
  }
}
