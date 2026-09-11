import { readFileSync, writeFileSync } from "fs";

// Bumps manifest.json + versions.json to the npm version (run via `npm version`).
const targetVersion = process.env.npm_package_version;

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");

// Only ever add a version, never rewrite one: re-running for a version that
// already shipped must not silently change the minAppVersion recorded against it.
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
const isNew = !(targetVersion in versions);
if (isNew) {
  versions[targetVersion] = minAppVersion;
  writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
}

console.log(
  isNew
    ? `Bumped to ${targetVersion} (minAppVersion ${minAppVersion})`
    : `Bumped manifest to ${targetVersion}; versions.json already maps it to ${versions[targetVersion]}`
);
