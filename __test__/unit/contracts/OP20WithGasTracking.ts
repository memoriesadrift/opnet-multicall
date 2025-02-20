import { Address, BinaryReader, BinaryWriter } from '@btc-vision/transaction';
import { OP_20 as BaseOP20 } from '@btc-vision/unit-test-framework';
import { Add } from 'opnet';

export class OP_20 extends BaseOP20 {
  public async balanceOfAndReportGasUse(
    owner: Address,
  ): Promise<{ data: bigint; usedGas: bigint }> {
    const calldata = new BinaryWriter();
    calldata.writeSelector(this.balanceOfSelector);
    calldata.writeAddress(owner);
    const buf = calldata.getBuffer();
    const result = await this.execute(Buffer.from(buf));
    const response = result.response;
    if (result.error || !response) {
      this.dispose();
      throw this.handleError(result.error || new Error('No response'));
    }
    const reader = new BinaryReader(response);
    return { data: reader.readU256(), usedGas: result.usedGas };
  }

  public async transferAndReportGasUsed(
    from: Address,
    to: Address,
    amount: bigint,
  ): Promise<{ data: boolean; usedGas: bigint }> {
    const calldata = new BinaryWriter();
    calldata.writeSelector(this.transferSelector);
    calldata.writeAddress(to);
    calldata.writeU256(amount);
    const buf = calldata.getBuffer();
    const result = await this.execute(buf, from, from);
    const response = result.response;
    if (!response) {
      this.dispose();
      throw result.error;
    }
    const reader = new BinaryReader(response);
    const r = reader.readBoolean();
    if (!r) {
      throw new Error('Transfer failed');
    }
    return { data: r, usedGas: result.usedGas };
  }
}
