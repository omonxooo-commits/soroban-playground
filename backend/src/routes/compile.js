import express from "express";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import config from "../config/index.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "No code provided" });

<<<<<<< HEAD
  // Unique temp directory per compile
=======
  // Define a temporary working directory for this compilation
>>>>>>> 5b54cbf (feat/ add environment variable management via dotenv)
  const uniqueSuffix =
    Date.now() + "_" + Math.random().toString(36).substring(2, 8);
  const tempDir = path.resolve(
    process.cwd(),
    config.compile.tempDirPrefix + uniqueSuffix,
  );

  try {
    // Scaffold a temp Rust project
    await fs.mkdir(tempDir, { recursive: true });
    await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

    // Write Cargo.toml using configured soroban-sdk version
    const cargoToml = `
[package]
name = "soroban_contract"
version = "0.0.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
soroban-sdk = "${config.compile.sorobanSdkVersion}"

[profile.release]
opt-level = "z"
overflow-checks = true
debug = 0
strip = "symbols"
debug-assertions = false
panic = "abort"
codegen-units = 1
lto = true
`;
    await fs.writeFile(path.join(tempDir, "Cargo.toml"), cargoToml);

    // Write the contract code
    await fs.writeFile(path.join(tempDir, "src", "lib.rs"), code);

<<<<<<< HEAD
    // Build command and timeout come from config
=======
    // Execute Soroban CLI (or cargo block)
    // Note: In a real server you might queue these or containerize. Here we spawn.
    // The build command is configurable via environment variable or defaults in config.
>>>>>>> 5b54cbf (feat/ add environment variable management via dotenv)
    const command = config.compile.command;

    exec(
      command,
      { cwd: tempDir, timeout: config.compile.timeoutMs },
      async (err, stdout, stderr) => {
        const cleanUp = async () => {
          try {
            await fs.rm(tempDir, { recursive: true, force: true });
          } catch (e) {
            console.error("Failed to clean up:", e);
          }
        };

        if (err) {
          await cleanUp();
          return res.status(500).json({
            error: "Compilation failed",
            status: "error",
            details: stderr || err.message,
            logs: stderr ? stderr.split("\n").filter((l) => l.trim()) : [],
          });
        }

        // Check if wasm exists
        const wasmPath = path.join(
          tempDir,
          ...config.compile.wasmTargetSubpath.split("/"),
          config.compile.wasmFilename,
        );

        try {
          const fileStats = await fs.stat(wasmPath);
          await cleanUp();
          return res.json({
            success: true,
            status: "success",
            message: "Contract compiled successfully",
            logs: (stdout + (stderr ? "\n" + stderr : ""))
              .split("\n")
              .filter((l) => l.trim()),
            artifact: {
              name: config.compile.wasmFilename,
              sizeBytes: fileStats.size,
              createdAt: fileStats.birthtime,
            },
          });
        } catch (e) {
          await cleanUp();
          return res.status(500).json({
            error: "WASM file not generated",
            status: "error",
            details: stderr || e.message,
            logs: stderr ? stderr.split("\n").filter((l) => l.trim()) : [],
          });
        }
      },
    );
  } catch (err) {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (cleanupErr) {}
    res
      .status(500)
      .json({ error: "Internal server error", details: err.message });
  }
});

export default router;
