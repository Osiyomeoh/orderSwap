pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract OrderSwap {
    using Counters for Counters.Counter;
    Counters.Counter private _orderIds;

    struct Order {
        address seller;
        address tokenToSell;
        uint256 amountToSell;
        address tokenToBuy;
        uint256 amountToBuy;
        bool isActive;
        uint256 createdAt;
    }

    mapping(uint256 => Order) public orders;

    event OrderCreated(uint256 orderId, address seller, address tokenToSell, uint256 amountToSell, address tokenToBuy, uint256 amountToBuy, uint256 createdAt);
    event OrderFulfilled(uint256 orderId, address buyer);
    event OrderCancelled(uint256 orderId);

    function createOrder(address _tokenToSell, uint256 _amountToSell, address _tokenToBuy, uint256 _amountToBuy) external {
        require(_tokenToSell != address(0) && _tokenToBuy != address(0), "Invalid token addresses");
        require(_amountToSell > 0 && _amountToBuy > 0, "Invalid amounts");

        IERC20(_tokenToSell).transferFrom(msg.sender, address(this), _amountToSell);

        _orderIds.increment();
        uint256 newOrderId = _orderIds.current();

        orders[newOrderId] = Order({
            seller: msg.sender,
            tokenToSell: _tokenToSell,
            amountToSell: _amountToSell,
            tokenToBuy: _tokenToBuy,
            amountToBuy: _amountToBuy,
            isActive: true,
            createdAt: block.timestamp
        });

        emit OrderCreated(newOrderId, msg.sender, _tokenToSell, _amountToSell, _tokenToBuy, _amountToBuy);
    }

    function fulfillOrder(uint256 _orderId) external {
        Order storage order = orders[_orderId];
        require(order.isActive, "Order is not active");

        IERC20(order.tokenToBuy).transferFrom(msg.sender, order.seller, order.amountToBuy);
        IERC20(order.tokenToSell).transfer(msg.sender, order.amountToSell);

        order.isActive = false;
        emit OrderFulfilled(_orderId, msg.sender);
    }

    function cancelOrder(uint256 _orderId) external {
        Order storage order = orders[_orderId];
        require(order.seller == msg.sender, "Not the order creator");
        require(order.isActive, "Order is not active");

        IERC20(order.tokenToSell).transfer(order.seller, order.amountToSell);

        order.isActive = false;
        emit OrderCancelled(_orderId);
    }
}
