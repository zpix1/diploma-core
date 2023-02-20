export const DEFAULT_WEB3_PROVIDER_URL = [
  'https://mainnet.infura.io/v3/87cc21b1979742ce8a4077ff951712a9',
  'https://mainnet.infura.io/v3/cc39804d13634563a49d6201ba72f1e8',
  'https://eth-mainnet.g.alchemy.com/v2/cxqs_RjxJxjNLx4naXhS2OsRoGBxDv_Y'
][1];

export const TOKENS = [
  {
    id: 'ETH',
    description: 'Just ether',
    address: '',
    isVirtual: true,
    inDollars: 1300
  },
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
    inDollars: 1300
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
  }
] as const;

export type Token = typeof TOKENS[number];
export type TokenId = Token['id'];
export const TOKENS_MAP = new Map(TOKENS.map(t => [t.id, t]));
