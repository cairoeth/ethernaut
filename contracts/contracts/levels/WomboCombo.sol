// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import {ERC20} from "openzeppelin-contracts-08/token/ERC20/ERC20.sol";
import {ERC2771Context} from "openzeppelin-contracts-08/metatx/ERC2771Context.sol";
import {Multicall} from "openzeppelin-contracts-08/utils/Multicall.sol";
import {SignatureChecker} from "openzeppelin-contracts-08/utils/cryptography/SignatureChecker.sol";
import {EIP712} from "openzeppelin-contracts-08/utils/cryptography/draft-EIP712.sol";

contract Staking is Multicall, ERC2771Context {
    WomboToken public immutable stakingToken;
    WomboToken public immutable rewardsToken;

    address public owner;

    uint256 public duration;
    uint256 public finishAt;
    uint256 public updatedAt;
    uint256 public rewardRate;
    uint256 public rewardPerTokenStored;
    mapping(address => uint256) public userRewardPerTokenPaid;
    mapping(address => uint256) public rewards;

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    uint256 public earnedTotal;

    constructor(
        WomboToken _stakingToken,
        WomboToken _rewardToken,
        address _forwarder
    ) ERC2771Context(_forwarder) {
        owner = _msgSender();
        stakingToken = _stakingToken;
        rewardsToken = _rewardToken;
    }

    modifier onlyOwner() {
        require(_msgSender() == owner, "not authorized");
        _;
    }

    function lastTimeRewardApplicable() public view returns (uint256) {
        return _min(finishAt, block.timestamp);
    }

    function rewardPerToken() public view returns (uint256) {
        if (totalSupply == 0) {
            return rewardPerTokenStored;
        }

        return
            rewardPerTokenStored +
            (rewardRate * (lastTimeRewardApplicable() - updatedAt) * 1e18) /
            totalSupply;
    }

    function stake(uint256 _amount) external {
        address user = _msgSender();
        updateReward(user);
        require(_amount > 0, "amount = 0");
        stakingToken.transferFrom(user, address(this), _amount);
        balanceOf[user] += _amount;
        totalSupply += _amount;
    }

    function withdraw(uint256 _amount) external {
        address user = _msgSender();
        updateReward(user);
        require(_amount > 0, "amount = 0");
        balanceOf[user] -= _amount;
        totalSupply -= _amount;
        stakingToken.transfer(user, _amount);
    }

    function earned(address _account) public view returns (uint256) {
        return
            ((balanceOf[_account] *
                (rewardPerToken() - userRewardPerTokenPaid[_account])) / 1e18) +
            rewards[_account];
    }

    function getReward() external {
        address user = _msgSender();
        updateReward(user);
        uint256 reward = rewards[user];
        earnedTotal += reward;
        if (reward > 0) {
            rewards[user] = 0;
            rewardsToken.transfer(user, reward);
        }
    }

    function setRewardsDuration(uint256 _duration) external onlyOwner {
        require(finishAt < block.timestamp, "reward duration not finished");
        duration = _duration;
    }

    function notifyRewardAmount(uint256 _amount) external onlyOwner {
        updateReward(address(0));
        if (block.timestamp >= finishAt) {
            rewardRate = _amount / duration;
        } else {
            uint256 remainingRewards = (finishAt - block.timestamp) *
                rewardRate;
            rewardRate = (_amount + remainingRewards) / duration;
        }

        require(rewardRate > 0, "reward rate = 0");
        require(
            rewardRate * duration <= rewardsToken.balanceOf(address(this)),
            "reward amount > balance"
        );

        finishAt = block.timestamp + duration;
        updatedAt = block.timestamp;
    }

    function _min(uint256 x, uint256 y) private pure returns (uint256) {
        return x <= y ? x : y;
    }

    function updateReward(address _account) internal {
        rewardPerTokenStored = rewardPerToken();
        updatedAt = lastTimeRewardApplicable();

        if (_account != address(0)) {
            rewards[_account] = earned(_account);
            userRewardPerTokenPaid[_account] = rewardPerTokenStored;
        }
    }
}

abstract contract EIP712WithNonce is EIP712 {
    event NonceUsed(
        address indexed user,
        uint256 indexed timeline,
        uint256 nonce
    );

    error InvalidNonce(uint256 nonce);

    mapping(address => mapping(uint256 => uint256)) private _nonces;

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function getNonce(address from) public view virtual returns (uint256) {
        return _nonces[from][0];
    }

    function getNonce(
        address from,
        uint256 timeline
    ) public view virtual returns (uint256) {
        return _nonces[from][timeline];
    }

    function _verifyAndConsumeNonce(
        address user,
        uint256 fullNonce
    ) internal virtual {
        uint256 timeline = fullNonce >> 128;
        uint256 nonce = uint128(fullNonce);
        uint256 expected = _nonces[user][timeline]++;

        if (nonce != expected) revert InvalidNonce(nonce);

        emit NonceUsed(user, timeline, nonce);
    }
}

contract Forwarder is EIP712WithNonce {
    struct ForwardRequest {
        address from;
        address to;
        uint256 value;
        uint256 gas;
        uint256 nonce;
        uint256 deadline;
        bytes data;
    }

    bytes32 private constant _FORWARDREQUEST_TYPEHASH =
        keccak256(
            "ForwardRequest(address from,address to,uint256 value,uint256 gas,uint256 nonce,uint256 deadline,bytes data)"
        );

    error DeadlineExpired();
    error SignatureDoesNotMatch();

    constructor() EIP712("Forwarder", "1") {}

    function execute(
        ForwardRequest calldata req,
        bytes calldata signature
    ) external payable returns (bool, bytes memory) {
        _verifyAndConsumeNonce(req.from, req.nonce);

        if (!(req.deadline == 0 || req.deadline > block.timestamp))
            revert DeadlineExpired();
        if (
            !SignatureChecker.isValidSignatureNow(
                req.from,
                _hashTypedDataV4(
                    keccak256(
                        abi.encode(
                            _FORWARDREQUEST_TYPEHASH,
                            req.from,
                            req.to,
                            req.value,
                            req.gas,
                            req.nonce,
                            req.deadline,
                            keccak256(req.data)
                        )
                    )
                ),
                signature
            )
        ) revert SignatureDoesNotMatch();

        (bool success, bytes memory returndata) = req.to.call{
            gas: req.gas,
            value: req.value
        }(abi.encodePacked(req.data, req.from));

        if (gasleft() <= req.gas / 63) {
            assembly {
                invalid()
            }
        }
        return (success, returndata);
    }
}

contract WomboToken is ERC20 {
    constructor(
        string memory _name,
        string memory _symbol,
        uint256 amount
    ) ERC20(_name, _symbol) {
        _mint(msg.sender, amount);
    }
}
