// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/// @title SimpleTextResolver
/// @notice Minimal ENS resolver supporting text records on Sepolia.
///         Checks ENS registry ownership for authorization.
contract SimpleTextResolver {
    address public immutable ENS_REGISTRY;

    mapping(bytes32 => mapping(bytes32 => string)) private _texts;

    // ── Events (same signature as standard ENS PublicResolver) ──
    event TextChanged(bytes32 indexed node, string indexedKey, string key, string value);

    // ERC-165 interface IDs
    bytes4 private constant _ERC165_ID = 0x01ffc9a7;
    bytes4 private constant _TEXT_OLD_ID = 0x59d1d43c; // setText(bytes32,bytes32,string) + text(bytes32,bytes32)
    bytes4 private constant _TEXT_NEW_ID = 0x10f13a8c; // setText(bytes32,string,string) + text(bytes32,string)

    constructor(address registry) {
        ENS_REGISTRY = registry;
    }

    // ── ERC-165 ──

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return interfaceId == _ERC165_ID
            || interfaceId == _TEXT_OLD_ID
            || interfaceId == _TEXT_NEW_ID;
    }

    // ── Old ABI: key as bytes32 hash ──

    function setText(bytes32 node, bytes32 key, string calldata value) external {
        require(_isAuthorized(node), "not authorized");
        _texts[node][key] = value;
        emit TextChanged(node, string(abi.encodePacked(key)), string(abi.encodePacked(key)), value);
    }

    function text(bytes32 node, bytes32 key) external view returns (string memory) {
        return _texts[node][key];
    }

    // ── New ABI: key as plain string ──

    function setText(bytes32 node, string calldata key, string calldata value) external {
        require(_isAuthorized(node), "not authorized");
        _texts[node][keccak256(bytes(key))] = value;
        emit TextChanged(node, key, key, value);
    }

    function text(bytes32 node, string calldata key) external view returns (string memory) {
        return _texts[node][keccak256(bytes(key))];
    }

    // ── Authorization ──

    function _isAuthorized(bytes32 node) internal view returns (bool) {
        (bool success, bytes memory data) = ENS_REGISTRY.staticcall(
            abi.encodeWithSignature("owner(bytes32)", node)
        );
        if (success && data.length >= 32) {
            address owner = abi.decode(data, (address));
            return msg.sender == owner;
        }
        return false;
    }
}
