import { Worker } from './Worker';

const main = async (): Promise<void> => {
  const worker = new Worker();
  wait worker.doAll();
};

main();
