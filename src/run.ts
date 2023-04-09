import { Worker } from 'diploma-core';
import { DEFAULT_WEB3_PROVIDER_URL } from './privateConfig';

const main = async (): Promise<void> => {
  const worker = new Worker({ web3ProviderUrl: DEFAULT_WEB3_PROVIDER_URL });
  const result = await worker.doSearch({
    blockNumber: 'latest'
  });
  console.table(result);
};

main();
