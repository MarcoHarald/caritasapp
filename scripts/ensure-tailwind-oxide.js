#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const { execSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

function isLinuxX64() {
  return process.platform === "linux" && process.arch === "x64";
}

function isMusl() {
  if (typeof process.report?.getReport === "function") {
    const report = process.report.getReport();
    return !report?.header?.glibcVersionRuntime;
  }

  return false;
}

function resolveOxideVersion() {
  // This package is installed with @tailwindcss/postcss.
  // We reuse its version to install a matching native binding.
  const oxidePkg = require("@tailwindcss/oxide/package.json");
  return oxidePkg.version;
}

function ensureBindingInstalled() {
  if (!isLinuxX64()) {
    return;
  }

  const variant = isMusl() ? "musl" : "gnu";
  const packageName = `@tailwindcss/oxide-linux-x64-${variant}`;
  const modulePath = path.join("node_modules", packageName);

  if (existsSync(modulePath)) {
    return;
  }

  const version = resolveOxideVersion();
  const installTarget = `${packageName}@${version}`;
  console.log(
    `[tailwind-fix] Missing ${packageName}; installing ${installTarget}...`,
  );

  execSync(`npm install --no-save --ignore-scripts ${installTarget}`, {
    stdio: "inherit",
  });

  if (!existsSync(modulePath)) {
    throw new Error(`[tailwind-fix] Failed to install ${installTarget}`);
  }

  console.log(`[tailwind-fix] Installed ${installTarget}`);
}

ensureBindingInstalled();
