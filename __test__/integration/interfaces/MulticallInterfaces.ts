import { ABIDataTypes } from '@btc-vision/transaction';
import {
  CallResult,
  BitcoinAbiTypes,
  BitcoinInterfaceAbi,
  IOP_NETContract,
  OP_NET_ABI,
} from 'opnet';

export interface IMulticallContract extends IOP_NETContract {
  aggregate(length: number, calls: Uint8Array): Promise<CallResult<{ bytes: Uint8Array }>>;
}

export const MulticallContractABI: BitcoinInterfaceAbi = [
  {
    name: 'aggregate',
    inputs: [
      {
        name: 'length',
        type: ABIDataTypes.UINT64,
      },
      // NOTE: This has a complex structure
      {
        name: 'calls',
        type: ABIDataTypes.ARRAY_OF_BYTES,
      },
    ],
    // NOTE: This has a complex structure
    outputs: [
      {
        name: 'results',
        type: ABIDataTypes.ARRAY_OF_BYTES,
      },
    ],
    type: BitcoinAbiTypes.Function,
  },
  ...OP_NET_ABI,
];
