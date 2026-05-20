declare module "bun:sqlite" {
  export class Database {
    constructor(filename: string);
    exec(sql: string): void;
    run(sql: string): void;
  }
}

declare global {
  var Bun: {
    serve: (options: {
      fetch: (request: Request) => Response | Promise<Response>;
      port: number;
    }) => unknown;
  };
}

export {};
