import pptxgen from "pptxgenjs";

// 幻灯片数据结构
export interface SlideContent {
  id: string;
  layout: "title" | "content" | "two-column" | "image-focus" | "ending";
  title: string;
  subtitle?: string;
  content?: string[];
  leftContent?: string[];
  rightContent?: string[];
  imageUrl?: string;
  notes?: string;
}

export interface PPTConfig {
  title: string;
  template: "business" | "tech" | "minimal" | "creative";
  primaryColor: string;
  author?: string;
}

// 模板配色方案
const TEMPLATE_COLORS: Record<string, { primary: string; secondary: string; accent: string; bg: string }> = {
  business: { primary: "#1E3A5F", secondary: "#4A6FA5", accent: "#E67E22", bg: "#FFFFFF" },
  tech: { primary: "#0F0F0F", secondary: "#1DB954", accent: "#1ED760", bg: "#121212" },
  minimal: { primary: "#333333", secondary: "#666666", accent: "#007AFF", bg: "#FAFAFA" },
  creative: { primary: "#6C5CE7", secondary: "#A29BFE", accent: "#FD79A8", bg: "#FFFFFF" },
};

/**
 * 使用 pptxgenjs 生成真正的 PPT 文件
 */
export async function generatePPTX(
  slides: SlideContent[],
  config: PPTConfig
): Promise<Buffer> {
  const pptx = new pptxgen();

  // 设置 PPT 基本信息
  pptx.title = config.title;
  pptx.author = config.author || "AI Assistant";
  pptx.company = "NanoBanana";
  pptx.subject = config.title;

  // 获取配色方案
  const colors = TEMPLATE_COLORS[config.template] || TEMPLATE_COLORS.business;
  const primaryColor = config.primaryColor || colors.primary;

  // 设置主题
  pptx.defineLayout({ name: "CUSTOM", width: 10, height: 5.625 });
  pptx.layout = "CUSTOM";

  // 遍历幻灯片生成内容
  for (let i = 0; i < slides.length; i++) {
    const slideData = slides[i];
    const slide = pptx.addSlide();

    // 设置背景
    if (slideData.layout === "title" || slideData.layout === "ending") {
      // 标题页和结束页使用渐变背景
      slide.background = { color: primaryColor };
    } else {
      slide.background = { color: colors.bg };
    }

    switch (slideData.layout) {
      case "title":
        addTitleSlide(slide, slideData, primaryColor, colors);
        break;
      case "ending":
        addEndingSlide(slide, slideData, primaryColor, colors);
        break;
      case "two-column":
        addTwoColumnSlide(slide, slideData, primaryColor, colors);
        break;
      case "image-focus":
        addImageFocusSlide(slide, slideData, primaryColor, colors);
        break;
      default:
        addContentSlide(slide, slideData, primaryColor, colors);
    }

    // 添加页码（非标题页）
    if (slideData.layout !== "title" && slideData.layout !== "ending") {
      slide.addText(`${i + 1} / ${slides.length}`, {
        x: 9,
        y: 5.3,
        w: 0.8,
        h: 0.25,
        fontSize: 8,
        color: "999999",
        align: "right",
      });
    }

    // 添加备注
    if (slideData.notes) {
      slide.addNotes(slideData.notes);
    }
  }

  // 生成 Buffer
  const data = await pptx.write({ outputType: "nodebuffer" });
  return data as Buffer;
}

// 标题页
function addTitleSlide(
  slide: pptxgen.Slide,
  data: SlideContent,
  primaryColor: string,
  colors: typeof TEMPLATE_COLORS.business
) {
  // 主标题
  slide.addText(data.title, {
    x: 0.5,
    y: 2,
    w: 9,
    h: 1,
    fontSize: 44,
    fontFace: "Microsoft YaHei",
    color: "FFFFFF",
    bold: true,
    align: "center",
  });

  // 副标题
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 0.5,
      y: 3.2,
      w: 9,
      h: 0.5,
      fontSize: 20,
      fontFace: "Microsoft YaHei",
      color: "FFFFFF",
      align: "center",
    });
  }

  // 装饰线
  slide.addShape("rect", {
    x: 4,
    y: 3,
    w: 2,
    h: 0.05,
    fill: { color: "FFFFFF" },
  });
}

// 内容页
function addContentSlide(
  slide: pptxgen.Slide,
  data: SlideContent,
  primaryColor: string,
  colors: typeof TEMPLATE_COLORS.business
) {
  // 标题
  slide.addText(data.title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 28,
    fontFace: "Microsoft YaHei",
    color: primaryColor.replace("#", ""),
    bold: true,
  });

  // 标题下划线
  slide.addShape("rect", {
    x: 0.5,
    y: 0.95,
    w: 1.5,
    h: 0.04,
    fill: { color: primaryColor.replace("#", "") },
  });

  // 内容要点
  if (data.content && data.content.length > 0) {
    const bulletPoints = data.content.map((item) => ({
      text: item,
      options: {
        bullet: { type: "bullet" as const, color: primaryColor.replace("#", "") },
        fontSize: 18,
        fontFace: "Microsoft YaHei",
        color: "333333",
        paraSpaceAfter: 12,
      },
    }));

    slide.addText(bulletPoints, {
      x: 0.5,
      y: 1.2,
      w: 9,
      h: 4,
      valign: "top",
    });
  }
}

// 两栏布局
function addTwoColumnSlide(
  slide: pptxgen.Slide,
  data: SlideContent,
  primaryColor: string,
  colors: typeof TEMPLATE_COLORS.business
) {
  // 标题
  slide.addText(data.title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 28,
    fontFace: "Microsoft YaHei",
    color: primaryColor.replace("#", ""),
    bold: true,
  });

  // 左栏
  if (data.leftContent && data.leftContent.length > 0) {
    const leftBullets = data.leftContent.map((item) => ({
      text: item,
      options: {
        bullet: { type: "bullet" as const, color: primaryColor.replace("#", "") },
        fontSize: 16,
        fontFace: "Microsoft YaHei",
        color: "333333",
        paraSpaceAfter: 8,
      },
    }));

    slide.addText(leftBullets, {
      x: 0.5,
      y: 1.2,
      w: 4.3,
      h: 4,
      valign: "top",
    });
  }

  // 右栏
  if (data.rightContent && data.rightContent.length > 0) {
    const rightBullets = data.rightContent.map((item) => ({
      text: item,
      options: {
        bullet: { type: "bullet" as const, color: primaryColor.replace("#", "") },
        fontSize: 16,
        fontFace: "Microsoft YaHei",
        color: "333333",
        paraSpaceAfter: 8,
      },
    }));

    slide.addText(rightBullets, {
      x: 5.2,
      y: 1.2,
      w: 4.3,
      h: 4,
      valign: "top",
    });
  }
}

// 图片焦点页
function addImageFocusSlide(
  slide: pptxgen.Slide,
  data: SlideContent,
  primaryColor: string,
  colors: typeof TEMPLATE_COLORS.business
) {
  // 标题
  slide.addText(data.title, {
    x: 0.5,
    y: 0.3,
    w: 9,
    h: 0.6,
    fontSize: 28,
    fontFace: "Microsoft YaHei",
    color: primaryColor.replace("#", ""),
    bold: true,
  });

  // 图片占位区域
  if (data.imageUrl) {
    slide.addImage({
      path: data.imageUrl,
      x: 0.5,
      y: 1.2,
      w: 6,
      h: 4,
    });
  } else {
    // 图片占位符
    slide.addShape("rect", {
      x: 0.5,
      y: 1.2,
      w: 6,
      h: 4,
      fill: { color: "E0E0E0" },
    });
    slide.addText("图片", {
      x: 0.5,
      y: 2.8,
      w: 6,
      h: 0.6,
      fontSize: 24,
      color: "999999",
      align: "center",
    });
  }

  // 右侧内容
  if (data.content && data.content.length > 0) {
    const bullets = data.content.map((item) => ({
      text: item,
      options: {
        bullet: { type: "bullet" as const, color: primaryColor.replace("#", "") },
        fontSize: 14,
        fontFace: "Microsoft YaHei",
        color: "333333",
        paraSpaceAfter: 8,
      },
    }));

    slide.addText(bullets, {
      x: 6.8,
      y: 1.2,
      w: 2.7,
      h: 4,
      valign: "top",
    });
  }
}

// 结束页
function addEndingSlide(
  slide: pptxgen.Slide,
  data: SlideContent,
  primaryColor: string,
  colors: typeof TEMPLATE_COLORS.business
) {
  // 感谢文字
  slide.addText(data.title || "谢谢观看", {
    x: 0.5,
    y: 2,
    w: 9,
    h: 1,
    fontSize: 44,
    fontFace: "Microsoft YaHei",
    color: "FFFFFF",
    bold: true,
    align: "center",
  });

  // 副标题/联系方式
  if (data.subtitle) {
    slide.addText(data.subtitle, {
      x: 0.5,
      y: 3.2,
      w: 9,
      h: 0.5,
      fontSize: 18,
      fontFace: "Microsoft YaHei",
      color: "FFFFFF",
      align: "center",
    });
  }

  // 内容
  if (data.content && data.content.length > 0) {
    slide.addText(data.content.join(" | "), {
      x: 0.5,
      y: 3.8,
      w: 9,
      h: 0.4,
      fontSize: 14,
      fontFace: "Microsoft YaHei",
      color: "FFFFFF",
      align: "center",
    });
  }
}
