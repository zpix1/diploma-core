import { DEX } from './contracts/DEX';
import { TokenDecimal } from './utils/decimals';
import { GraphEdge } from './utils/graph';

export type FormattedCapitalUSD = string;
export type FormattedCapital = string;
export type FormattedPercent = string;

export interface ExchangeGraphEdge extends GraphEdge {
  contract: DEX;
  fromValue: bigint;
  toValue: bigint;
  ratio: number;
  direction: 'XY' | 'YX';
}

export type StrategyEntry = {
  from: string;
  to: string;
  fromValue: TokenDecimal;
  toValue: TokenDecimal;
  usedEdge: ExchangeGraphEdge;
  exchange: DEX;
  gas: bigint;
};

export type Config = {
  usedTokens: string[];
  contractsCount: number;
  usedFactories: string[];
};

export type SearchResult = {
  startBlock: number;
  endBlock: number;
  config: Config;
  capital: FormattedCapital;
} & (
  | {
      status: 'NOT FOUND';
    }
  | {
      status: 'FOUND';
      startToken: string;
      startValue: FormattedCapital;
      endValue: FormattedCapital;
      rate: number;
      profit: number;
      _profitInUSD: number;
      profitInUSD: FormattedCapitalUSD;
      capitalInUSD: FormattedCapitalUSD;
      profitPercent: FormattedPercent;
      realRate: number;
      strategy: StrategyEntry[];
      totalGas: bigint;
    }
);
