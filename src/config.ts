type TokenInfo = {
  id: string;
  description: string;
  address: string;
  isVirtual: boolean;
  inDollars: number;
};

export const ETH = {
  id: 'ETH',
  description: 'Just ether',
  address: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  isVirtual: true,
  inDollars: 1300
} satisfies TokenInfo;

export const TOKENS = [
  ETH,
  {
    id: 'USDT',
    description: 'Tether USD',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    isVirtual: false,
    inDollars: 1
  },
  {
    id: 'USDC',
    description: 'USD Coin',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    isVirtual: false,
    inDollars: 1
  },
  {
    id: 'BUSD',
    description: 'Binance USD',
    address: '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
    isVirtual: false,
    inDollars: 1
  },
  {
    id: 'DAI',
    description: 'Dai Stablecoin',
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    isVirtual: false,
    inDollars: 1
  },
  {
    id: 'FRAX',
    description: 'Frax',
    address: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
    isVirtual: false,
    inDollars: 1
  },
  {
    id: 'WETH',
    description: 'Wrapped Ether',
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    isVirtual: false,
    inDollars: 1889
  },
  {
    id: 'SHIB',
    description: 'Shiba Inu coin',
    address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
    isVirtual: false,
    inDollars: 0.00000861
  },
  {
    id: 'UNI',
    description: 'Uniswap native',
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
    isVirtual: false,
    inDollars: 5.7
  },
  {
    id: 'LINK',
    description: 'Link coin',
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
    isVirtual: false,
    inDollars: 6.1
  },
  {
    id: 'LEO',
    description: 'Bitfinex LEO Token',
    address: '0x2AF5D2aD76741191D15Dfe7bF6aC92d4Bd912Ca3',
    isVirtual: false,
    inDollars: 4.01325
  },
  {
    id: 'MATIC',
    description: 'Matic Token',
    address: '0x7d1afa7b718fb893db30a3abc0cfc608aacfebb0',
    inDollars: 1.3,
    isVirtual: false
  },
  {
    id: 'WBTC',
    description: 'Wrapped BTC',
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    inDollars: 22300,
    isVirtual: false
  },
  {
    id: 'BNT',
    description: 'Bancor Token',
    address: '0x1f573d6fb3f13d689ff844b4ce37794d79a7ff1c',
    inDollars: 0.55,
    isVirtual: false
  },
  {
    id: 'CRO', 
    description: 'CRO token',
    address: '0xA0b73E1Ff0B80914AB6fe0444E65848C4C34450b',
    inDollars: 1,
    isVirtual: false
  },
  {
    id: 'POLY', 
    description: 'POLY token',
    address: '0x9992eC3cF6A55b00978cdDF2b27BC6882d88D1eC',
    inDollars: 0.13,
    isVirtual: false
  },
  {
    id: 'DYP', 
    description: 'DYP token',
    address: '0x961C8c0B1aaD0c0b10a51FeF6a867E3091BCef17',
    inDollars: 0.24,
    isVirtual: false
  }
] as const satisfies readonly TokenInfo[];

export type Token = typeof TOKENS[number];
export type TokenId = Token['id'];
export const TOKENS_MAP = new Map(TOKENS.map(t => [t.id, t]));
export const TOKEN_ID_LIST = TOKENS.map(({ id }) => id);

export const FACTORIES = [
  'Bancor V3',
  'Uniswap V1',
  'Uniswap V2',
  'Uniswap V3',
  'Curve V1'
] as const;
export type Factory = typeof FACTORIES[number];

export const DEFAULT_CAPS_SET = [
  // 5n * 10n ** 16n,
  // 10n ** 17n,
  // 5n * 10n ** 17n,
  // 10n ** 18n,
  5n * 10n ** 18n,
  10n ** 19n,
  5n * 10n ** 19n,
  10n ** 20n,
  10n ** 21n,
  10n ** 22n,
  5n * 10n ** 22n,
  10n ** 23n
] as const;

export const DOLLARS_CAPS_SET = DEFAULT_CAPS_SET.map(c => Number(c) / 10 ** 18);
