import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";


describe("OrderSwap", function () {
  async function deployOrderSwapFixture() {
    const [owner, seller, buyer] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA", 18);
    const tokenB = await MockERC20.deploy("Token B", "TKB", 18);

    const OrderSwap = await ethers.getContractFactory("OrderSwap");
    const orderSwap = await OrderSwap.deploy();

    await tokenA.mint(seller.address, ethers.parseEther('1000'));
    await tokenB.mint(buyer.address, ethers.parseEther('1000'));

    return { orderSwap, tokenA, tokenB, owner, seller, buyer };
  }

  describe("createOrder", function () {
    it("should create an order successfully", async function () {
      const { orderSwap, tokenA, tokenB, seller } = await loadFixture(deployOrderSwapFixture);

      const amountToSell = ethers.parseEther('100');
      const amountToBuy = ethers.parseEther('20');

      await tokenA.connect(seller).approve(orderSwap, amountToSell);

      const tx = await orderSwap.connect(seller).createOrder(
        tokenA,
        amountToSell,
        tokenB,
        amountToBuy
      );

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction failed");

      const orderCreatedEvent = receipt.logs.find(
        log => log.topics[0] === orderSwap.interface.getEvent('OrderCreated')?.topicHash
      );

      if (!orderCreatedEvent) throw new Error("OrderCreated event not found");

      const orderId = orderSwap.interface.parseLog({ 
        topics: orderCreatedEvent.topics, 
        data: orderCreatedEvent.data 
      })?.args.orderId;

      expect(orderId).to.not.be.undefined;

      const order = await orderSwap.orders(orderId);

      expect(order.seller).to.equal(seller.address);
      expect(order.tokenToSell).to.equal(await tokenA.getAddress());
      expect(order.amountToSell).to.equal(amountToSell);
      expect(order.tokenToBuy).to.equal(await tokenB.getAddress());
      expect(order.amountToBuy).to.equal(amountToBuy);
      expect(order.isActive).to.be.true;
    });

    it("should revert if allowance is insufficient", async function () {
      const { orderSwap, tokenA, tokenB, seller } = await loadFixture(deployOrderSwapFixture);

      const amountToSell = ethers.parseEther('100');
      const amountToBuy = ethers.parseEther('20');

      await expect(orderSwap.connect(seller).createOrder(
        tokenA,
        amountToSell,
        tokenB,
        amountToBuy
      )).to.be.revertedWith("Insufficient allowance for tokenToSell");
    });
  });

  describe("fulfillOrder", function () {
    async function createOrderFixture() {
      const { orderSwap, tokenA, tokenB, seller, buyer } = await loadFixture(deployOrderSwapFixture);

      const amountToSell = ethers.parseEther('100');
      const amountToBuy = ethers.parseEther('20');

      await tokenA.connect(seller).approve(orderSwap, amountToSell);

      const tx = await orderSwap.connect(seller).createOrder(
        tokenA,
        amountToSell,
        tokenB,
        amountToBuy
      );

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction failed");
      const orderCreatedEvent = receipt.logs.find(
        log => log.topics[0] === orderSwap.interface.getEvent('OrderCreated')?.topicHash
      );

      if (!orderCreatedEvent) throw new Error("OrderCreated event not found");

      const orderId = orderSwap.interface.parseLog({ 
        topics: orderCreatedEvent.topics, 
        data: orderCreatedEvent.data 
      })?.args.orderId;

      return { orderSwap, tokenA, tokenB, seller, buyer, orderId, amountToSell, amountToBuy };
    }

    it("should fulfill an order successfully", async function () {
      const { orderSwap, tokenA, tokenB, seller, buyer, orderId } = await loadFixture(createOrderFixture);

      const order = await orderSwap.orders(orderId);
      // await tokenB.connect(buyer).approve(orderSwap.address, order.amountToBuy);
      await tokenB.connect(buyer).approve(orderSwap, order.amountToBuy);

      await orderSwap.connect(buyer).fulfillOrder(orderId);

      const updatedOrder = await orderSwap.orders(orderId);
      expect(updatedOrder.isActive).to.be.false;

      const sellerBalanceB = await tokenB.balanceOf(seller.address);
      expect(sellerBalanceB).to.equal(order.amountToBuy);

      const buyerBalanceA = await tokenA.balanceOf(buyer.address);
      expect(buyerBalanceA).to.equal(order.amountToSell);
    });

    it("should revert if order is not active", async function () {
      const { orderSwap, tokenB, buyer, orderId } = await loadFixture(createOrderFixture);

      await tokenB.connect(buyer).approve(orderSwap, ethers.parseEther('20'));
      await orderSwap.connect(buyer).fulfillOrder(orderId);

      await expect(orderSwap.connect(buyer).fulfillOrder(orderId))
        .to.be.revertedWith("Order is not active");
    });
  });

  describe("cancelOrder", function () {
    async function createOrderFixture() {
      const { orderSwap, tokenA, tokenB, seller, buyer } = await loadFixture(deployOrderSwapFixture);

      const amountToSell = ethers.parseEther('100');
      const amountToBuy = ethers.parseEther('20');

      await tokenA.connect(seller).approve(orderSwap, amountToSell);

      const tx = await orderSwap.connect(seller).createOrder(
        tokenA,
        amountToSell,
        tokenB,
        amountToBuy
      );

      const receipt = await tx.wait();
      if (!receipt) throw new Error("Transaction failed");
      const orderCreatedEvent = receipt.logs.find(
        log => log.topics[0] === orderSwap.interface.getEvent('OrderCreated')?.topicHash
      );

      if (!orderCreatedEvent) throw new Error("OrderCreated event not found");

      const orderId = orderSwap.interface.parseLog({ 
        topics: orderCreatedEvent.topics, 
        data: orderCreatedEvent.data 
      })?.args.orderId;

      return { orderSwap, tokenA, tokenB, seller, buyer, orderId, amountToSell, amountToBuy };
    }

    it("should cancel an order successfully", async function () {
      const { orderSwap, tokenA, seller, orderId } = await loadFixture(createOrderFixture);

      const initialBalance = await tokenA.balanceOf(seller.address);
      const order = await orderSwap.orders(orderId);

      await orderSwap.connect(seller).cancelOrder(orderId);

      const updatedOrder = await orderSwap.orders(orderId);
      expect(updatedOrder.isActive).to.be.false;

      const finalBalance = await tokenA.balanceOf(seller.address);
      expect(finalBalance).to.equal(initialBalance + order.amountToSell);
    });

    it("should revert if not the order creator", async function () {
      const { orderSwap, buyer, orderId } = await loadFixture(createOrderFixture);

      await expect(orderSwap.connect(buyer).cancelOrder(orderId))
        .to.be.revertedWith("Not the order creator");
    });
  });
});