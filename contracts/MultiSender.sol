// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title MultiSender
/// @dev A contract to send multiple native tokens or ERC20 tokens to various recipients in a single transaction.
contract MultiSender is Ownable {
    event NativeTokensSent(address indexed sender, address[] recipients, uint256[] amounts);
    event ERC20TokensSent(address indexed sender, address indexed tokenAddress, address[] recipients, uint256[] amounts);

    constructor() Ownable(msg.sender) {}

    /// @notice Sends native tokens (e.g., MATIC on Polygon) to multiple recipients.
    /// @param _recipients An array of recipient addresses.
    /// @param _amounts An array of amounts corresponding to each recipient.
    /// @dev The sum of _amounts must match the value sent with the transaction.
    function sendNativeTokens(address[] calldata _recipients, uint256[] calldata _amounts) external payable onlyOwner {
        require(_recipients.length == _amounts.length, "Recipients and amounts length mismatch");
        require(_recipients.length > 0, "No recipients provided");

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < _amounts.length; i++) {
            totalAmount += _amounts[i];
        }
        require(msg.value == totalAmount, "Sent value does not match total amount");

        for (uint256 i = 0; i < _recipients.length; i++) {
            (bool success, ) = _recipients[i].call{value: _amounts[i]}("");
            require(success, "Failed to send native tokens");
        }

        emit NativeTokensSent(msg.sender, _recipients, _amounts);
    }

    /// @notice Sends ERC20 tokens to multiple recipients.
    /// @param _tokenAddress The address of the ERC20 token.
    /// @param _recipients An array of recipient addresses.
    /// @param _amounts An array of amounts corresponding to each recipient.
    /// @dev The contract must have sufficient allowance or direct transfer capability from the caller.
    function sendERC20Tokens(
        address _tokenAddress,
        address[] calldata _recipients,
        uint256[] calldata _amounts
    ) external onlyOwner {
        require(_recipients.length == _amounts.length, "Recipients and amounts length mismatch");
        require(_recipients.length > 0, "No recipients provided");

        IERC20 token = IERC20(_tokenAddress);
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < _amounts.length; i++) {
            totalAmount += _amounts[i];
        }

        // The contract itself needs to have the tokens, or an allowance must be given from msg.sender
        // For simplicity, this example assumes the contract will hold the tokens, or that
        // the sender calls approve on the ERC20 token first for the contract to pull.
        // A direct transferFrom from the sender to recipients via contract would be more complex.
        // For this pattern, the tokens should be sent to the contract first.
        require(token.balanceOf(address(this)) >= totalAmount, "Insufficient contract balance");

        for (uint256 i = 0; i < _recipients.length; i++) {
            require(token.transfer(_recipients[i], _amounts[i]), "Failed to send ERC20 tokens");
        }

        emit ERC20TokensSent(msg.sender, _tokenAddress, _recipients, _amounts);
    }

    /// @notice Allows the owner to withdraw any native tokens accidentally sent to the contract.
    function withdrawNativeTokens() external onlyOwner {
        (bool success, ) = owner().call{value: address(this).balance}("");
        require(success, "Failed to withdraw native tokens");
    }

    /// @notice Allows the owner to withdraw any ERC20 tokens accidentally sent to the contract.
    /// @param _tokenAddress The address of the ERC20 token to withdraw.
    function withdrawERC20Tokens(address _tokenAddress) external onlyOwner {
        IERC20 token = IERC20(_tokenAddress);
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        require(token.transfer(owner(), balance), "Failed to withdraw ERC20 tokens");
    }

    // Fallback function to receive native tokens
    receive() external payable {}
} 