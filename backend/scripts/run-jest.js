const { spawnSync } = require("child_process");
const path = require("path");

const flag = "--experimental-vm-modules";
const existing = process.env.NODE_OPTIONS || "";
const nodeOptions = existing.includes(flag)
  ? existing
  : existing
    ? `${existing} ${flag}`
    : flag;

const env = { ...process.env, NODE_OPTIONS: nodeOptions };

const jestPath = path.join(
  path.dirname(require.resolve("jest/package.json")),
  "bin",
  "jest.js",
);

const result = spawnSync(
  process.execPath,
  [jestPath, ...process.argv.slice(2)],
  { stdio: "inherit", env },
);

process.exit(result.status === null ? 1 : result.status);
