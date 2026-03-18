import hre from "hardhat";
import * as keys from "../utils/keys";
import { hashData } from "../utils/hash";

type TargetMarket = {
  label: string;
  indexToken: string;
  longToken: string;
  shortToken: string;
};

type CallSpec = {
  marketLabel: string;
  field: string;
  method: "getUint" | "getBool";
  key: string;
};

function optimalUsageFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [keys.OPTIMAL_USAGE_FACTOR, market, isLong]);
}

function baseBorrowingFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [keys.BASE_BORROWING_FACTOR, market, isLong]);
}

function aboveOptimalUsageBorrowingFactorKey(market: string, isLong: boolean) {
  return hashData(["bytes32", "address", "bool"], [keys.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR, market, isLong]);
}

function maxCollateralSumKey(market: string, token: string, isLong: boolean) {
  return hashData(["bytes32", "address", "address", "bool"], [keys.MAX_COLLATERAL_SUM, market, token, isLong]);
}

function normalizeAddress(addr: string) {
  return addr.toLowerCase();
}

async function main() {
  if (hre.network.name !== "arbitrum") {
    throw new Error("This script is intended for Arbitrum mainnet. Use --network arbitrum.");
  }

  const tokens = await hre.gmx.getTokens();
  const getAddress = (symbol: string) => {
    const token = tokens[symbol];
    if (!token || !token.address) {
      throw new Error(`Token ${symbol} is missing an address in tokens config`);
    }
    return token.address;
  };

  const targets: TargetMarket[] = [
    {
      label: "ETH/USD",
      indexToken: getAddress("WETH"),
      longToken: getAddress("WETH"),
      shortToken: getAddress("USDC"),
    },
    {
      label: "BTC/USD",
      indexToken: getAddress("BTC"),
      longToken: getAddress("WBTC.e"),
      shortToken: getAddress("USDC"),
    },
    {
      label: "WLD/USD",
      indexToken: getAddress("WLD"),
      longToken: getAddress("WETH"),
      shortToken: getAddress("USDC"),
    },
  ];

  const reader = await hre.ethers.getContract("Reader");
  const dataStore = await hre.ethers.getContract("DataStore");
  const multicall = await hre.ethers.getContract("Multicall3");
  console.log("dataStore:", dataStore.address);

  const markets = await reader.getMarkets(dataStore.address, 0, 1000);

  const marketByLabel = new Map<string, any>();
  for (const target of targets) {
    const market = markets.find(
      (m) =>
        normalizeAddress(m.indexToken) === normalizeAddress(target.indexToken) &&
        normalizeAddress(m.longToken) === normalizeAddress(target.longToken) &&
        normalizeAddress(m.shortToken) === normalizeAddress(target.shortToken)
    );

    if (!market) {
      throw new Error(
        `Market not found for ${target.label}: ${target.indexToken} / ${target.longToken} / ${target.shortToken}`
      );
    }

    marketByLabel.set(target.label, market);
  }

  const calls: CallSpec[] = [];
  const addUint = (marketLabel: string, field: string, key: string) => {
    calls.push({ marketLabel, field, method: "getUint", key });
  };
  const addBool = (marketLabel: string, field: string, key: string) => {
    calls.push({ marketLabel, field, method: "getBool", key });
  };

  // Global config
  addBool("__global__", "skipBorrowingForSmallerSide", keys.SKIP_BORROWING_FEE_FOR_SMALLER_SIDE);

  for (const [label, market] of marketByLabel.entries()) {
    const marketToken = market.marketToken as string;

    addBool(label, "isMarketDisabled", keys.isMarketDisabledKey(marketToken));

    addUint(label, "liquidationFeeRate", keys.liquidationFeeFactorKey(marketToken));
    addUint(label, "positionFeeRatePositiveImpact", keys.positionFeeFactorKey(marketToken, true));
    addUint(label, "positionFeeRateNegativeImpact", keys.positionFeeFactorKey(marketToken, false));

    addUint(label, "positionImpact.positiveImpactFactor", keys.positionImpactFactorKey(marketToken, true));
    addUint(label, "positionImpact.negativeImpactFactor", keys.positionImpactFactorKey(marketToken, false));
    addUint(label, "positionImpact.positiveImpactExponent", keys.positionImpactExponentFactorKey(marketToken, true));
    addUint(label, "positionImpact.negativeImpactExponent", keys.positionImpactExponentFactorKey(marketToken, false));
    addUint(label, "positionImpact.maxPositiveImpactFactor", keys.maxPositionImpactFactorKey(marketToken, true));
    addUint(label, "positionImpact.maxNegativeImpactFactor", keys.maxPositionImpactFactorKey(marketToken, false));
    addUint(
      label,
      "positionImpact.maxImpactFactorForLiquidations",
      keys.maxPositionImpactFactorForLiquidationsKey(marketToken)
    );

    addUint(label, "swapImpact.impactExponent", keys.swapImpactExponentFactorKey(marketToken));
    addUint(label, "swapImpact.positiveImpactFactor", keys.swapImpactFactorKey(marketToken, true));
    addUint(label, "swapImpact.negativeImpactFactor", keys.swapImpactFactorKey(marketToken, false));

    addUint(label, "optimalUsageFactorLong", optimalUsageFactorKey(marketToken, true));
    addUint(label, "optimalUsageFactorShort", optimalUsageFactorKey(marketToken, false));
    addUint(label, "baseBorrowingFactorLong", baseBorrowingFactorKey(marketToken, true));
    addUint(label, "baseBorrowingFactorShort", baseBorrowingFactorKey(marketToken, false));
    addUint(label, "aboveOptimalBorrowingFactorLong", aboveOptimalUsageBorrowingFactorKey(marketToken, true));
    addUint(label, "aboveOptimalBorrowingFactorShort", aboveOptimalUsageBorrowingFactorKey(marketToken, false));
    addUint(label, "borrowingFactorLong", keys.borrowingFactorKey(marketToken, true));
    addUint(label, "borrowingFactorShort", keys.borrowingFactorKey(marketToken, false));
    addUint(label, "borrowingExponentFactorLong", keys.borrowingExponentFactorKey(marketToken, true));
    addUint(label, "borrowingExponentFactorShort", keys.borrowingExponentFactorKey(marketToken, false));

    addUint(label, "fundingFactor", keys.fundingFactorKey(marketToken));
    addUint(label, "fundingExponentFactor", keys.fundingExponentFactorKey(marketToken));
    addUint(label, "fundingIncreaseFactorPerSecond", keys.fundingIncreaseFactorPerSecondKey(marketToken));
    addUint(label, "fundingDecreaseFactorPerSecond", keys.fundingDecreaseFactorPerSecondKey(marketToken));
    addUint(label, "minFundingFactorPerSecond", keys.minFundingFactorPerSecondKey(marketToken));
    addUint(label, "maxFundingFactorPerSecond", keys.maxFundingFactorPerSecondKey(marketToken));
    addUint(label, "thresholdForStableFunding", keys.thresholdForStableFundingKey(marketToken));
    addUint(label, "thresholdForDecreaseFunding", keys.thresholdForDecreaseFundingKey(marketToken));

    addUint(label, "reserveFactorLong", keys.reserveFactorKey(marketToken, true));
    addUint(label, "reserveFactorShort", keys.reserveFactorKey(marketToken, false));
    addUint(label, "openInterestReserveFactorLong", keys.openInterestReserveFactorKey(marketToken, true));
    addUint(label, "openInterestReserveFactorShort", keys.openInterestReserveFactorKey(marketToken, false));

    addUint(label, "minCollateralFactor", keys.minCollateralFactorKey(marketToken));
    addUint(label, "minCollateralFactorForLiquidation", keys.minCollateralFactorForLiquidationKey(marketToken));
    addUint(
      label,
      "minCollateralFactorForOpenInterestLong",
      keys.minCollateralFactorForOpenInterestMultiplierKey(marketToken, true)
    );
    addUint(
      label,
      "minCollateralFactorForOpenInterestShort",
      keys.minCollateralFactorForOpenInterestMultiplierKey(marketToken, false)
    );

    addUint(label, "minPositionImpactPoolAmount", keys.minPositionImpactPoolAmountKey(marketToken));
    addUint(label, "positionImpactPoolDistributionRate", keys.positionImpactPoolDistributionRateKey(marketToken));

    addUint(label, "maxLongTokenPoolAmount", keys.maxPoolAmountKey(marketToken, market.longToken));
    addUint(label, "maxShortTokenPoolAmount", keys.maxPoolAmountKey(marketToken, market.shortToken));
    addUint(label, "maxLongTokenPoolUsdForDeposit", keys.maxPoolUsdForDepositKey(marketToken, market.longToken));
    addUint(label, "maxShortTokenPoolUsdForDeposit", keys.maxPoolUsdForDepositKey(marketToken, market.shortToken));

    addUint(label, "maxOpenInterestLong", keys.maxOpenInterestKey(marketToken, true));
    addUint(label, "maxOpenInterestShort", keys.maxOpenInterestKey(marketToken, false));

    addUint(label, "longTokenMaxCollateralAmountLong", maxCollateralSumKey(marketToken, market.longToken, true));
    addUint(label, "longTokenMaxCollateralAmountShort", maxCollateralSumKey(marketToken, market.longToken, false));
    addUint(label, "shortTokenMaxCollateralAmountLong", maxCollateralSumKey(marketToken, market.shortToken, true));
    addUint(label, "shortTokenMaxCollateralAmountShort", maxCollateralSumKey(marketToken, market.shortToken, false));

    addUint(label, "maxPnlFactorTradersLong", keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, marketToken, true));
    addUint(
      label,
      "maxPnlFactorTradersShort",
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_TRADERS, marketToken, false)
    );
    addUint(label, "maxPnlFactorAdlLong", keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_ADL, marketToken, true));
    addUint(label, "maxPnlFactorAdlShort", keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_ADL, marketToken, false));
    addUint(
      label,
      "maxPnlFactorDepositsLong",
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_DEPOSITS, marketToken, true)
    );
    addUint(
      label,
      "maxPnlFactorDepositsShort",
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_DEPOSITS, marketToken, false)
    );
    addUint(
      label,
      "maxPnlFactorWithdrawalsLong",
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, marketToken, true)
    );
    addUint(
      label,
      "maxPnlFactorWithdrawalsShort",
      keys.maxPnlFactorKey(keys.MAX_PNL_FACTOR_FOR_WITHDRAWALS, marketToken, false)
    );

    addUint(label, "swapFeeFactorPositiveImpact", keys.swapFeeFactorKey(marketToken, true));
    addUint(label, "swapFeeFactorNegativeImpact", keys.swapFeeFactorKey(marketToken, false));
    addUint(label, "depositFeeFactorPositiveImpact", keys.depositFeeFactorKey(marketToken, true));
    addUint(label, "depositFeeFactorNegativeImpact", keys.depositFeeFactorKey(marketToken, false));
    addUint(label, "withdrawalFeeFactorPositiveImpact", keys.withdrawalFeeFactorKey(marketToken, true));
    addUint(label, "withdrawalFeeFactorNegativeImpact", keys.withdrawalFeeFactorKey(marketToken, false));
    addUint(label, "atomicSwapFeeFactor", keys.atomicSwapFeeFactorKey(marketToken));
    addUint(label, "atomicWithdrawalFeeFactor", keys.atomicWithdrawalFeeFactorKey(marketToken));

    addUint(label, "maxLendableImpactFactor", keys.maxLendableImpactFactorKey(marketToken));
    addUint(label, "maxLendableImpactFactorForWithdrawals", keys.maxLendableImpactFactorForWithdrawalsKey(marketToken));
    addUint(label, "maxLendableImpactUsd", keys.maxLendableImpactUsdKey(marketToken));
  }

  const multicallReadParams = calls.map((call) => ({
    target: dataStore.address,
    allowFailure: false,
    callData: dataStore.interface.encodeFunctionData(call.method, [call.key]),
  }));

  const multicallReadResult = await multicall.callStatic.aggregate3(multicallReadParams);

  const output: any = {
    network: hre.network.name,
    global: {},
    markets: {},
  };

  for (let i = 0; i < calls.length; i++) {
    const call = calls[i];
    const result = multicallReadResult[i];
    const decoded = dataStore.interface.decodeFunctionResult(call.method, result.returnData)[0];
    const value = call.method === "getBool" ? decoded : decoded.toString();

    if (call.marketLabel === "__global__") {
      output.global[call.field] = { key: call.key, value };
      continue;
    }

    if (!output.markets[call.marketLabel]) {
      const market = marketByLabel.get(call.marketLabel);
      output.markets[call.marketLabel] = {
        marketToken: market.marketToken,
        indexToken: market.indexToken,
        longToken: market.longToken,
        shortToken: market.shortToken,
        config: {},
      };
    }

    output.markets[call.marketLabel].config[call.field] = { key: call.key, value };
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
