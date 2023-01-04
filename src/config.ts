export const DEFAULT_WEB3_PROVIDER_URL =
  'https://mainnet.infura.io/v3/87cc21b1979742ce8a4077ff951712a9';

export const TOKENS = [
  {
    id: 'ETH',
    description: 'Just ether',
    address: '',
    isVirtual: true
  },
  {
    id: 'USDT',
    description: 'Tether USD',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    isVirtual: false
  },
  {
    id: 'USDC',
    description: 'USD Coin',
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    isVirtual: false
  },
  {
    id: 'BUSD',
    description: 'Binance USD',
    address: '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
    isVirtual: false
  },
  {
    id: 'DAI',
    description: 'Dai Stablecoin',
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
    isVirtual: false
  },
  {
    id: 'FRAX',
    description: 'Frax',
    address: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
    isVirtual: false
  },
  {
    id: 'WETH',
    description: 'Wrapped Ether',
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    isVirtual: false
  }
] as const;

export type Token = typeof TOKENS[number];
export type TokenId = Token['id'];
