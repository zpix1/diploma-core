import { Worker } from './Worker';

const main = async (): Promise<void> => {
  const worker = new Worker();
  await worker.doAll();
};

main();
