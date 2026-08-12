# 1. Token Contracts — 开发规格

## 概述

发行 YDToken (ERC-20) 和 MockUSDC (ERC-20, 6 decimals)，作为整个平台的经济基础。

## 合约清单

### YDToken.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract YDToken is ERC20 {
    constructor() ERC20("YiDeng Token", "YD") {
        _mint(msg.sender, 1_000_000 * 10**18);
    }
}
```

- name: "YiDeng Token"
- symbol: "YD"
- decimals: 18（默认）
- totalSupply: 1,000,000 YD，全量 mint 给 deployer

### MockUSDC.sol

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("Mock USDC", "USDC") {
        _mint(msg.sender, 1_000_000 * 10**6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(uint256 amount) external {
        require(amount <= 10_000 * 10**6, "Max 10000 USDC per faucet");
        _mint(msg.sender, amount);
    }
}
```

- decimals: 6（与真实 USDC 一致）
- faucet: 任何人可领取，单次最多 10,000 USDC

## 测试用例

1. YDToken 部署后 totalSupply = 1,000,000 * 10^18
2. YDToken deployer 余额 = totalSupply
3. YDToken transfer 正常工作
4. MockUSDC decimals() 返回 6
5. MockUSDC faucet 正常 mint
6. MockUSDC faucet 超额 revert

## 部署顺序

1. 部署 YDToken → 记录地址
2. 部署 MockUSDC → 记录地址

## 验收标准

- [ ] 两个合约部署成功
- [ ] Etherscan 验证通过
- [ ] 测试全部通过
