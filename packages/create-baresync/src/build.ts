import fs from "node:fs/promises";
import path from "node:path";

declare const Bun: {
  build(options: {
    entryNaming: string;
    entrypoints: string[];
    format: "esm";
    outdir: string;
    root: string;
    target: "bun";
  }): Promise<unknown>;
};

async function main() {
  await Bun.build({
    entrypoints: ["./src/cli.ts", "./src/index.ts"],
    outdir: "./dist",
    root: "./src",
    target: "bun",
    format: "esm",
    entryNaming: "[name].js",
  });

  await fs.cp(path.join("src", "templates"), path.join("dist", "templates"), {
    recursive: true,
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
