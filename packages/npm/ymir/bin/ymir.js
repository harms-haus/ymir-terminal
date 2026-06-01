#!/usr/bin/env node

'use strict';

var path = require('path');
var fs = require('fs');
var childProcess = require('child_process');

function getPlatformPackageName() {
  var platform = process.platform;
  var arch = process.arch;

  if (platform === 'linux' && arch === 'x64') {
    return 'ymir-linux-x64';
  }
  if (platform === 'win32' && arch === 'x64') {
    return 'ymir-windows-x64';
  }

  return null;
}

function getBinaryName() {
  return process.platform === 'win32' ? 'ymir.exe' : 'ymir';
}

function tryResolveFromOptionalDep() {
  var pkgName = getPlatformPackageName();
  if (!pkgName) return null;

  try {
    var pkgPath = require.resolve(pkgName + '/package.json');
    var pkgDir = path.dirname(pkgPath);
    var binaryPath = path.join(pkgDir, 'bin', getBinaryName());

    if (fs.existsSync(binaryPath)) {
      return binaryPath;
    }
  } catch (_) {
    // optional dependency not installed
  }

  return null;
}

function tryResolveFromHomeDir() {
  var homeDir = process.platform === 'win32' ? process.env.LOCALAPPDATA : process.env.HOME;

  if (!homeDir) return null;

  var dirName = process.platform === 'win32' ? 'ymir' : '.ymir';
  var binaryPath = path.join(homeDir, dirName, getBinaryName());

  if (fs.existsSync(binaryPath)) {
    return binaryPath;
  }

  return null;
}

function findBinary() {
  // 1. Try optional dependency package
  var fromDep = tryResolveFromOptionalDep();
  if (fromDep) return fromDep;

  // 2. Try ~/.ymir/ or %LOCALAPPDATA%/.ymir/
  var fromHome = tryResolveFromHomeDir();
  if (fromHome) return fromHome;

  // 3. Fall back to 'ymir' in PATH
  return getBinaryName();
}

var binary = findBinary();

try {
  var result = childProcess.execFileSync(binary, process.argv.slice(2), {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result || 0);
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error(
      'Error: ymir binary not found.\n' +
        'Tried:\n' +
        '  - Optional dependency package\n' +
        '  - ~/.ymir/ymir\n' +
        '  - PATH lookup\n\n' +
        "Please install ymir or run 'npm install' to download the binary.",
    );
    process.exit(1);
  }
  if (typeof err.status === 'number') {
    process.exit(err.status);
  }
  throw err;
}
