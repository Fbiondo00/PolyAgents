// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VaultPilotMarket
 * @notice Binary prediction market native to USDC on Arc
 * @dev AI agent (VaultPilot) creates and manages markets. Users place bets on YES/NO outcomes.
 */
contract VaultPilotMarket is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;

    enum Outcome {
        UNRESOLVED,
        YES,
        NO,
        VOIDED
    }

    struct Market {
        string question;
        string category;
        uint256 resolutionTime;
        uint256 totalYes;
        uint256 totalNo;
        Outcome outcome;
        bool resolved;
        address resolver;
        string hederaTopicId;
        string policyHash;
    }

    struct Position {
        uint256 yesShares;
        uint256 noShares;
        bool claimed;
    }

    uint256 public marketCount;
    uint256 public constant MIN_BET = 1e6;
    uint256 public constant PROTOCOL_FEE = 50;

    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Position)) public positions;
    mapping(address => bool) public authorizedAgents;

    event MarketCreated(uint256 indexed marketId, string question, uint256 resolutionTime, string hederaTopicId);
    event BetPlaced(uint256 indexed marketId, address indexed bettor, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed marketId, Outcome outcome, uint256 totalPot);
    event WinningsClaimed(uint256 indexed marketId, address indexed winner, uint256 amount);

    constructor(address _usdc) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        authorizedAgents[msg.sender] = true;
    }

    modifier onlyAgent() {
        require(authorizedAgents[msg.sender], "Not authorized agent");
        _;
    }

    // ── Owner ──

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function authorizeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = true;
    }

    function revokeAgent(address agent) external onlyOwner {
        authorizedAgents[agent] = false;
    }

    // ── Agent ──

    function createMarket(
        string calldata question,
        string calldata category,
        uint256 resolutionTime,
        string calldata hederaTopicId,
        string calldata policyHash
    ) external onlyAgent whenNotPaused returns (uint256 marketId) {
        require(resolutionTime > block.timestamp, "Resolution in past");
        require(bytes(question).length > 0, "Empty question");

        marketId = ++marketCount;

        markets[marketId] = Market({
            question: question,
            category: category,
            resolutionTime: resolutionTime,
            totalYes: 0,
            totalNo: 0,
            outcome: Outcome.UNRESOLVED,
            resolved: false,
            resolver: msg.sender,
            hederaTopicId: hederaTopicId,
            policyHash: policyHash
        });

        emit MarketCreated(marketId, question, resolutionTime, hederaTopicId);
    }

    function resolveMarket(uint256 marketId, Outcome outcome) external whenNotPaused {
        Market storage market = markets[marketId];
        require(!market.resolved, "Already resolved");
        require(msg.sender == market.resolver || msg.sender == owner(), "Not authorized resolver");
        require(outcome != Outcome.UNRESOLVED, "Invalid outcome");
        require(block.timestamp >= market.resolutionTime, "Too early to resolve");

        market.outcome = outcome;
        market.resolved = true;

        emit MarketResolved(marketId, outcome, market.totalYes + market.totalNo);
    }

    // ── User ──

    function placeBet(uint256 marketId, bool isYes, uint256 amount) external nonReentrant whenNotPaused {
        Market storage market = markets[marketId];
        require(!market.resolved, "Market resolved");
        require(block.timestamp < market.resolutionTime, "Market closed");
        require(amount >= MIN_BET, "Below minimum bet");

        usdc.safeTransferFrom(msg.sender, address(this), amount);

        Position storage pos = positions[marketId][msg.sender];

        if (isYes) {
            market.totalYes += amount;
            pos.yesShares += amount;
        } else {
            market.totalNo += amount;
            pos.noShares += amount;
        }

        emit BetPlaced(marketId, msg.sender, isYes, amount);
    }

    function claimWinnings(uint256 marketId) external nonReentrant whenNotPaused {
        Market storage market = markets[marketId];
        require(market.resolved, "Not resolved yet");

        Position storage pos = positions[marketId][msg.sender];
        require(!pos.claimed, "Already claimed");
        pos.claimed = true;

        uint256 payout = calculatePayout(marketId, msg.sender);
        require(payout > 0, "No winnings");

        uint256 fee = (payout * PROTOCOL_FEE) / 10000;
        uint256 netPayout = payout - fee;

        usdc.safeTransfer(msg.sender, netPayout);
        usdc.safeTransfer(owner(), fee);

        emit WinningsClaimed(marketId, msg.sender, netPayout);
    }

    // ── View ──

    function calculatePayout(uint256 marketId, address user) public view returns (uint256) {
        Market storage market = markets[marketId];
        Position storage pos = positions[marketId][user];

        if (market.outcome == Outcome.VOIDED) {
            return pos.yesShares + pos.noShares;
        }

        if (market.outcome == Outcome.YES && pos.yesShares > 0) {
            uint256 totalPot = market.totalYes + market.totalNo;
            return (pos.yesShares * totalPot) / market.totalYes;
        }

        if (market.outcome == Outcome.NO && pos.noShares > 0) {
            uint256 totalPot = market.totalYes + market.totalNo;
            return (pos.noShares * totalPot) / market.totalNo;
        }

        return 0;
    }

    function getMarket(uint256 marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    function getUserPosition(uint256 marketId, address user) external view returns (Position memory) {
        return positions[marketId][user];
    }

    function getOdds(uint256 marketId) external view returns (uint256 yesOdds, uint256 noOdds) {
        Market storage market = markets[marketId];
        uint256 total = market.totalYes + market.totalNo;
        if (total == 0) return (5000, 5000);

        yesOdds = (market.totalYes * 10000) / total;
        noOdds = 10000 - yesOdds;
    }
}
