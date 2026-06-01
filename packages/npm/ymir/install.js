#!/usr/bin/env node

"use strict";

var fs = require("fs");
var path = require("path");
var https = require("https");
var zlib = require("zlib");

var GITHUB_REPO = "harms-haus/ymir";

function getPlatformInfo() {
  var platform = process.platform;
  var arch = process.arch;

  if (platform === "linux" && arch === "x64") {
    return { assetSuffix: "linux-x64", binaryName: "ymir" };
  }
  if (platform === "win32" && arch === "x64") {
    return { assetSuffix: "windows-x64", binaryName: "ymir.exe" };
  }

  return null;
}

function getInstallDir() {
  var base =
    process.platform === "win32"
      ? process.env.LOCALAPPDATA || process.env.USERPROFILE
      : process.env.HOME;

  if (!base) return null;

  return path.join(base, ".ymir");
}

function httpsGet(url, options) {
  return new Promise(function (resolve, reject) {
    var req = https.get(url, options || {}, function (res) {
      if (
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        resolve(httpsGet(res.headers.location, options));
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error("HTTP " + res.statusCode + " for " + url));
        return;
      }

      resolve(res);
    });

    req.on("error", reject);
  });
}

function httpsGetJSON(url) {
  return httpsGet(url, {
    headers: { "User-Agent": "ymir-npm-installer", Accept: "application/json" },
  }).then(function (res) {
    return new Promise(function (resolve, reject) {
      var body = "";
      res.setEncoding("utf8");
      res.on("data", function (chunk) {
        body += chunk;
      });
      res.on("end", function () {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
  });
}

function downloadFile(url, destPath) {
  return httpsGet(url, {
    headers: { "User-Agent": "ymir-npm-installer" },
  }).then(function (res) {
    return new Promise(function (resolve, reject) {
      var stream = require("stream");
      var writeStream = fs.createWriteStream(destPath);

      // Handle gzip-encoded responses
      if (res.headers["content-encoding"] === "gzip") {
        res.pipe(zlib.createGunzip()).pipe(writeStream);
      } else {
        res.pipe(writeStream);
      }

      writeStream.on("finish", function () {
        writeStream.close(resolve);
      });

      writeStream.on("error", reject);
      res.on("error", reject);
    });
  });
}

function chmodAddExecute(filePath) {
  try {
    var mode = fs.statSync(filePath).mode;
    fs.chmodSync(filePath, mode | 0o111);
  } catch (_) {
    // ignore chmod errors
  }
}

function main() {
  var platformInfo = getPlatformInfo();
  if (!platformInfo) {
    console.log(
      "ymir: Skipping binary download - unsupported platform (" +
        process.platform +
        "-" +
        process.arch +
        ")"
    );
    return;
  }

  var installDir = getInstallDir();
  if (!installDir) {
    console.log("ymir: Skipping binary download - cannot determine home directory");
    return;
  }

  // Create ~/.ymir directory
  try {
    if (!fs.existsSync(installDir)) {
      fs.mkdirSync(installDir, { recursive: true });
    }
  } catch (err) {
    console.log("ymir: Could not create install directory: " + err.message);
    return;
  }

  var binaryPath = path.join(installDir, platformInfo.binaryName);

  // Check if binary already exists
  if (fs.existsSync(binaryPath)) {
    return;
  }

  // Fetch latest release from GitHub
  var releaseUrl =
    "https://api.github.com/repos/" + GITHUB_REPO + "/releases/latest";

  httpsGetJSON(releaseUrl)
    .then(function (release) {
      if (!release || !release.assets) {
        console.log("ymir: No release assets found");
        return;
      }

      // Find matching asset
      var asset = null;
      for (var i = 0; i < release.assets.length; i++) {
        if (release.assets[i].name.indexOf(platformInfo.assetSuffix) !== -1) {
          asset = release.assets[i];
          break;
        }
      }

      if (!asset) {
        console.log(
          "ymir: No matching binary found for " + platformInfo.assetSuffix
        );
        return;
      }

      console.log("ymir: Downloading " + asset.name + "...");
      return downloadFile(asset.browser_download_url, binaryPath).then(
        function () {
          // Set executable permissions on Unix
          if (process.platform !== "win32") {
            chmodAddExecute(binaryPath);
          }
          console.log("ymir: Installed to " + binaryPath);
        }
      );
    })
    .catch(function (err) {
      console.log("ymir: Could not download binary: " + err.message);
    });
}

main();
