import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import erc20abi from '../abi/erc20.json';
import { Memoize } from 'typescript-memoize';
import { DEFAULT_DECIMALS } from '../utils/decimals';

export interface ERC20 {
  readonly address: string;
  getDecimals(): Promise<bigint>;
  balanceOf(address: string): Promise<bigint>;
  symbol(): Promise<string>;
}

export class RealERC20 implements ERC20 {
  private readonly contract: Contract;

  private constructor(web3: Web3, readonly address: string) {
    this.contract = new web3.eth.Contract(erc20abi as never, this.address);
  }

  @Memoize((_web3: Web3, address: string) => address)
  static getInstanceOf(web3: Web3, address: string): RealERC20 {
    return new RealERC20(web3, address);
  }

  @Memoize()
  async getDecimals(): Promise<bigint> {
    return BigInt(await this.contract.methods.decimals().call());
  }

  @Memoize()
  async balanceOf(address: string): Promise<bigint> {
    return BigInt(await this.contract.methods.balanceOf(address).call());
  }

  @Memoize()
  async symbol(): Promise<string> {
    return await this.contract.methods.symbol().call();
  }
}

export class EthERC20 implements ERC20 {
  private constructor() {
    return;
  }

  static getInstanceOf(): EthERC20 {
    return new EthERC20();
  }

  get address(): string {
    throw new Error('Method not implemented.');
  }

  async getDecimals(): Promise<bigint> {
    return DEFAULT_DECIMALS;
  }

  balanceOf(): Promise<bigint> {
    throw new Error('Method not implemented.');
  }

  async symbol(): Promise<string> {
    return 'ETH';
  }
}
