import { generateSyncArtifacts } from "baresync/generator";
import { syncContract } from "./src/schema";

generateSyncArtifacts({
  contract: syncContract,
  outputDir: "./generated",
});
