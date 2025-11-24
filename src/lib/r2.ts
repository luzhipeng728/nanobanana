import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.warn("R2 credentials are missing in environment variables.");
}

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId || "",
    secretAccessKey: secretAccessKey || "",
  },
});

export const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "generated-images";
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || "";

export async function uploadBufferToR2(buffer: Buffer, contentType: string = "image/png", folder: string = "") {
  const fileName = `${folder ? folder + "/" : ""}${uuidv4()}.png`;
  
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Body: buffer,
    ContentType: contentType,
  });

  try {
    await r2Client.send(command);
    return `${R2_PUBLIC_URL}/${fileName}`;
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw new Error("Failed to upload image to storage");
  }
}
