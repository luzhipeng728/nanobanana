/**
 * 上传示例图片到 R2 存储
 * 运行: npx tsx scripts/upload-examples.ts
 */

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

// 加载环境变量
dotenv.config({ path: ".env.local" });

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || "generated-images";
const publicUrl = process.env.R2_PUBLIC_URL || "";

if (!accountId || !accessKeyId || !secretAccessKey) {
  console.error("❌ R2 credentials are missing in environment variables.");
  process.exit(1);
}

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId,
    secretAccessKey: secretAccessKey,
  },
});

// 源文件夹路径
const SOURCE_DIR = "/Users/luzhipeng/projects/claude_agent/generated_all_20251124_154941/正常风格";

interface ImageMetadata {
  index: number;
  prompt: string;
  file: string;
  size: number;
  mime_type: string;
  resolution: string;
  aspect_ratio: string;
}

interface Metadata {
  style: string;
  total: number;
  images: ImageMetadata[];
}

interface ExampleImage {
  id: number;
  url: string;
  category: string;
  title: string;
  prompt: string;
}

// 从 prompt 中提取类别和标题
function extractCategoryAndTitle(prompt: string, index: number): { category: string; title: string } {
  // 根据 prompt 内容分类
  if (prompt.includes("文字海报生成")) {
    if (prompt.includes("创意Logo设计")) return { category: "文字海报", title: "创意Logo设计" };
    if (prompt.includes("城市艺术字")) return { category: "文字海报", title: "城市艺术字" };
    if (prompt.includes("美食促销")) return { category: "文字海报", title: "美食促销海报" };
  }
  if (prompt.includes("信息图生成")) {
    if (prompt.includes("植物养护")) return { category: "信息图", title: "植物养护指南" };
    if (prompt.includes("食谱")) return { category: "信息图", title: "中式食谱卡" };
    if (prompt.includes("产品对比")) return { category: "信息图", title: "产品对比图" };
  }
  if (prompt.includes("多语言翻译")) {
    if (prompt.includes("包装本地化")) return { category: "多语言翻译", title: "包装本地化" };
    if (prompt.includes("菜单设计")) return { category: "多语言翻译", title: "菜单设计" };
    if (prompt.includes("广告")) return { category: "多语言翻译", title: "广告多地区版本" };
  }
  if (prompt.includes("3D手办生成")) {
    if (prompt.includes("收藏级")) return { category: "3D手办", title: "收藏级手办" };
    if (prompt.includes("盲盒")) return { category: "3D手办", title: "盲盒潮玩" };
  }
  if (prompt.includes("多图融合")) {
    if (prompt.includes("旅行照")) return { category: "多图融合", title: "旅行照合成" };
    if (prompt.includes("虚拟试衣")) return { category: "多图融合", title: "虚拟试衣" };
    if (prompt.includes("电影海报")) return { category: "多图融合", title: "电影海报合成" };
  }
  if (prompt.includes("实时数据")) {
    if (prompt.includes("天气")) return { category: "实时数据", title: "天气信息图" };
    if (prompt.includes("股票")) return { category: "实时数据", title: "股票行情" };
    if (prompt.includes("体育")) return { category: "实时数据", title: "体育比分" };
  }
  if (prompt.includes("产品摄影")) {
    if (prompt.includes("电商")) return { category: "产品摄影", title: "电商主图" };
    if (prompt.includes("场景化")) return { category: "产品摄影", title: "场景化展示" };
  }
  if (prompt.includes("艺术风格")) {
    if (prompt.includes("油画")) return { category: "艺术风格", title: "油画转换" };
    if (prompt.includes("动漫")) return { category: "艺术风格", title: "动漫转换" };
  }
  if (prompt.includes("建筑可视化")) {
    if (prompt.includes("室内")) return { category: "建筑可视化", title: "室内效果图" };
    if (prompt.includes("外观")) return { category: "建筑可视化", title: "外观效果图" };
  }
  if (prompt.includes("UI设计")) {
    if (prompt.includes("App")) return { category: "UI设计", title: "App界面原型" };
    if (prompt.includes("网页")) return { category: "UI设计", title: "网页落地页" };
  }
  if (prompt.includes("漫画生成")) {
    if (prompt.includes("四格")) return { category: "漫画生成", title: "四格漫画" };
    if (prompt.includes("分镜")) return { category: "漫画生成", title: "电影分镜稿" };
  }

  return { category: "示例", title: `示例 ${index}` };
}

async function uploadImage(filePath: string, fileName: string): Promise<string> {
  const fileContent = fs.readFileSync(filePath);
  const key = `nanobanana/examples/${fileName}`;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileContent,
    ContentType: "image/jpeg",
  });

  await r2Client.send(command);
  return `${publicUrl}/${key}`;
}

async function main() {
  console.log("📁 Reading metadata...");

  const metadataPath = path.join(SOURCE_DIR, "metadata.json");
  const metadata: Metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));

  console.log(`📷 Found ${metadata.images.length} images to upload\n`);

  const exampleImages: ExampleImage[] = [];

  for (const image of metadata.images) {
    const filePath = path.join(SOURCE_DIR, image.file);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${image.file}`);
      continue;
    }

    console.log(`📤 Uploading ${image.file}...`);

    try {
      const url = await uploadImage(filePath, image.file);
      const { category, title } = extractCategoryAndTitle(image.prompt, image.index);

      exampleImages.push({
        id: image.index,
        url,
        category,
        title,
        prompt: image.prompt,
      });

      console.log(`   ✅ ${category} - ${title}`);
    } catch (error) {
      console.error(`   ❌ Failed to upload ${image.file}:`, error);
    }
  }

  // 按 id 排序
  exampleImages.sort((a, b) => a.id - b.id);

  // 生成配置文件
  const outputPath = path.join(__dirname, "../src/data/example-images.json");
  const outputDir = path.dirname(outputPath);

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(exampleImages, null, 2));

  console.log(`\n✅ Done! Uploaded ${exampleImages.length} images`);
  console.log(`📄 Config saved to: src/data/example-images.json`);
}

main().catch(console.error);
