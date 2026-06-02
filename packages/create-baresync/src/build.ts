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

  const templatesSrc = path.join("src", "templates");
  const templatesDst = path.join("dist", "templates");

  await fs.cp(templatesSrc, templatesDst, { recursive: true });

  const response = await fetch("https://registry.npmjs.org/baresync/latest");
  const baresyncPkg = await response.json();
  const baresyncVersion: string = baresyncPkg.version;

  const pkgFiles = [
    path.join(templatesDst, "app", "package.json"),
    path.join(templatesDst, "server", "package.json"),
    path.join(templatesDst, "sync-contract", "package.json"),
  ];

  for (const file of pkgFiles) {
    const content = await fs.readFile(file, "utf8");
    await fs.writeFile(
      file,
      content.replaceAll("__BARESYNC_VERSION__", baresyncVersion)
    );
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
