/**
 * 图片标记相关类型定义
 * SoM (Set-of-Mark) 风格的数字标记系统
 */

// 单个定位点标记
export interface ImageMark {
  id: string;
  number: number;        // 标记编号 (1, 2, 3...)
  x: number;             // 相对坐标 (0-1)
  y: number;             // 相对坐标 (0-1)
  description?: string;  // 可选描述
}

// 单个箭头标记（视角/方向标记）
export interface ArrowMark {
  id: string;
  number: number;        // 标记编号 (1, 2, 3...)
  startX: number;        // 起点 X 相对坐标 (0-1)
  startY: number;        // 起点 Y 相对坐标 (0-1)
  endX: number;          // 终点 X 相对坐标 (0-1)
  endY: number;          // 终点 Y 相对坐标 (0-1)
  description?: string;  // 可选描述
}

// 标记数据（存储在节点中）
export interface ImageMarkerData {
  marks: ImageMark[];
  arrows?: ArrowMark[];   // 箭头标记
  markedImageUrl?: string;  // 带标记的图片 URL (base64 or blob url)
  originalImageUrl: string; // 原图 URL
  updatedAt: number;        // 更新时间戳
}

// 标记样式配置
export interface MarkerStyle {
  size: number;           // 标记尺寸 (px)
  fontSize: number;       // 字体大小 (px)
  bgColor: string;        // 背景颜色
  textColor: string;      // 文字颜色
  borderColor: string;    // 边框颜色
  borderWidth: number;    // 边框宽度
  shadow: boolean;        // 是否显示阴影
}

// 默认标记样式
export const DEFAULT_MARKER_STYLE: MarkerStyle = {
  size: 32,
  fontSize: 16,
  bgColor: '#EF4444',     // 红色背景
  textColor: '#FFFFFF',   // 白色文字
  borderColor: '#FFFFFF', // 白色边框
  borderWidth: 2,
  shadow: true,
};

// 圆圈数字字符映射
export const CIRCLE_NUMBERS = [
  '①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩',
  '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳',
];

// 获取圆圈数字
export function getCircleNumber(num: number): string {
  if (num >= 1 && num <= CIRCLE_NUMBERS.length) {
    return CIRCLE_NUMBERS[num - 1];
  }
  return `(${num})`;
}

// 箭头样式配置
export interface ArrowStyle {
  strokeWidth: number;    // 箭头线条宽度
  strokeColor: string;    // 箭头颜色
  headSize: number;       // 箭头头部大小
  numberSize: number;     // 数字标记尺寸
  numberFontSize: number; // 数字字体大小
  numberBgColor: string;  // 数字背景色
  numberTextColor: string;// 数字文字色
}

// 默认箭头样式
export const DEFAULT_ARROW_STYLE: ArrowStyle = {
  strokeWidth: 4,
  strokeColor: '#3B82F6',   // 蓝色
  headSize: 16,
  numberSize: 28,
  numberFontSize: 14,
  numberBgColor: '#3B82F6', // 蓝色背景
  numberTextColor: '#FFFFFF',
};

// 标记模态框 Props
export interface ImageMarkerModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  initialMarks?: ImageMark[];
  initialArrows?: ArrowMark[];
  onSave: (marks: ImageMark[], arrows: ArrowMark[], markedImageDataUrl: string) => void;
  style?: Partial<MarkerStyle>;
  arrowStyle?: Partial<ArrowStyle>;
}

// Canvas Props
export interface ImageMarkerCanvasProps {
  imageUrl: string;
  marks: ImageMark[];
  onMarksChange: (marks: ImageMark[]) => void;
  style?: Partial<MarkerStyle>;
  editable?: boolean;
  className?: string;
}

// Hook 返回类型
export interface UseImageMarkerReturn {
  marks: ImageMark[];
  addMark: (x: number, y: number, description?: string) => void;
  removeMark: (id: string) => void;
  updateMark: (id: string, updates: Partial<ImageMark>) => void;
  clearMarks: () => void;
  reorderMarks: () => void;
  generateMarkedImage: (canvas: HTMLCanvasElement) => string;
}
