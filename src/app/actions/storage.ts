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

export async function uploadImageToR2(formData: FormData) {
  const file = formData.get('file') as File;
  if (!file) {
    throw new Error("No file provided");
  }

  // Get file extension
  const ext = file.name.split('.').pop() || 'png';
  const fileName = `${uuidv4()}.${ext}`;

  // Convert file to buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Body: buffer,
    ContentType: file.type,
  });

  try {
    await r2Client.send(command);
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;
    return publicUrl;
  } catch (error) {
    console.error("Error uploading to R2:", error);
    throw new Error("Failed to upload image");
  }
}

/**
 * 从 URL 下载视频并上传到 R2
 */
export async function uploadVideoFromUrl(videoUrl: string): Promise<string> {
  console.log(`[R2] Downloading video from: ${videoUrl.substring(0, 100)}...`);

  try {
    // 下载视频
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[R2] Downloaded video, size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    // 生成文件名
    const fileName = `videos/${uuidv4()}.mp4`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: "video/mp4",
    });

    await r2Client.send(command);
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

    console.log(`[R2] Video uploaded successfully: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error("[R2] Error uploading video:", error);
    throw new Error("Failed to upload video to R2");
  }
}

