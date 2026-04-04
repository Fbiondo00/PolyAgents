// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {VaultPilotMarket} from "../src/VaultPilotMarket.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract DeployLocal is Script {
    function run() external {
        uint256 deployerKey = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80; // anvil default #0
        address deployer = vm.addr(deployerKey);

        vm.startBroadcast(deployerKey);

        // 1. Deploy mock USDC
        MockUSDC usdc = new MockUSDC();
        console2.log("MockUSDC deployed at:", address(usdc));

        // 2. Mint some USDC to deployer (10000 USDC = 10000 * 1e6)
        usdc.mint(deployer, 10_000 * 1e6);
        console2.log("Minted 10,000 USDC to deployer:", deployer);

        // 3. Deploy VaultPilotMarket
        VaultPilotMarket market = new VaultPilotMarket(address(usdc));
        console2.log("VaultPilotMarket deployed at:", address(market));

        // 4. Fund a test user (anvil account #1)
        address testUser = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;
        usdc.mint(testUser, 5_000 * 1e6);
        console2.log("Minted 5,000 USDC to test user:", testUser);

        vm.stopBroadcast();

        console2.log("");
        console2.log("=== Deployment Summary ===");
        console2.log("USDC:", address(usdc));
        console2.log("VaultPilotMarket:", address(market));
        console2.log("Deployer:", deployer);
    }
}
