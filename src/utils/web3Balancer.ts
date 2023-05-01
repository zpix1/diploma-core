/* eslint-disable @typescript-eslint/no-explicit-any */
// we have to use any bc web3-eth-contract is not typed enough
import type { ContractSendMethod } from 'web3-eth-contract';
import { DeferredPromise } from './deferredPromise';

type Task = {
  payload: ContractSendMethod;
  resolve: (T: any) => void;
  reject: (T: any) => void;
};

type Web3BalancerProps = {
  maxTPS: number;
};

export class Web3Balancer {
  private readonly maxTPS: number;
  private currentTPS = 0;
  private taskQueue: Task[] = [];
  private intervalId?: NodeJS.Timer;

  constructor(props: Web3BalancerProps) {
    this.maxTPS = props.maxTPS;
    if (this.maxTPS !== Infinity) {
      this.intervalId = setInterval(() => {
        this.currentTPS = 0;
        this.runTasks();
      }, 1000);
    }
  }

  public dispose(): void {
    this.intervalId !== undefined && clearInterval(this.intervalId);
  }

  public scheduleCall<T>(method: ContractSendMethod): Promise<T> {
    const deferred = new DeferredPromise<T>();
    this.taskQueue.push({
      payload: method,
      resolve: deferred.resolve,
      reject: deferred.reject
    });
    if (this.maxTPS === Infinity) {
      this.runTasks();
    }
    return deferred.promise;
  }

  private executeTask(task: Task): void {
    task.payload
      .call()
      .then(value => task.resolve(value))
      .catch(error => task.reject(error));
  }

  private runTasks(): void {
    while (this.currentTPS <= this.maxTPS) {
      const task = this.taskQueue.pop();
      if (task) {
        this.executeTask(task);
        this.currentTPS++;
      } else {
        break;
      }
    }
  }
}
