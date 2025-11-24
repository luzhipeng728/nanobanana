"use server";

import OpenAI from "openai";
import { uploadBufferToR2 } from "@/lib/r2";
import { GEMINI_IMAGE_MODELS, type GeminiImageModel, type ImageGenerationConfig } from "@/types/image-gen";

// OpenAI Client for Prompt Rewriting
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
});

export async function rewritePrompt(prompt: string) {
  if (!process.env.OPENAI_API_KEY) {
    return prompt + " (OpenAI Key Missing)";
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "zai-glm-4.6",
      messages: [
        {
          role: "system",
          content: "You are an expert AI art prompt engineer. Rewrite the user's prompt to be more descriptive, artistic, and suitable for a high-quality image generation model. Keep it under 100 words. Return only the rewritten prompt."
        },
        { role: "user", content: prompt }
      ],
    });

    return response.choices[0]?.message?.content || prompt;
  } catch (error) {
    console.error("OpenAI Rewrite Error:", error);
    return prompt;
  }
}

export async function generateImageAction(
  prompt: string,
  model: GeminiImageModel = "nano-banana-pro",
  configOptions: ImageGenerationConfig = {}
) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("Gemini API Key is missing");
  }

  const modelName = GEMINI_IMAGE_MODELS[model];

  console.log(`Generating image with model: ${modelName}, prompt: ${prompt.substring(0, 50)}...`);
  console.log(`Config:`, configOptions);

  // Build request body
  const requestBody: any = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],  // Only IMAGE
    },
  };

  // Add imageConfig if options provided
  if (configOptions.aspectRatio || configOptions.imageSize) {
    requestBody.generationConfig.imageConfig = {};
    if (configOptions.aspectRatio) {
      requestBody.generationConfig.imageConfig.aspectRatio = configOptions.aspectRatio;
    }
    if (configOptions.imageSize) {
      // 注意：API 使用 image_size (下划线) 而不是 imageSize
      requestBody.generationConfig.imageConfig.image_size = configOptions.imageSize;
    }
  }

  // API URL - 非流式 generateContent
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent`;

  try {
    // Use native fetch with curl-like request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': process.env.GEMINI_API_KEY || '',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log("Gemini API response received");

    // Parse response
    const candidates = data?.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned from Gemini API");
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      throw new Error("No content parts returned");
    }

    // Find the image part (inlineData) - iterate through parts
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        console.log("Image data found, processing...");
        const base64Data = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || "image/png";
        const buffer = Buffer.from(base64Data, "base64");

        console.log(`Image size: ${buffer.length} bytes, MIME type: ${mimeType}`);

        // Upload to R2
        const imageUrl = await uploadBufferToR2(buffer, mimeType);

        console.log(`Image uploaded to R2: ${imageUrl}`);

        return {
          success: true,
          imageUrl,
          prompt,
          model: modelName,
        };
      }
    }

    // If no image was found
    throw new Error("No image data found in response");

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
