declare module "vitest" {
  export const describe: {
    (name: string, fn: () => void | Promise<void>): void;
    skip(name: string, fn: () => void | Promise<void>): void;
  };

  export const it: (name: string, fn: () => void | Promise<void>) => void;
  export const expect: <T>(value: T) => {
    not: {
      toBe(expected: unknown): void;
      toBeLessThan(expected: number): void;
      toBeNull(): void;
      toBeTruthy(): void;
      toContain(expected: unknown): void;
      toEqual(expected: unknown): void;
    };
    toBe(expected: unknown): void;
    toBeLessThan(expected: number): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toContain(expected: unknown): void;
    toEqual(expected: unknown): void;
  };
}

declare const process: NodeJS.Process;
