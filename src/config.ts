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
    id: 'BUSB',
    description: 'Binance USD',
    address: '0x4Fabb145d64652a948d72533023f6E7A623C7C53',
    isVirtual: false
  }
] as const;

export type Token = typeof TOKENS[number];
export type TokenId = Token['id'];
