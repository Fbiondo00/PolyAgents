// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PolyAgentsMarket.sol";

contract DeployScript is Script {
    // USDC address on Arc Testnet — verify at docs.arc.network
    address constant ARC_TESTNET_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;

    function run() external {
        uint256 deployerKey = vm.envUint("ARC_PRIVATE_KEY");

        vm.startBroadcast(deployerKey);

        PolyAgentsMarket market = new PolyAgentsMarket(ARC_TESTNET_USDC);

        console.log("PolyAgentsMarket deployed at:", address(market));
        console.log("Explorer: https://explorer.testnet.arc.network/address/", address(market));

        vm.stopBroadcast();
    }
}
