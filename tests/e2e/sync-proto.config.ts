import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ProtobufWorkspaceConfig } from "../../packages/baresync/src/generator";
import { syncContract } from "../fixture-app/src/fixture-schema";

const packageRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = join(packageRoot, "generated", "protobuf");

export const protobufWorkspaceConfig = {
  contract: syncContract,
  outputDir,
  outputs: {
    proto: join(outputDir, "proto", "sync.proto"),
    runtimeSourceTs: join(outputDir, "runtime.ts"),
    rustSyncMappers: join(
      packageRoot,
      "..",
      "fixture-app",
      "src-tauri",
      "src",
      "protobuf_generated.rs"
    ),
    runtimeTs: join(outputDir, "runtime.generated.ts"),
    syncTs: join(outputDir, "sync.generated.ts"),
  },
} satisfies ProtobufWorkspaceConfig;

export default protobufWorkspaceConfig;
