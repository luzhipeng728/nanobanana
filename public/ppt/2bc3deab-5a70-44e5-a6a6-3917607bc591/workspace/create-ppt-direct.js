const pptxgen = require('pptxgenjs');

const OUTPUT = '/Users/luzhipeng/projects/nanobanana/public/ppt/2bc3deab-5a70-44e5-a6a6-3917607bc591/presentation.pptx';

// Color palette - Professional Blue Theme (主色调 #3B82F6)
const C = {
  primary: '3B82F6',
  primaryDark: '1E40AF',
  accent: '60A5FA',
  dark: '1E293B',
  light: 'F1F5F9',
  white: 'FFFFFF',
  gray: '64748B',
  lightBlue: 'DBEAFE',
  bgLight: 'F8FAFC'
};

async function main() {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = '2024年终总结';
  pptx.author = 'Professional Presentation';

  // ============ Slide 1: Cover ============
  let slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: '100%', fill: { type: 'solid', color: C.primaryDark } });
  // Gradient overlay effect with shapes
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '50%', h: '100%', fill: { color: C.primary, transparency: 40 } });
  slide.addText('2024 年终总结', { x: 0, y: 2, w: '100%', h: 1.2, fontSize: 54, fontFace: 'Arial', color: C.white, bold: true, align: 'center' });
  slide.addText('回顾成长  展望未来', { x: 0, y: 3.3, w: '100%', h: 0.6, fontSize: 26, fontFace: 'Arial', color: 'BFDBFE', align: 'center' });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 4, y: 4.2, w: 2, h: 0.08, fill: { color: C.accent } });

  // ============ Slide 2: Agenda ============
  slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: 1.1, fill: { color: C.primary } });
  slide.addText('目录', { x: 0.5, y: 0.25, w: 9, h: 0.6, fontSize: 30, fontFace: 'Arial', color: C.white, bold: true });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 1.1, w: '100%', h: '100%', fill: { color: C.bgLight } });

  const agendaItems = [
    '年度工作回顾',
    '核心业绩亮点',
    '项目成果展示',
    '团队成长与协作',
    '新年规划展望'
  ];
  agendaItems.forEach((item, i) => {
    const y = 1.5 + i * 0.85;
    slide.addShape(pptx.shapes.OVAL, { x: 0.8, y: y, w: 0.4, h: 0.4, fill: { color: C.primary } });
    slide.addText((i + 1).toString(), { x: 0.8, y: y + 0.05, w: 0.4, h: 0.3, fontSize: 14, fontFace: 'Arial', color: C.white, bold: true, align: 'center' });
    slide.addText(item, { x: 1.4, y: y, w: 8, h: 0.4, fontSize: 20, fontFace: 'Arial', color: C.dark });
  });

  // ============ Slide 3: Work Review ============
  slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: C.primary } });
  slide.addText('年度工作回顾', { x: 0.5, y: 0.2, w: 9, h: 0.6, fontSize: 28, fontFace: 'Arial', color: C.white, bold: true });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 1.0, w: '100%', h: '100%', fill: { color: C.bgLight } });

  // Left card - Q1-Q2
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: 1.3, w: 4.4, h: 3.8, fill: { color: C.white }, shadow: { type: 'outer', blur: 6, offset: 2, angle: 45, opacity: 0.15 }, rectRadius: 0.1 });
  slide.addText('Q1-Q2 上半年', { x: 0.7, y: 1.5, w: 4, h: 0.5, fontSize: 18, fontFace: 'Arial', color: C.primary, bold: true });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0.7, y: 2.0, w: 4, h: 0.03, fill: { color: 'E2E8F0' } });
  const q1Items = ['完成核心系统架构升级', '推进数字化转型项目', '优化业务流程效率提升30%'];
  q1Items.forEach((item, i) => {
    slide.addText([{ text: '• ', options: { color: C.primary, bold: true } }, { text: item }],
      { x: 0.7, y: 2.2 + i * 0.55, w: 4, h: 0.45, fontSize: 14, fontFace: 'Arial', color: C.dark });
  });

  // Right card - Q3-Q4
  slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 5.1, y: 1.3, w: 4.4, h: 3.8, fill: { color: C.white }, shadow: { type: 'outer', blur: 6, offset: 2, angle: 45, opacity: 0.15 }, rectRadius: 0.1 });
  slide.addText('Q3-Q4 下半年', { x: 5.3, y: 1.5, w: 4, h: 0.5, fontSize: 18, fontFace: 'Arial', color: C.primary, bold: true });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 5.3, y: 2.0, w: 4, h: 0.03, fill: { color: 'E2E8F0' } });
  const q3Items = ['新产品成功上线运营', '客户满意度提升至95%', '实现年度营收目标120%'];
  q3Items.forEach((item, i) => {
    slide.addText([{ text: '• ', options: { color: C.primary, bold: true } }, { text: item }],
      { x: 5.3, y: 2.2 + i * 0.55, w: 4, h: 0.45, fontSize: 14, fontFace: 'Arial', color: C.dark });
  });

  // ============ Slide 4: Key Achievements ============
  slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: C.primary } });
  slide.addText('核心业绩亮点', { x: 0.5, y: 0.2, w: 9, h: 0.6, fontSize: 28, fontFace: 'Arial', color: C.white, bold: true });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 1.0, w: '100%', h: '100%', fill: { color: C.bgLight } });

  const metrics = [
    { num: '120%', label: '营收目标达成', desc: '超额完成全年业绩指标' },
    { num: '50+', label: '项目交付数量', desc: '高质量按时交付率98%' },
    { num: '95%', label: '客户满意度', desc: 'NPS评分行业领先' },
    { num: '30%', label: '效率提升', desc: '流程优化成效显著' }
  ];
  metrics.forEach((m, i) => {
    const x = 0.4 + i * 2.4;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: x, y: 1.4, w: 2.2, h: 3.4, fill: { color: C.white }, shadow: { type: 'outer', blur: 5, offset: 2, angle: 45, opacity: 0.12 }, rectRadius: 0.08 });
    slide.addShape(pptx.shapes.RECTANGLE, { x: x, y: 1.4, w: 2.2, h: 0.08, fill: { color: C.primary } });
    slide.addText(m.num, { x: x, y: 1.8, w: 2.2, h: 0.9, fontSize: 38, fontFace: 'Arial', color: C.primary, bold: true, align: 'center' });
    slide.addText(m.label, { x: x, y: 2.7, w: 2.2, h: 0.45, fontSize: 15, fontFace: 'Arial', color: C.gray, align: 'center' });
    slide.addText(m.desc, { x: x + 0.1, y: 3.3, w: 2, h: 0.6, fontSize: 11, fontFace: 'Arial', color: C.dark, align: 'center' });
  });

  // ============ Slide 5: Project Results ============
  slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: C.primary } });
  slide.addText('项目成果展示', { x: 0.5, y: 0.2, w: 9, h: 0.6, fontSize: 28, fontFace: 'Arial', color: C.white, bold: true });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 1.0, w: '100%', h: '100%', fill: { color: C.bgLight } });

  const projects = [
    { icon: 'A', title: '智能化平台建设项目', desc: '实现业务全流程数字化，提升运营效率40%' },
    { icon: 'B', title: '客户服务体验优化', desc: '重塑服务流程，客户响应时间缩短60%' },
    { icon: 'C', title: '新产品研发上线', desc: '成功推出3款创新产品，市场反响良好' }
  ];
  projects.forEach((p, i) => {
    const y = 1.35 + i * 1.15;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: y, w: 9, h: 1.0, fill: { color: C.white }, shadow: { type: 'outer', blur: 4, offset: 1, angle: 45, opacity: 0.1 }, rectRadius: 0.08 });
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.7, y: y + 0.2, w: 0.6, h: 0.6, fill: { color: C.primary }, rectRadius: 0.1 });
    slide.addText(p.icon, { x: 0.7, y: y + 0.25, w: 0.6, h: 0.5, fontSize: 20, fontFace: 'Arial', color: C.white, bold: true, align: 'center' });
    slide.addText(p.title, { x: 1.5, y: y + 0.15, w: 6, h: 0.4, fontSize: 17, fontFace: 'Arial', color: C.dark, bold: true });
    slide.addText(p.desc, { x: 1.5, y: y + 0.55, w: 6, h: 0.35, fontSize: 13, fontFace: 'Arial', color: C.gray });
    // Tag
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 8.3, y: y + 0.35, w: 1, h: 0.35, fill: { color: C.lightBlue }, rectRadius: 0.15 });
    slide.addText('已完成', { x: 8.3, y: y + 0.35, w: 1, h: 0.35, fontSize: 10, fontFace: 'Arial', color: C.primaryDark, align: 'center', valign: 'middle' });
  });

  // ============ Slide 6: Team Growth ============
  slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: C.primary } });
  slide.addText('团队成长与协作', { x: 0.5, y: 0.2, w: 9, h: 0.6, fontSize: 28, fontFace: 'Arial', color: C.white, bold: true });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 1.0, w: '100%', h: '100%', fill: { color: C.bgLight } });

  // Left section - Team Building
  slide.addText('团队建设', { x: 0.5, y: 1.3, w: 4.5, h: 0.5, fontSize: 20, fontFace: 'Arial', color: C.primaryDark, bold: true });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0.5, y: 1.75, w: 4.3, h: 0.04, fill: { color: 'BFDBFE' } });
  const teamItems = ['团队规模扩大至50人', '完成20+场专业培训', '人才梯队建设完善'];
  teamItems.forEach((item, i) => {
    const y = 2.0 + i * 0.85;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: y, w: 4.3, h: 0.7, fill: { color: C.white }, shadow: { type: 'outer', blur: 3, offset: 1, angle: 45, opacity: 0.08 }, rectRadius: 0.06 });
    slide.addShape(pptx.shapes.RECTANGLE, { x: 0.5, y: y, w: 0.06, h: 0.7, fill: { color: C.primary } });
    slide.addText(item, { x: 0.7, y: y + 0.15, w: 4, h: 0.4, fontSize: 14, fontFace: 'Arial', color: C.dark });
  });

  // Right section - Collaboration
  slide.addText('协作成效', { x: 5.2, y: 1.3, w: 4.5, h: 0.5, fontSize: 20, fontFace: 'Arial', color: C.primaryDark, bold: true });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 5.2, y: 1.75, w: 4.3, h: 0.04, fill: { color: 'BFDBFE' } });
  const collabItems = ['跨部门协作项目15+', '敏捷开发流程落地', '知识共享平台上线'];
  collabItems.forEach((item, i) => {
    const y = 2.0 + i * 0.85;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 5.2, y: y, w: 4.3, h: 0.7, fill: { color: C.white }, shadow: { type: 'outer', blur: 3, offset: 1, angle: 45, opacity: 0.08 }, rectRadius: 0.06 });
    slide.addShape(pptx.shapes.RECTANGLE, { x: 5.2, y: y, w: 0.06, h: 0.7, fill: { color: C.primary } });
    slide.addText(item, { x: 5.4, y: y + 0.15, w: 4, h: 0.4, fontSize: 14, fontFace: 'Arial', color: C.dark });
  });

  // ============ Slide 7: Future Plans ============
  slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: 1.0, fill: { color: C.primary } });
  slide.addText('2025 新年规划展望', { x: 0.5, y: 0.2, w: 9, h: 0.6, fontSize: 28, fontFace: 'Arial', color: C.white, bold: true });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 1.0, w: '100%', h: '100%', fill: { color: C.bgLight } });

  const goals = [
    { title: '业务拓展与创新', desc: '开拓3个新市场，推出5款创新产品' },
    { title: '技术能力升级', desc: '引入AI技术，提升智能化水平50%' },
    { title: '团队卓越发展', desc: '打造学习型组织，人均产出提升25%' },
    { title: '客户价值深化', desc: 'NPS提升至98%，建立长期战略伙伴关系' }
  ];
  goals.forEach((g, i) => {
    const y = 1.25 + i * 0.95;
    slide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 0.5, y: y, w: 9, h: 0.8, fill: { color: C.white }, shadow: { type: 'outer', blur: 4, offset: 1, angle: 45, opacity: 0.1 }, rectRadius: 0.08 });
    slide.addShape(pptx.shapes.OVAL, { x: 0.7, y: y + 0.18, w: 0.45, h: 0.45, fill: { color: C.primary } });
    slide.addText((i + 1).toString(), { x: 0.7, y: y + 0.22, w: 0.45, h: 0.4, fontSize: 16, fontFace: 'Arial', color: C.white, bold: true, align: 'center' });
    slide.addText(g.title, { x: 1.35, y: y + 0.1, w: 7.5, h: 0.35, fontSize: 16, fontFace: 'Arial', color: C.dark, bold: true });
    slide.addText(g.desc, { x: 1.35, y: y + 0.45, w: 7.5, h: 0.3, fontSize: 13, fontFace: 'Arial', color: C.gray });
  });

  // ============ Slide 8: Thank You ============
  slide = pptx.addSlide();
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '100%', h: '100%', fill: { color: C.primary } });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: '40%', h: '100%', fill: { color: C.primaryDark, transparency: 30 } });
  slide.addText('谢谢观看', { x: 0, y: 2.0, w: '100%', h: 1.0, fontSize: 56, fontFace: 'Arial', color: C.white, bold: true, align: 'center' });
  slide.addText('砥砺前行  共创辉煌', { x: 0, y: 3.1, w: '100%', h: 0.5, fontSize: 22, fontFace: 'Arial', color: 'BFDBFE', align: 'center' });
  slide.addText('2024.12', { x: 0, y: 3.7, w: '100%', h: 0.4, fontSize: 18, fontFace: 'Arial', color: 'BFDBFE', align: 'center' });
  slide.addShape(pptx.shapes.RECTANGLE, { x: 4.2, y: 4.3, w: 1.6, h: 0.06, fill: { color: C.accent } });

  // Save
  await pptx.writeFile({ fileName: OUTPUT });
  console.log(`✅ Presentation saved to: ${OUTPUT}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
