// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./base/Level.sol";
import "./WomboCombo.sol";

contract WomboComboFactory is Level {
    function createInstance(
        address _player
    ) public payable override returns (address) {
        WomboToken token = new WomboToken("Staking", "STK", 100 * 10 ** 18);
        WomboToken reward = new WomboToken("Reward", "RWD", 100_000_000 * 10 ** 18);

        WomboForwarder forwarder = new WomboForwarder();

        Staking staking = new Staking(token, reward, address(forwarder));

        staking.setRewardsDuration(20);
        reward.transfer(address(staking), reward.totalSupply());
        token.transfer(_player, token.totalSupply());

        return address(staking);
    }

    function validateInstance(
        address payable _instance,
        address _player
    ) public view override returns (bool) {
        _player;
        Staking instance = Staking(_instance);
        uint256 amazingNumber = 1128120030438127299645800;
        return
            instance.earnedTotal() >= amazingNumber &&
            instance.rewardsToken().balanceOf(address(0x123)) >= amazingNumber;
    }
}
