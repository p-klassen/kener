import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import db from "../db/db.js";

const saltRounds = 12;

function getJwtSecret(): string {
  const secret = process.env.KENER_SECRET_KEY;
  if (!secret) throw new Error("KENER_SECRET_KEY environment variable is required but not set");
  return secret;
}

export const ValidatePassword = (password: string): boolean => {
  return /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/.test(password);
};

export const HashPassword = async (plainTextPassword: string): Promise<string> => {
  try {
    const hash = await bcrypt.hash(plainTextPassword, saltRounds);
    return hash;
  } catch (err) {
    console.error("Error hashing password:", err);
    throw err;
  }
};
export const VerifyPassword = async (plainTextPassword: string, hashedPassword: string): Promise<boolean> => {
  try {
    const isMatch = await bcrypt.compare(plainTextPassword, hashedPassword);
    return isMatch;
  } catch (err) {
    // bcrypt throws on malformed hashes — treat as failed verification, not a server error
    console.error("Error verifying password:", err);
    return false;
  }
};
import type { TokenPayload, EmailTokenPayload } from "$lib/server/types/auth.js";
import type { SMTPConfiguration } from "../notification/types";

export interface ResendConfiguration {
  resend_api_key: string;
  resend_sender_email: string;
}

export const VerifyToken = async (token: string): Promise<TokenPayload | EmailTokenPayload | undefined> => {
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    if (typeof decoded === "string") {
      return undefined;
    }
    return decoded as TokenPayload | EmailTokenPayload;
  } catch (err) {
    return undefined;
  }
};

export const GetSMTPFromENV = (): SMTPConfiguration | null => {
  //if variables are not return null
  const smtpPassword = process.env.SMTP_PASS || process.env.SMTP_PASSWORD;
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_SENDER;
  if (
    !!!process.env.SMTP_HOST ||
    !!!process.env.SMTP_PORT ||
    !!!process.env.SMTP_USER ||
    !!!fromEmail ||
    !!!smtpPassword
  ) {
    return null;
  }

  return {
    smtp_host: process.env.SMTP_HOST,
    smtp_port: Number(process.env.SMTP_PORT),
    smtp_user: process.env.SMTP_USER,
    smtp_sender: fromEmail,
    smtp_pass: smtpPassword,
    smtp_secure: !!Number(process.env.SMTP_SECURE),
  };
};

export const GetSMTPConfig = async (): Promise<SMTPConfiguration | null> => {
  const fromEnv = GetSMTPFromENV();
  if (fromEnv) return fromEnv;
  const row = await db.getSiteDataByKey("smtp");
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as SMTPConfiguration;
  } catch {
    return null;
  }
};

export const GetResendFromENV = (): ResendConfiguration | null => {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_SENDER_EMAIL) return null;
  return {
    resend_api_key: process.env.RESEND_API_KEY,
    resend_sender_email: process.env.RESEND_SENDER_EMAIL,
  };
};

export const GetResendConfig = async (): Promise<ResendConfiguration | null> => {
  const fromEnv = GetResendFromENV();
  if (fromEnv) return fromEnv;
  const row = await db.getSiteDataByKey("resend");
  if (!row?.value) return null;
  try {
    return JSON.parse(row.value) as ResendConfiguration;
  } catch {
    return null;
  }
};

export const GenerateTokenWithExpiry = async (data: object, expiry: string): Promise<string> => {
  try {
    const token = jwt.sign(data, getJwtSecret(), {
      expiresIn: expiry,
    } as jwt.SignOptions);
    return token;
  } catch (err) {
    console.error("Error generating token with expiry:", err);
    throw err;
  }
};

export const GenerateTokenWithJTI = async (data: object, expiry: string): Promise<string> => {
  try {
    const token = jwt.sign(data, getJwtSecret(), {
      expiresIn: expiry,
      jwtid: crypto.randomUUID(),
    } as jwt.SignOptions);
    return token;
  } catch (err) {
    console.error("Error generating token with JTI:", err);
    throw err;
  }
};

export const ForgotPasswordJWT = async (data: object): Promise<string> => {
  try {
    const token = jwt.sign(data, getJwtSecret(), {
      expiresIn: "1h",
      jwtid: crypto.randomUUID(),
    } as jwt.SignOptions);
    return token;
  } catch (err) {
    console.error("Error generating token:", err);
    throw err;
  }
};
export const GenerateToken = async (data: object): Promise<string> => {
  try {
    const token = jwt.sign(data, getJwtSecret(), {
      expiresIn: "24h",
    } as jwt.SignOptions);
    return token;
  } catch (err) {
    console.error("Error generating token:", err);
    throw err;
  }
};

export const CookieConfig = (): {
  name: string;
  secure: boolean;
  maxAge: number;
  httpOnly: boolean;
  sameSite: "lax" | "strict" | "none";
  path: string;
} => {
  //get base path from env
  let cookiePath = !!process.env.KENER_BASE_PATH ? process.env.KENER_BASE_PATH : "/";

  let isSecuredDomain = false;
  if (!!process.env.ORIGIN) {
    isSecuredDomain = process.env.ORIGIN.startsWith("https://");
  }
  return {
    name: "kener-user",
    secure: isSecuredDomain,
    maxAge: 24 * 60 * 60, // 24 hours in seconds
    httpOnly: true,
    sameSite: "lax",
    path: cookiePath,
  };
};
export const MaskString = (str: string): string => {
  const len = str.length;
  const mask = "*";
  const masked = mask.repeat(len - 4) + str.substring(len - 4);
  return masked;
};

export const CreateHash = (apiKey: string): string => {
  return crypto
    .createHmac("sha256", getJwtSecret())
    .update(apiKey)
    .digest("hex");
};

//create md5 hash
export const CreateMD5Hash = (data: string): string => {
  return crypto.createHash("md5").update(data).digest("hex");
};
