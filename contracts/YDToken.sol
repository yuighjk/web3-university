// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title YiDeng Token
/// @notice 平台代币，用于购买课程
contract YDToken is ERC20 {
    constructor() ERC20("YiDeng Token", "YD") {
        _mint(msg.sender, 1_000_000 * 10 ** 18);
    }
}
