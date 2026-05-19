declare global {
  interface DescribeFunction {
    skip(name: string, fn: () => void): void;
    (name: string, fn: () => void): void;
  }

  const describe: DescribeFunction;
  const before: (fn: () => Promise<void> | void) => void;
  const it: (name: string, fn: () => Promise<void> | void) => void;
}

export {};
