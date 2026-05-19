import type { SyncContract } from "../schema/contract";

export interface GeneratorConfig {
  contract: SyncContract;
  outputDir: string;
}
