import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateProtobufWorkspaceArtifacts } from "../../packages/baresync/src/generator";
import protobufWorkspaceConfig from "./sync-proto.config";

function compareFiles(expectedPath: string, actualPath: string): void {
  const expected = fs.readFileSync(expectedPath, "utf-8");
  const actual = fs.readFileSync(actualPath, "utf-8");

  if (expected !== actual) {
    throw new Error(`Drift detected for ${expectedPath}`);
  }
}

function runGenerateCheck(): void {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "baresync-protobuf-"));
  try {
    const tempConfig = {
      ...protobufWorkspaceConfig,
      outputDir: tmpDir,
      outputs: {
        ...protobufWorkspaceConfig.outputs,
        proto: path.join(tmpDir, "proto", "sync.proto"),
        runtimeSourceTs: path.join(tmpDir, "runtime.ts"),
        rustSyncMappers: path.join(tmpDir, "rust", "protobuf_generated.rs"),
        runtimeTs: path.join(tmpDir, "runtime.generated.ts"),
        syncTs: path.join(tmpDir, "sync.generated.ts"),
      },
    };

    generateProtobufWorkspaceArtifacts(tempConfig);

    compareFiles(
      path.join(protobufWorkspaceConfig.outputDir, "sync-contract.json"),
      path.join(tmpDir, "sync-contract.json")
    );
    compareFiles(
      path.join(protobufWorkspaceConfig.outputDir, "sync-table-order.ts"),
      path.join(tmpDir, "sync-table-order.ts")
    );
    compareFiles(
      protobufWorkspaceConfig.outputs.proto,
      tempConfig.outputs.proto
    );
    compareFiles(
      protobufWorkspaceConfig.outputs.runtimeSourceTs,
      tempConfig.outputs.runtimeSourceTs
    );
    compareFiles(
      protobufWorkspaceConfig.outputs.syncTs,
      tempConfig.outputs.syncTs
    );
    compareFiles(
      protobufWorkspaceConfig.outputs.rustSyncMappers,
      tempConfig.outputs.rustSyncMappers
    );
    compareFiles(
      protobufWorkspaceConfig.outputs.runtimeTs,
      tempConfig.outputs.runtimeTs
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function runGenerate(): void {
  generateProtobufWorkspaceArtifacts(protobufWorkspaceConfig);
}

const isCheck = ((process as { argv?: string[] }).argv ?? []).includes(
  "--check"
);

if (isCheck) {
  runGenerateCheck();
} else {
  runGenerate();
}
