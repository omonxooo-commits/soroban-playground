import { createHash } from "crypto";
import express from "express";
import { exec } from "child_process";
import fs from "fs/promises";
import path from "path";
import { buildCargoToml, sanitizeDependenciesInput } from "./compile_utils.js";
import { asyncHandler, createHttpError } from "../middleware/errorHandler.js";

const COMPILE_TIMEOUT_MS = 30_000;
const WASM_FILE_NAME = "soroban_contract.wasm";

function splitLogs(stdout, stderr) {
  return `${stdout ?? ""}\n${stderr ?? ""}`
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean);
}

function runCompileCommand(command, cwd) {
  return new Promise((resolve, reject) => {
    exec(
      command,
      {
        cwd,
        timeout: COMPILE_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject({ error, stdout, stderr });
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}

const router = express.Router();

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code.trim()) {
      throw createHttpError(400, "No code provided");
    }

    const sanitizedDepsResult = sanitizeDependenciesInput(req.body?.dependencies);
    if (!sanitizedDepsResult.ok) {
      throw createHttpError(400, "Invalid dependencies payload", {
        details: sanitizedDepsResult.details ?? sanitizedDepsResult.error,
      });
    }

    const tempDir = path.resolve(
      process.cwd(),
      `.tmp_compile_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`,
    );

    try {
      await fs.mkdir(tempDir, { recursive: true });
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      await fs.writeFile(path.join(tempDir, "Cargo.toml"), buildCargoToml(sanitizedDepsResult.deps));
      await fs.writeFile(path.join(tempDir, "src", "lib.rs"), code);

      let stdout = "";
      let stderr = "";
      try {
        const compileResult = await runCompileCommand(
          "cargo build --target wasm32-unknown-unknown --release",
          tempDir,
        );
        stdout = compileResult.stdout;
        stderr = compileResult.stderr;
      } catch (commandFailure) {
        stdout = commandFailure.stdout ?? "";
        stderr = commandFailure.stderr ?? commandFailure.error?.message ?? "";
        throw createHttpError(500, "Compilation failed", {
          details: stderr || commandFailure.error?.message || "Build failed",
          logs: splitLogs(stdout, stderr),
        });
      }

      const wasmPath = path.join(tempDir, "target", "wasm32-unknown-unknown", "release", WASM_FILE_NAME);
      let wasmStat;
      let wasmBytes;
      try {
        wasmStat = await fs.stat(wasmPath);
        wasmBytes = await fs.readFile(wasmPath);
      } catch (readError) {
        throw createHttpError(500, "WASM file not generated", {
          details: stderr || readError.message,
          logs: splitLogs(stdout, stderr),
        });
      }

      res.json({
        success: true,
        status: "success",
        message: "Contract compiled successfully",
        logs: splitLogs(stdout, stderr),
        artifact: {
          name: WASM_FILE_NAME,
          sizeBytes: wasmStat.size,
          createdAt: new Date(wasmStat.birthtime ?? Date.now()).toISOString(),
        },
        wasmBase64: wasmBytes.toString("base64"),
        wasmSha256: createHash("sha256").update(wasmBytes).digest("hex"),
      });
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  }),
);

export default router;
