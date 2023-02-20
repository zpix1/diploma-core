import mongoose, { Model } from 'mongoose';
import { SearchResult } from '../types';
const { Schema } = mongoose;

const TokenDecimalSchema = new Schema({
  valueInDecimals: String,
  decimals: String,
  absoluteValue: String
});

const ConfigSchema = new Schema({
  usedTokens: [String],
  contractsCount: Number,
  usedFactories: [String]
});

const SearchResultSchema = new Schema(
  {
    status: String,
    startBlock: Number,
    endBlock: Number,
    capital: String,
    startToken: String,
    startValue: String,
    endValue: String,
    rate: Number,
    profit: Number,
    _profitInUSD: Number,
    profitInUSD: String,
    capitalInUSD: String,
    profitPercent: String,
    realRate: Number,
    strategy: [
      {
        from: String,
        to: String,
        fromValue: TokenDecimalSchema,
        toValue: TokenDecimalSchema,
        usedEdge: {
          fromValue: String,
          toValue: String,
          ratio: Number,
          direction: String
        },
        exchange: String
      }
    ],
    config: ConfigSchema
  },
  { timestamps: true }
);

mongoose.connect('mongodb://127.0.0.1:27017/search');

const SearchResultModel = mongoose.model('SearchResult', SearchResultSchema);

export const saveSearchResult = async (
  ...results: SearchResult[]
): Promise<void> => {
  results.forEach(x => deepConvert(x));
  await SearchResultModel.insertMany(results);
};

const deepConvert = (x: any, depth = 4): void => {
  if (depth < 0) {
    return;
  }
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === 'bigint') {
      x[k] = v.toString();
    } else if (Array.isArray(v)) {
      for (const v1 of v) {
        deepConvert(v1);
      }
    } else if (v instanceof Object) {
      deepConvert(v as Record<string, unknown>, depth - 1);
    }
  }
};

export const closeConnection = async (): Promise<void> => {
  await mongoose.connection.close();
};
