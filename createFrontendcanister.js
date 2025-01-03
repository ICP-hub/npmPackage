import { HttpAgent } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { ICManagementCanister, InstallMode } from "@dfinity/ic-management";
import { Principal } from "@dfinity/principal";
import { readFile } from "fs/promises";
import dotenv from "dotenv";
import { join } from "path";
import { IDL } from "@dfinity/candid";
import { Actor } from "@dfinity/agent";
import { idlFactory as frontendIdlFactory } from "./npmpackage_frontend.did.js";
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

const FRONTEND_WASM_PATH = join(process.cwd(), "assetstorage.wasm");
const host = process.env.IC_ENV === "local" ? "http://127.0.0.1:4943":"https://ic0.app";

async function createAgent() {
  const identity = Ed25519KeyIdentity.generate();
  const agent = await HttpAgent.create({
    identity,
    host: host,
  });
  if (process.env.NODE_ENV !== "production") {
    await agent.fetchRootKey();
  }
  return agent;
}

async function createFrontendCanister() {
  try {
    const agent = await createAgent();
    const managementCanister = ICManagementCanister.create({ agent });
    const newFrontendCanisterId =
      await managementCanister.provisionalCreateCanisterWithCycles({
        cycles: 1000000000000,
      });

    const CanisterId = newFrontendCanisterId.toText();
    process.env["CANISTER_ID"] = newFrontendCanisterId.toText();
    canisterStatus(managementCanister, CanisterId);
    fetchCanisterLogs(managementCanister, CanisterId);
    await install(managementCanister, newFrontendCanisterId);

    const FrontendCanisterActor = Actor.createActor(frontendIdlFactory, {
      agent,
      canisterId: newFrontendCanisterId.toText(),
    });
    await uploadFrontEndAssets(FrontendCanisterActor,CanisterId);
  } catch (error) {
    console.error("Error creating canister:", error);
  }
}

async function canisterStatus(managementCanister, CanisterId) {
  try {
    if (!CanisterId) {
      throw new Error("Cannot fetch status: canisterId is not provided.");
    }

    const canisterPrincipal = Principal.fromText(CanisterId);

    console.log(`Fetching status for canister: ${canisterPrincipal.toText()}`);
  } catch (error) {
    console.error(
      `Error fetching status for canister ${CanisterId || "unknown"}:`,
      error.message || error
    );
  }
}

async function fetchCanisterLogs(managementCanister, CanisterId) {
  try {
    if (!CanisterId) {
      throw new Error("Cannot fetch logs: canisterId is not provided.");
    }

    const canisterPrincipal = Principal.fromText(CanisterId);

    const logs = await managementCanister.fetchCanisterLogs(canisterPrincipal);
    console.log(`Logs for canister ${canisterPrincipal.toText()}:`, logs);
  } catch (error) {
    console.error(
      `Error fetching logs for canister ${CanisterId || "unknown"}:`,
      error.message || error
    );
  }
}

async function install(managementCanister, canisterId) {
  try {
    const wasmBuffer = await readFile(FRONTEND_WASM_PATH);
    if (!wasmBuffer || wasmBuffer.length === 0) {
      throw new Error("WASM file is empty or could not be read.");
    }
    const initArgs = {
      owner: Principal.fromText(
        "6ydm4-srext-xsaic-y3v2x-cticp-5n6pf-2meh7-j43r6-rghg7-pt5nd-bqe"
      ),
      name: "assetstorage.wasm",
    };

    const candidType = IDL.Record({
      owner: IDL.Principal,
      name: IDL.Text,
    });

    const arg = IDL.encode([candidType], [initArgs]);

    const wasmModule = new Uint8Array(wasmBuffer);
    await managementCanister.installCode({
      mode: InstallMode.Install,
      canisterId,
      wasmModule,
      arg,
    });
    } catch (error) {
    console.error("Error during code installation:", error?.message || error);
  }
}

async function uploadFrontEndAssets(FrontendCanisterActor,CanisterId) {
  try {
    const distPath = './dist';
    const files = await getFiles(distPath);
    console.log("please wait code is installing...");

    for (const file of files) {
      const filePath = path.join(distPath, file);
      const fileContent = await fs.readFile(filePath);
      const fileKey = `/${file.replace(/\\/g, '/')}`;

      const args = {
        key: fileKey,
        content: new Uint8Array(fileContent),
        content_type: getMimeType(file),
        content_encoding: "identity",
        sha256: [], 
        aliased: [],
      };
    await FrontendCanisterActor.store(args);
    }

    const blueBold = "\x1b[1;34m"; 
    const whiteBright = "\x1b[1;37m"; 
    const reset = "\x1b[0m";
    
    console.log(`${whiteBright}Front-end-canister : ${blueBold}http://${CanisterId}.localhost:4943/${reset}`);
    console.log(`${whiteBright}Front-end-canister : ${blueBold}${host}/?canisterId=${CanisterId}${reset}`);
    

  } catch (error) {
    console.error('Error uploading assets:', error);
  }
}

async function getFiles(dir, fileList = [], baseDir = dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await getFiles(fullPath, fileList, baseDir);
    } else {
      const relativePath = path.relative(baseDir, fullPath);
      fileList.push(relativePath);
    }
  }
  return fileList;
}

function getMimeType(fileName) {
  if (fileName.endsWith('.html')) return 'text/html';
  if (fileName.endsWith('.css')) return 'text/css';
  if (fileName.endsWith('.js')) return 'application/javascript';
  if (fileName.endsWith('.svg')) return 'image/svg+xml';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}


export {
  createAgent,
  createFrontendCanister,
  canisterStatus,
  fetchCanisterLogs,
  install,
};
