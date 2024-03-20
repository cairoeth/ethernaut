// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./base/Level.sol";
import "./WomboCombo.sol";

contract DummyFactory is Level {
    function createInstance(
        address _player
    ) public payable override returns (address) {
        // _player;
        // return address(new Dummy());
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
