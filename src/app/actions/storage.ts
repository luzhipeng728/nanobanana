"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET_NAME } from "@/lib/r2";
import { v4 as uuidv4 } from "uuid";

export async function getPresignedUploadUrl(contentType: string = "image/png") {
  const fileName = `${uuidv4()}.png`;
  
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    ContentType: contentType,
  });

  try {
    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 3600 });
    return { 
      uploadUrl: signedUrl, 
      key: fileName,
      publicUrl: `${process.env.R2_PUBLIC_URL}/${fileName}` 
    };
  } catch (error) {
    console.error("Error generating signed URL:", error);
    throw new Error("Failed to generate upload URL");
  }
}

