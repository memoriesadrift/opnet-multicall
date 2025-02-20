import { Assert, Blockchain, opnet, OPNetUnit } from '@btc-vision/unit-test-framework';
import { Call, Multicall } from '../contracts/Multicall';
import { OP_20 } from '../contracts/OP20WithGasTracking';
import { Address, BinaryWriter } from '@btc-vision/transaction';
import { rnd } from '../contracts/configs';
import { encodeNumericSelector } from '../contracts/utils';

const deployer: Address = rnd();

await opnet('Multicall', async (vm: OPNetUnit) => {
  Blockchain.msgSender = deployer;
  Blockchain.txOrigin = deployer; // "leftmost thing in the call chain"

  let token1: OP_20;
  let token2: OP_20;
  let multicall: Multicall;
  const token1Address: Address = rnd();
  const token2Address: Address = rnd();
  const multicallAddress: Address = rnd();

  vm.beforeEach(async () => {
    // Reset blockchain state
    Blockchain.dispose();
    Blockchain.clearContracts();

    await Blockchain.init();

    // Instantiate and register the OP_20 token
    token1 = new OP_20({
      file: './lib/bytecode/OP20.wasm',
      address: token1Address,
      decimals: 18,
      deployer,
    });
    Blockchain.register(token1);
    await token1.init();

    // Instantiate and register the OP_20 token
    token2 = new OP_20({
      file: './lib/bytecode/OP20.wasm',
      address: token2Address,
      decimals: 18,
      deployer,
    });
    Blockchain.register(token2);
    await token2.init();

    // Mint tokens to the user
    const mintAmount: number = 10000000;
    await token1.mint(deployer, mintAmount);

    // Instantiate and register the EWMA contract
    multicall = new Multicall({
      address: multicallAddress,
      deployer,
    });
    Blockchain.register(multicall);
    await multicall.init();

    // Set msgSender to the user
    Blockchain.msgSender = deployer;
  });

  vm.afterEach(() => {
    // Clear blockchain state between tests
    multicall.dispose();
    token1.dispose();
    token2.dispose();
    Blockchain.dispose();
    Blockchain.msgSender = deployer;
    Blockchain.txOrigin = deployer;
  });

  await vm.it('Successfully calls a contract via Multicall', async () => {
    const randomAddress = rnd();
    await token1.mint(randomAddress, 1);
    const calldataBw = new BinaryWriter();
    calldataBw.writeSelector(encodeNumericSelector('balanceOf(address)'));
    calldataBw.writeAddress(randomAddress);

    const calls: Call[] = [
      {
        target: token1Address,
        callData: calldataBw.getBuffer(),
      },
    ];

    const callResult = (await multicall.aggregate(calls))[0];
    const balance = callResult.returnData.readU256();
    Assert.expect(balance).toEqual(Blockchain.expandTo18Decimals(1));
  });

  await vm.it('Successfully calls a contract twice via Multicall', async () => {
    const addresses = [rnd(), rnd()];
    await token1.mint(addresses[0], 1);
    await token1.mint(addresses[1], 2);

    const calls: Call[] = [];
    for (let i = 0; i < 2; i++) {
      const calldataBw = new BinaryWriter();
      calldataBw.writeSelector(encodeNumericSelector('balanceOf(address)'));
      calldataBw.writeAddress(addresses[i]);

      calls.push({
        target: token1Address,
        callData: calldataBw.getBuffer(),
      });
    }

    const results = await multicall.aggregate(calls);
    for (let i = 0; i < results.length; i++) {
      const balance = results[i].returnData.readU256();
      Assert.expect(balance).toEqual(Blockchain.expandTo18Decimals(i + 1));
    }
  });

  await vm.it('Successfully calls two contracts via Multicall', async () => {
    const randomAddress = rnd();
    await token1.mint(randomAddress, 1);
    await token2.mint(randomAddress, 2);

    const calls: Call[] = [];
    for (let i = 0; i < 2; i++) {
      const calldataBw = new BinaryWriter();
      calldataBw.writeSelector(encodeNumericSelector('balanceOf(address)'));
      calldataBw.writeAddress(randomAddress);

      calls.push({
        target: i < 1 ? token1Address : token2Address,
        callData: calldataBw.getBuffer(),
      });
    }

    const results = await multicall.aggregate(calls);

    for (let i = 0; i < results.length; i++) {
      const balance = results[i].returnData.readU256();
      Assert.expect(balance).toEqual(Blockchain.expandTo18Decimals(i + 1));
    }
  });

  await vm.it('Compares gas use for multicall (read function)', async () => {
    const randomAddress = rnd();
    await token1.mint(randomAddress, 1);
    await token2.mint(randomAddress, 2);

    const calls: Call[] = [];
    for (let i = 0; i < 2; i++) {
      const calldataBw = new BinaryWriter();
      calldataBw.writeSelector(encodeNumericSelector('balanceOf(address)'));
      calldataBw.writeAddress(randomAddress);

      calls.push({
        target: i < 1 ? token1Address : token2Address,
        callData: calldataBw.getBuffer(),
      });
    }

    const callResult = await multicall.aggregateAndReportGasUse(calls);
    const results = callResult.data;

    for (let i = 0; i < results.length; i++) {
      const balance = results[i].returnData.readU256();
      Assert.expect(balance).toEqual(Blockchain.expandTo18Decimals(i + 1));
    }
    console.log(`Multicall used gas: ${callResult.usedGas}`);

    let usedGas = 0n;
    const balanceOf1 = await token1.balanceOfAndReportGasUse(randomAddress);
    usedGas += balanceOf1.usedGas;
    Assert.expect(balanceOf1.data).toEqual(Blockchain.expandTo18Decimals(1));
    const balanceOf2 = await token2.balanceOfAndReportGasUse(randomAddress);
    Assert.expect(balanceOf2.data).toEqual(Blockchain.expandTo18Decimals(2));
    usedGas += balanceOf2.usedGas;

    console.log(`Regular calls used gas: ${usedGas}`);
    console.log(`Gas savings of Multicall = ${usedGas - callResult.usedGas} (Higher is better)`);
  });

  await vm.it('Compares gas use for multicall (read function, many, many calls)', async () => {
    // 300 calls run out of gas
    const callCounts = [10, 50, 100, 200];
    for (let i = 0; i < callCounts.length; i++) {
      const callCount = callCounts[i];
      const addressBalancePairs: Array<{ address: Address; balance: bigint }> = [];
      const calls: Call[] = [];
      for (let j = 0; j < callCount; j++) {
        const address = rnd();
        const amount = Math.floor(Math.random() * 10);
        await token1.mint(address, amount);
        addressBalancePairs.push({ address, balance: Blockchain.expandTo18Decimals(amount) });
        const calldataBw = new BinaryWriter();
        calldataBw.writeSelector(encodeNumericSelector('balanceOf(address)'));
        calldataBw.writeAddress(address);

        calls.push({
          target: token1Address,
          callData: calldataBw.getBuffer(),
        });
      }

      const callResult = await multicall.aggregateAndReportGasUse(calls);
      const results = callResult.data;

      console.log(`Multicall ${callCount} calls`);
      for (let i = 0; i < results.length; i++) {
        const balance = results[i].returnData.readU256();
        Assert.expect(balance).toEqual(addressBalancePairs[i].balance);
      }
      console.log(`Multicall used gas: ${callResult.usedGas}`);

      let totalUsedGas = 0n;
      for (let i = 0; i < callCount; i++) {
        const { data, usedGas } = await token1.balanceOfAndReportGasUse(
          addressBalancePairs[i].address,
        );
        Assert.expect(data).toEqual(addressBalancePairs[i].balance);
        totalUsedGas += usedGas;
      }

      console.log(`Regular calls used gas: ${totalUsedGas}`);
      console.log(
        `Gas savings of Multicall = ${totalUsedGas - callResult.usedGas} (Higher is better)`,
      );
    }
  });

  /*
  // NOTE: This is not an intended use case of multicall
  await vm.it('Compares gas use for multicall (mutating function)', async () => {
    const sender = rnd();
    await token1.mint(sender, 2);
    await token2.mint(sender, 2);

    Blockchain.txOrigin = sender;
    Blockchain.msgSender = sender;

    const calls: Call[] = [];
    for (let i = 0; i < 2; i++) {
      const calldataBw = new BinaryWriter();
      calldataBw.writeSelector(encodeNumericSelector('transfer(address,uint256)'));
      calldataBw.writeAddress(rnd());
      calldataBw.writeU256(Blockchain.expandTo18Decimals(1));

      calls.push({
        target: i < 1 ? token1Address : token2Address,
        callData: calldataBw.getBuffer(),
      });
    }
    console.log(`Balance 1: ${await token1.balanceOf(sender)}`);
    console.log(`Balance 2: ${await token2.balanceOf(sender)}`);
    const callResult = await multicall.aggregateAndReportGasUse(calls);

    Assert.expect(await token1.balanceOf(sender)).toEqual(Blockchain.expandTo18Decimals(1));
    Assert.expect(await token2.balanceOf(sender)).toEqual(Blockchain.expandTo18Decimals(1));
    console.log(`Multicall used gas: ${callResult.usedGas}`);

    let usedGas = 0n;
    const transfer1 = await token1.transferAndReportGasUsed(
      sender,
      rnd(),
      Blockchain.expandTo18Decimals(1),
    );
    usedGas += transfer1.usedGas;
    const transfer2 = await token2.transferAndReportGasUsed(
      sender,
      rnd(),
      Blockchain.expandTo18Decimals(1),
    );
    usedGas += transfer2.usedGas;
    Assert.expect(await token1.balanceOf(sender)).toEqual(0);
    Assert.expect(await token2.balanceOf(sender)).toEqual(0);

    console.log(`Regular calls used gas: ${usedGas}`);
    console.log(`Gas savings of Multicall = ${usedGas - callResult.usedGas} (Higher is better)`);
  });
  */
});
