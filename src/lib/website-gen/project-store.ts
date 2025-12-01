/**
 * 项目存储管理
 * 使用内存存储 + R2 持久化
 */

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { WebsiteProject, ProjectFile, ProjectMetadata, ImagePlaceholder } from "@/types/website-gen";
import { SANDPACK_TEMPLATE_FILES } from "@/types/website-gen";

// R2 客户端
const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME || "generated-images";
const publicUrl = process.env.R2_PUBLIC_URL || "";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: accessKeyId || "",
    secretAccessKey: secretAccessKey || "",
  },
});

// 内存缓存
const projectCache = new Map<string, WebsiteProject>();

/**
 * 获取项目
 */
export async function getProject(projectId: string): Promise<WebsiteProject | null> {
  // 先检查内存缓存
  if (projectCache.has(projectId)) {
    const cached = projectCache.get(projectId)!;
    console.log(`[ProjectStore] Found project ${projectId} in memory cache, files:`, Object.keys(cached.files));
    return cached;
  }

  console.log(`[ProjectStore] Project ${projectId} not in memory cache, loading from R2...`);

  // 尝试从 R2 加载
  try {
    const key = `nanobanana/websites/${projectId}/project.json`;
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key,
    });
    const response = await r2Client.send(command);
    const body = await response.Body?.transformToString();
    if (body) {
      const project = JSON.parse(body) as WebsiteProject;
      console.log(`[ProjectStore] Loaded project ${projectId} from R2, files:`, Object.keys(project.files));
      projectCache.set(projectId, project);
      return project;
    }
  } catch (error) {
    // R2 中没有，返回 null
    console.log(`[ProjectStore] Project ${projectId} not found in R2, error:`, error);
  }

  return null;
}

/**
 * 创建新项目
 */
export async function createProject(projectId: string, title: string = "未命名项目"): Promise<WebsiteProject> {
  const now = new Date().toISOString();

  const project: WebsiteProject = {
    metadata: {
      id: projectId,
      title,
      description: "",
      createdAt: now,
      updatedAt: now,
      imagePlaceholders: {},
    },
    files: { ...SANDPACK_TEMPLATE_FILES },
  };

  projectCache.set(projectId, project);
  await saveProjectToR2(project);

  return project;
}

/**
 * 获取或创建项目
 */
export async function getOrCreateProject(projectId: string): Promise<WebsiteProject> {
  let project = await getProject(projectId);
  if (!project) {
    project = await createProject(projectId);
  }
  return project;
}

/**
 * 写入文件
 */
export async function writeFile(projectId: string, path: string, content: string): Promise<void> {
  const project = await getOrCreateProject(projectId);

  // 规范化路径
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  console.log(`[ProjectStore] Writing file: ${normalizedPath} for project ${projectId}`);
  console.log(`[ProjectStore] Content preview (first 100 chars): ${content.substring(0, 100)}`);

  project.files[normalizedPath] = content;
  project.metadata.updatedAt = new Date().toISOString();

  projectCache.set(projectId, project);

  // 打印当前项目所有文件
  console.log(`[ProjectStore] Project ${projectId} now has files:`, Object.keys(project.files));

  await saveProjectToR2(project);
}

/**
 * 读取文件
 */
export async function readFile(projectId: string, path: string): Promise<string | null> {
  const project = await getProject(projectId);
  if (!project) return null;

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return project.files[normalizedPath] || null;
}

/**
 * 更新文件（部分替换）
 */
export async function updateFile(
  projectId: string,
  path: string,
  updates: Array<{ oldContent: string; newContent: string }>
): Promise<boolean> {
  const project = await getOrCreateProject(projectId);

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  let content = project.files[normalizedPath];

  if (!content) {
    console.warn(`[ProjectStore] File ${normalizedPath} not found for update`);
    return false;
  }

  for (const update of updates) {
    if (content.includes(update.oldContent)) {
      content = content.replace(update.oldContent, update.newContent);
    } else {
      console.warn(`[ProjectStore] Old content not found in ${normalizedPath}`);
      return false;
    }
  }

  project.files[normalizedPath] = content;
  project.metadata.updatedAt = new Date().toISOString();

  projectCache.set(projectId, project);
  await saveProjectToR2(project);

  return true;
}

/**
 * 列出文件
 */
export async function listFiles(projectId: string): Promise<string[]> {
  const project = await getProject(projectId);
  if (!project) return [];

  return Object.keys(project.files);
}

/**
 * 更新项目元数据
 */
export async function updateMetadata(
  projectId: string,
  updates: Partial<ProjectMetadata>
): Promise<void> {
  const project = await getOrCreateProject(projectId);

  project.metadata = {
    ...project.metadata,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  projectCache.set(projectId, project);
  await saveProjectToR2(project);
}

/**
 * 添加图片占位符
 */
export async function addImagePlaceholder(
  projectId: string,
  placeholder: ImagePlaceholder
): Promise<void> {
  const project = await getOrCreateProject(projectId);

  project.metadata.imagePlaceholders[placeholder.id] = placeholder;
  project.metadata.updatedAt = new Date().toISOString();

  projectCache.set(projectId, project);
  await saveProjectToR2(project);
}

/**
 * 更新图片占位符状态
 */
export async function updateImagePlaceholder(
  projectId: string,
  placeholderId: string,
  updates: Partial<ImagePlaceholder>
): Promise<void> {
  const project = await getOrCreateProject(projectId);

  const existing = project.metadata.imagePlaceholders[placeholderId];
  if (existing) {
    project.metadata.imagePlaceholders[placeholderId] = {
      ...existing,
      ...updates,
    };
    project.metadata.updatedAt = new Date().toISOString();

    projectCache.set(projectId, project);
    await saveProjectToR2(project);
  }
}

/**
 * 替换文件中的图片占位符
 */
export async function replaceImagePlaceholder(
  projectId: string,
  placeholderId: string,
  imageUrl: string
): Promise<void> {
  const project = await getOrCreateProject(projectId);

  const placeholderPattern = `{{placeholder:${placeholderId}}}`;

  // 遍历所有文件，替换占位符
  for (const [path, content] of Object.entries(project.files)) {
    if (content.includes(placeholderPattern)) {
      project.files[path] = content.replace(new RegExp(placeholderPattern, 'g'), imageUrl);
    }
  }

  // 更新占位符状态
  if (project.metadata.imagePlaceholders[placeholderId]) {
    project.metadata.imagePlaceholders[placeholderId] = {
      ...project.metadata.imagePlaceholders[placeholderId],
      status: "completed",
      imageUrl,
    };
  }

  project.metadata.updatedAt = new Date().toISOString();

  projectCache.set(projectId, project);
  await saveProjectToR2(project);
}

/**
 * 保存项目到 R2
 */
async function saveProjectToR2(project: WebsiteProject): Promise<void> {
  try {
    const key = `nanobanana/websites/${project.metadata.id}/project.json`;
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: JSON.stringify(project, null, 2),
      ContentType: "application/json",
    });
    await r2Client.send(command);
    console.log(`[ProjectStore] Saved project ${project.metadata.id} to R2`);
  } catch (error) {
    console.error(`[ProjectStore] Failed to save project to R2:`, error);
    throw error;
  }
}

/**
 * 获取项目的公开 URL
 */
export function getProjectPublicUrl(projectId: string): string {
  return `${publicUrl}/nanobanana/websites/${projectId}/project.json`;
}

/**
 * 获取所有文件（用于 Sandpack）
 */
export async function getProjectFiles(projectId: string): Promise<Record<string, string>> {
  const project = await getProject(projectId);
  if (!project) return { ...SANDPACK_TEMPLATE_FILES };
  return { ...project.files };
}
