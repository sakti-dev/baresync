#!/usr/bin/env node
import { scaffoldProject } from "./scaffold.js";

scaffoldProject().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
