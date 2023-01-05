import { Worker } from './Worker';

const main = async () => {
  const worker = new Worker();
  console.log(await worker.doAll());
};

main();
