import { Worker } from './Worker';

const main = async (): Promise<void> => {
  const worker = new Worker();
  console.log(await worker.doAll());
};

main();
