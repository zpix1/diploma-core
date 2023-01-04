import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import erc20abi from '../abi/erc20.json';

export class ERC20 {
  private readonly contract: Contract;

  constructor(private readonly web3: Web3, readonly address: string) {
    this.contract = new web3.eth.Contract(erc20abi as never, this.address);
  }

  async getDecimals(): Promise<bigint> {
    return BigInt(await this.contract.methods.decimals().call());
  }

  async balanceOf(address: string): Promise<bigint> {
    return BigInt(await this.contract.methods.balanceOf(address).call());
  }

  async symbol(): Promise<string> {
    return await this.contract.methods.symbol().call();
  }
}
