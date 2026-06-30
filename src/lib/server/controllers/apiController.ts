import db from "../db/db.js";
import crypto from "crypto";
import type { ApiKeyRecord } from "../types/db.js";
// synchronous, returns string directly
import { MaskString, CreateHash } from "./commonController.js";

interface ApiKeyInput {
  name: string;
  user_id?: number | null;
}
interface ApiKeyStatusInput {
  id: number;
  status: string;
}

interface ApiKeyDeleteInput {
  id: number;
}

function generateApiKey() {
  const prefix = "kener_";
  const randomKey = crypto.randomBytes(32).toString("hex"); // 64-character hexadecimal string
  return prefix + randomKey;
}

export const CreateNewAPIKey = async (data: ApiKeyInput): Promise<{ apiKey: string; name: string }> => {
  //generate a new key
  const apiKey = generateApiKey();
  const hashed_key = CreateHash(apiKey);
  //insert into db

  //data.name cant be empty
  if (!data.name) {
    throw new Error("Name is required");
  }

  await db.createNewApiKey({
    name: data.name,
    hashed_key: hashed_key,
    masked_key: MaskString(apiKey),
    user_id: data.user_id ?? null,
  });

  return {
    apiKey: apiKey,
    name: data.name,
  };
};

export const GetAllAPIKeys = async () => {
  return await db.getAllApiKeys();
};

//update status of api key
export const UpdateApiKeyStatus = async (data: ApiKeyStatusInput): Promise<number> => {
  return await db.updateApiKeyStatus(data);
};

export const DeleteApiKey = async (data: ApiKeyDeleteInput): Promise<number> => {
  if (!data.id || Number.isNaN(Number(data.id))) {
    throw new Error("Valid API key id is required");
  }
  return await db.deleteApiKey(Number(data.id));
};

export const VerifyAPIKey = async (apiKey: string): Promise<ApiKeyRecord | null> => {
  const hashed_key = CreateHash(apiKey);
  const record = await db.getApiKeyByHashedKey(hashed_key);
  if (record && record.status === "ACTIVE") {
    return record;
  }
  return null;
};
