import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import erc20abi from '../abi/erc20.json';
import { Memoize } from 'typescript-memoize';

export class ERC20 {
  private readonly contract: Contract;

  private constructor(web3: Web3, readonly address: string) {
    this.contract = new web3.eth.Contract(erc20abi as never, this.address);
  }

  @Memoize((_web3: Web3, address: string) => address)
  static getInstanceOf(web3: Web3, address: string): ERC20 {
    return new ERC20(web3, address);
  }

  @Memoize()
  async getDecimals(): Promise<bigint> {
    console.log('get decimals for', this.address);
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
