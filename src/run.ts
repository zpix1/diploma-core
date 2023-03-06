import { Worker } from './Worker';

const main = async (): Promise<void> => {
  const worker = new Worker();
  const result = await worker.doSearch({});
};

main();
