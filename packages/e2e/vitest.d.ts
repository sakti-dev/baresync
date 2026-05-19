declare module "vitest" {
  export const describe: {
    (name: string, fn: () => void): void;
    skip(name: string, fn: () => void): void;
  };

  export const it: (name: string, fn: () => void) => void;
  export const expect: <T>(value: T) => {
    toBeTruthy(): void;
  };
}

declare const process: {
  env: Record<string, string | undefined>;
};
