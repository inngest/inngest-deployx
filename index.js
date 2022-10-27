#!/usr/bin/env node
const path = require("node:path");
const fs = require("node:fs");
const cp = require("node:child_process");
const { promisify } = require("node:util");

const spawn = cp.spawn;
const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const exec = promisify(cp.exec);

const DOCKERFILE_NAME = "Dockerfile.inngest";

const build = async (filenameOrDir) => {
  // TODO: Add directory support
  const fnFilename = filenameOrDir;
  const entryPoint = path.join(process.cwd(), fnFilename);
  const output = path.join(process.cwd(), "bundle.js");

  return require("esbuild")
    .build({
      entryPoints: [entryPoint],
      bundle: true,
      format: "cjs",
      platform: "node",
      outfile: output,
    })
    .catch((err) => {
      console.log("Failed to bundle Inngest function");
      process.exit(1);
    })
    .then(() => {
      return output;
    });
};

const readConfig = async (bundleFilename) => {
  const functionExports = require(bundleFilename);
  const u = new URL("https://placeholder.com");
  // XXX: Assume default export for now
  const fn = functionExports.default;
  const config = fn.getConfig(u, "placeholder");
  if (Object.keys(config.steps).length > 1) {
    throw new Error("Step functions are not yet supported");
  }
  return config;
};

const updateConfig = (config) => {
  const stepIds = Object.keys(config.steps);
  // Change runtime to Docker
  stepIds.forEach((stepId) => {
    config.steps[stepId].path = `file://.`;
    config.steps[stepId].runtime = {
      type: "docker",
      dockerfile: `./${DOCKERFILE_NAME}`,
    };
  });
  return config;
};

const getNodeVersion = async () => {
  try {
    const installedVersion = await exec("node -v");
    return installedVersion.stdout.replace(/^v/, "").trim();
  } catch (e) {
    // node installation cannot be found
  }
  // TODO - Support checking package.json's "engines"
  return "16.16.0";
};

// TODO - Check current Node.js version or package.json's engine
const createDockerfile = async () => {
  const nodeVersion = await getNodeVersion();
  const contents = `FROM node:${nodeVersion}-buster-slim
WORKDIR /opt/
COPY ${filename} run.js /opt/
ENTRYPOINT ["node", "./run.js"]`;
  const dockerfileName = path.join(process.cwd(), DOCKERFILE_NAME);
  await writeFile(dockerfileName, contents, "utf-8");
  return dockerfileName;
};

const writeConfigFile = async (config) => {
  const filename = path.join(process.cwd(), "inngest.json");
  await writeFile(filename, JSON.stringify(config, null, 2), "utf8");
  return filename;
};
const writeRunScript = async (stepId = "step") => {
  const filename = path.join(process.cwd(), "run.js");
  const contents = `const fn = require("./bundle");
const run = async function () {
  const stepId = "${stepId}";
  let data = null
  try {
    data = JSON.parse(process.argv.pop())
  } catch (e) {
    console.log(JSON.stringify({ status: 500, body: "Failed to parse args" }));
    process.exit(1)
  }
  try {
    // XXX: Assume default export for now
    const result = await fn.default["runStep"](stepId, data);
    if (typeof result.status !== "undefined") {
      console.log(JSON.stringify(result));
    } else {
      console.log(JSON.stringify({ status: 200, body: result }));
    }
  } catch (e) {
    const error = e.stack || e.message;
    console.log(JSON.stringify({ status: 500, body: error, error }));
    process.exit(1);
  }
};
run();`;
  await writeFile(filename, contents, "utf8");
  return filename;
};

const getArgs = () => {
  const [, , ...args] = process.argv;
  const flags = args.filter((a) => a.match(/^--/));
  const filenameOrDir = args.find((a) => !a.match(/^--/));
  return {
    filenameOrDir,
    flags,
  };
};

const deploy = async (flags = []) =>
  new Promise(function (resolve, reject) {
    try {
      const cmd = spawn("npx", ["inngest-cli", "deploy", ...flags]);
      cmd.stdout.on("data", (data) => {
        console.log(data.toString());
      });
      cmd.stderr.on("data", (data) => {
        console.log(data.toString());
      });
      cmd.on("exit", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(code);
        }
      });
    } catch (e) {
      reject(e);
    }
  });

const cleanup = async (filenames) => {
  return Promise.all(filenames.map((f) => unlink(f)));
};

const main = async () => {
  const { filenameOrDir, flags } = getArgs();
  const outfile = await build(filenameOrDir);
  const config = await readConfig(outfile);
  const dockerfile = await createDockerfile();
  const dockerConfig = updateConfig(config);
  const configFile = await writeConfigFile(dockerConfig);
  const runFile = await writeRunScript();

  try {
    await deploy(flags);
  } catch (e) {
    console.log("Deployment failed!");
    console.log(e);
    process.exit(1);
  }

  // Cleanup
  await cleanup([dockerfile, configFile, runFile]);
};

main();
