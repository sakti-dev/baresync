import path from "node:path";
import { generateSyncArtifacts } from "./generator/index";
import type { SyncContract } from "./schema/contract";

export async function runGenerate(
  configPathOrContract: string | SyncContract,
  outputDir: string
): Promise<void> {
  let contract: SyncContract;

  if (typeof configPathOrContract === "string") {
    const absPath = path.resolve(configPathOrContract);
    const configModule = await import(absPath);
    contract = configModule.default ?? configModule.contract;

    if (!contract) {
      throw new Error(
        `No default export or "contract" export found in ${absPath}`
      );
    }
  } else {
    contract = configPathOrContract;
  }

  generateSyncArtifacts(contract, outputDir);
}
