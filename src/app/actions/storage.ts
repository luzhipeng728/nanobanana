"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET_NAME } from "@/lib/r2";
import { v4 as uuidv4 } from "uuid";
import { compressImage } from "@/lib/image-utils";

export async function getPresignedUploadUrl(contentType: string = "image/png") {
  // 根据 contentType 确定扩展名
  const ext = contentType.includes("png") ? "png" : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
  const fileName = `nanobanana/images/${uuidv4()}.${ext}`;

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

  // Convert file to buffer
  const arrayBuffer = await file.arrayBuffer();
  const originalBuffer = Buffer.from(arrayBuffer);

  // Compress image if needed (max 2MB for uploads, to keep UI responsive)
  let finalBuffer: Buffer;
  let finalMimeType: string;
  let finalExt: string;

  try {
    const compressed = await compressImage(originalBuffer, {
      maxWidth: 2048,
      maxHeight: 2048,
      maxSizeBytes: 1 * 1024 * 1024, // 1MB max
      quality: 0.85,
      format: 'jpeg'
    });

    finalBuffer = compressed.buffer;
    finalMimeType = compressed.mimeType;
    finalExt = 'jpg';

    if (compressed.wasCompressed) {
      console.log(
        `[Storage] Image compressed: ${(originalBuffer.length / 1024).toFixed(1)}KB -> ${(finalBuffer.length / 1024).toFixed(1)}KB`
      );
    }
  } catch (compressError) {
    // If compression fails, use original
    console.warn('[Storage] Image compression failed, using original:', compressError);
    finalBuffer = originalBuffer;
    finalMimeType = file.type;
    finalExt = file.name.split('.').pop() || 'png';
  }

  const fileName = `nanobanana/uploads/${uuidv4()}.${finalExt}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Body: finalBuffer,
    ContentType: finalMimeType,
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
    const fileName = `nanobanana/videos/${uuidv4()}.mp4`;

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

/**
 * 直接上传视频 Buffer 到 R2
 */
export async function uploadVideoBuffer(buffer: Buffer, fileName: string): Promise<string> {
  console.log(`[R2] Uploading video buffer, size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB, fileName: ${fileName}`);

  try {
    const key = `nanobanana/videos/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: "video/mp4",
    });

    await r2Client.send(command);
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    console.log(`[R2] Video uploaded successfully: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error("[R2] Error uploading video buffer:", error);
    throw new Error("Failed to upload video buffer to R2");
  }
}

/**
 * 从 Base64 上传视频到 R2
 */
export async function uploadVideoFromBase64(base64Data: string, mimeType: string = "video/mp4"): Promise<string> {
  console.log(`[R2] Uploading video from base64, mimeType: ${mimeType}`);

  try {
    const buffer = Buffer.from(base64Data, "base64");
    console.log(`[R2] Video size: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    // 根据 mimeType 确定扩展名
    const ext = mimeType.includes("mp4") ? "mp4" : mimeType.includes("webm") ? "webm" : "mp4";
    const fileName = `nanobanana/videos/${uuidv4()}.${ext}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: fileName,
      Body: buffer,
      ContentType: mimeType,
    });

    await r2Client.send(command);
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

    console.log(`[R2] Video uploaded successfully: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    console.error("[R2] Error uploading video from base64:", error);
    throw new Error("Failed to upload video to R2");
  }
}

