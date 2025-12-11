const pptxgen = require('pptxgenjs');
const html2pptx = require('/Users/luzhipeng/.claude/plugins/cache/anthropic-agent-skills/document-skills/00756142ab04/skills/pptx/scripts/html2pptx.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const WORKSPACE = '/Users/luzhipeng/projects/nanobanana/public/ppt/2bc3deab-5a70-44e5-a6a6-3917607bc591/workspace';
const OUTPUT = '/Users/luzhipeng/projects/nanobanana/public/ppt/2bc3deab-5a70-44e5-a6a6-3917607bc591/presentation.pptx';

// Color palette based on #3B82F6 (blue theme)
const COLORS = {
  primary: '#3B82F6',
  primaryDark: '#1E40AF',
  accent: '#60A5FA',
  dark: '#1E293B',
  light: '#F1F5F9',
  white: '#FFFFFF',
  gray: '#64748B'
};

async function createGradientBg(filename, color1, color2, direction = 'diagonal') {
  let gradientDef;
  if (direction === 'diagonal') {
    gradientDef = `x1="0%" y1="0%" x2="100%" y2="100%"`;
  } else if (direction === 'vertical') {
    gradientDef = `x1="0%" y1="0%" x2="0%" y2="100%"`;
  } else {
    gradientDef = `x1="0%" y1="0%" x2="100%" y2="0%"`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080">
    <defs>
      <linearGradient id="g" ${gradientDef}>
        <stop offset="0%" style="stop-color:${color1}"/>
        <stop offset="100%" style="stop-color:${color2}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
  </svg>`;

  await sharp(Buffer.from(svg)).png().toFile(filename);
  return filename;
}

async function createSlideHtml(slideNum, content) {
  const filepath = path.join(WORKSPACE, `slide${slideNum}.html`);
  fs.writeFileSync(filepath, content);
  return filepath;
}

async function main() {
  // Create gradient backgrounds
  console.log('Creating gradient backgrounds...');
  const coverBg = await createGradientBg(path.join(WORKSPACE, 'cover-bg.png'), COLORS.primaryDark, COLORS.primary, 'diagonal');
  const contentBg = await createGradientBg(path.join(WORKSPACE, 'content-bg.png'), COLORS.light, COLORS.white, 'vertical');
  const endBg = await createGradientBg(path.join(WORKSPACE, 'end-bg.png'), COLORS.primary, COLORS.primaryDark, 'diagonal');

  // Slide 1: Cover
  await createSlideHtml(1, `<!DOCTYPE html>
<html><head><style>
html { background: #ffffff; }
body { width: 720pt; height: 405pt; margin: 0; padding: 0; font-family: Arial, sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; }
.bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.content { position: relative; z-index: 1; text-align: center; }
h1 { color: #FFFFFF; font-size: 48pt; margin: 0 0 20pt 0; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
p { color: #E0E7FF; font-size: 24pt; margin: 0; }
.line { width: 120pt; height: 4pt; background: #60A5FA; margin: 30pt auto 0; border-radius: 2pt; }
</style></head>
<body>
<img class="bg" src="${coverBg}">
<div class="content">
  <h1>2024 年终总结</h1>
  <p>回顾成长 展望未来</p>
  <div class="line"></div>
</div>
</body></html>`);

  // Slide 2: Agenda
  await createSlideHtml(2, `<!DOCTYPE html>
<html><head><style>
html { background: #ffffff; }
body { width: 720pt; height: 405pt; margin: 0; padding: 0; font-family: Arial, sans-serif; display: flex; flex-direction: column; }
.header { background: #3B82F6; padding: 25pt 40pt; }
h1 { color: #FFFFFF; font-size: 28pt; margin: 0; }
.main { flex: 1; padding: 30pt 40pt; background: #F8FAFC; }
ul { list-style: none; padding: 0; margin: 0; }
li { color: #1E293B; font-size: 18pt; margin: 15pt 0; padding-left: 30pt; position: relative; }
.bullet { position: absolute; left: 0; top: 2pt; width: 18pt; height: 18pt; background: #3B82F6; border-radius: 50%; }
.num { color: #FFFFFF; font-size: 11pt; text-align: center; line-height: 18pt; }
</style></head>
<body>
<div class="header"><h1>目录</h1></div>
<div class="main">
  <ul>
    <li><div class="bullet"><p class="num">1</p></div><p>年度工作回顾</p></li>
    <li><div class="bullet"><p class="num">2</p></div><p>核心业绩亮点</p></li>
    <li><div class="bullet"><p class="num">3</p></div><p>项目成果展示</p></li>
    <li><div class="bullet"><p class="num">4</p></div><p>团队成长与协作</p></li>
    <li><div class="bullet"><p class="num">5</p></div><p>新年规划展望</p></li>
  </ul>
</div>
</body></html>`);

  // Slide 3: Work Review
  await createSlideHtml(3, `<!DOCTYPE html>
<html><head><style>
html { background: #ffffff; }
body { width: 720pt; height: 405pt; margin: 0; padding: 0; font-family: Arial, sans-serif; display: flex; flex-direction: column; }
.header { background: #3B82F6; padding: 20pt 40pt; }
h1 { color: #FFFFFF; font-size: 26pt; margin: 0; }
.main { flex: 1; padding: 25pt 40pt; background: #F8FAFC; display: flex; gap: 25pt; }
.card { flex: 1; background: #FFFFFF; border-radius: 8pt; padding: 20pt; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
h2 { color: #3B82F6; font-size: 16pt; margin: 0 0 12pt 0; border-bottom: 2pt solid #E2E8F0; padding-bottom: 8pt; }
ul { list-style: none; padding: 0; margin: 0; }
li { margin: 8pt 0; }
p { color: #334155; font-size: 12pt; margin: 0; line-height: 1.5; }
</style></head>
<body>
<div class="header"><h1>年度工作回顾</h1></div>
<div class="main">
  <div class="card">
    <h2>Q1-Q2 上半年</h2>
    <ul>
      <li><p>完成核心系统架构升级</p></li>
      <li><p>推进数字化转型项目</p></li>
      <li><p>优化业务流程效率提升30%</p></li>
    </ul>
  </div>
  <div class="card">
    <h2>Q3-Q4 下半年</h2>
    <ul>
      <li><p>新产品成功上线运营</p></li>
      <li><p>客户满意度提升至95%</p></li>
      <li><p>实现年度营收目标120%</p></li>
    </ul>
  </div>
</div>
</body></html>`);

  // Slide 4: Key Achievements
  await createSlideHtml(4, `<!DOCTYPE html>
<html><head><style>
html { background: #ffffff; }
body { width: 720pt; height: 405pt; margin: 0; padding: 0; font-family: Arial, sans-serif; display: flex; flex-direction: column; }
.header { background: #3B82F6; padding: 20pt 40pt; }
h1 { color: #FFFFFF; font-size: 26pt; margin: 0; }
.main { flex: 1; padding: 25pt 40pt; background: #F8FAFC; display: flex; gap: 20pt; }
.metric { flex: 1; background: #FFFFFF; border-radius: 8pt; padding: 20pt; text-align: center; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-top: 4pt solid #3B82F6; }
.num { color: #3B82F6; font-size: 36pt; font-weight: bold; margin: 0 0 8pt 0; }
.label { color: #64748B; font-size: 14pt; margin: 0 0 12pt 0; }
.desc { color: #334155; font-size: 11pt; margin: 0; }
</style></head>
<body>
<div class="header"><h1>核心业绩亮点</h1></div>
<div class="main">
  <div class="metric">
    <p class="num">120%</p>
    <p class="label">营收目标达成</p>
    <p class="desc">超额完成全年业绩指标</p>
  </div>
  <div class="metric">
    <p class="num">50+</p>
    <p class="label">项目交付数量</p>
    <p class="desc">高质量按时交付率98%</p>
  </div>
  <div class="metric">
    <p class="num">95%</p>
    <p class="label">客户满意度</p>
    <p class="desc">NPS评分行业领先</p>
  </div>
  <div class="metric">
    <p class="num">30%</p>
    <p class="label">效率提升</p>
    <p class="desc">流程优化成效显著</p>
  </div>
</div>
</body></html>`);

  // Slide 5: Project Results
  await createSlideHtml(5, `<!DOCTYPE html>
<html><head><style>
html { background: #ffffff; }
body { width: 720pt; height: 405pt; margin: 0; padding: 0; font-family: Arial, sans-serif; display: flex; flex-direction: column; }
.header { background: #3B82F6; padding: 20pt 40pt; }
h1 { color: #FFFFFF; font-size: 26pt; margin: 0; }
.main { flex: 1; padding: 25pt 40pt; background: #F8FAFC; }
.project { background: #FFFFFF; border-radius: 8pt; padding: 18pt 25pt; margin-bottom: 15pt; box-shadow: 0 2px 6px rgba(0,0,0,0.08); display: flex; align-items: center; }
.icon { width: 40pt; height: 40pt; background: #3B82F6; border-radius: 8pt; margin-right: 20pt; display: flex; align-items: center; justify-content: center; }
.icon p { color: #FFFFFF; font-size: 18pt; font-weight: bold; margin: 0; }
.info { flex: 1; }
h3 { color: #1E293B; font-size: 16pt; margin: 0 0 5pt 0; }
p { color: #64748B; font-size: 12pt; margin: 0; }
.tag { background: #DBEAFE; color: #1E40AF; font-size: 10pt; padding: 3pt 10pt; border-radius: 10pt; margin-left: 15pt; }
</style></head>
<body>
<div class="header"><h1>项目成果展示</h1></div>
<div class="main">
  <div class="project">
    <div class="icon"><p>A</p></div>
    <div class="info">
      <h3>智能化平台建设项目</h3>
      <p>实现业务全流程数字化，提升运营效率40%</p>
    </div>
    <div class="tag"><p>已完成</p></div>
  </div>
  <div class="project">
    <div class="icon"><p>B</p></div>
    <div class="info">
      <h3>客户服务体验优化</h3>
      <p>重塑服务流程，客户响应时间缩短60%</p>
    </div>
    <div class="tag"><p>已完成</p></div>
  </div>
  <div class="project">
    <div class="icon"><p>C</p></div>
    <div class="info">
      <h3>新产品研发上线</h3>
      <p>成功推出3款创新产品，市场反响良好</p>
    </div>
    <div class="tag"><p>已完成</p></div>
  </div>
</div>
</body></html>`);

  // Slide 6: Team Growth
  await createSlideHtml(6, `<!DOCTYPE html>
<html><head><style>
html { background: #ffffff; }
body { width: 720pt; height: 405pt; margin: 0; padding: 0; font-family: Arial, sans-serif; display: flex; flex-direction: column; }
.header { background: #3B82F6; padding: 20pt 40pt; }
h1 { color: #FFFFFF; font-size: 26pt; margin: 0; }
.main { flex: 1; padding: 25pt 40pt; background: #F8FAFC; display: flex; gap: 25pt; }
.section { flex: 1; }
h2 { color: #1E40AF; font-size: 18pt; margin: 0 0 15pt 0; padding-bottom: 8pt; border-bottom: 2pt solid #BFDBFE; }
ul { list-style: none; padding: 0; margin: 0; }
li { background: #FFFFFF; padding: 12pt 15pt; margin-bottom: 10pt; border-radius: 6pt; border-left: 3pt solid #3B82F6; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
p { color: #334155; font-size: 13pt; margin: 0; }
</style></head>
<body>
<div class="header"><h1>团队成长与协作</h1></div>
<div class="main">
  <div class="section">
    <h2>团队建设</h2>
    <ul>
      <li><p>团队规模扩大至50人</p></li>
      <li><p>完成20+场专业培训</p></li>
      <li><p>人才梯队建设完善</p></li>
    </ul>
  </div>
  <div class="section">
    <h2>协作成效</h2>
    <ul>
      <li><p>跨部门协作项目15+</p></li>
      <li><p>敏捷开发流程落地</p></li>
      <li><p>知识共享平台上线</p></li>
    </ul>
  </div>
</div>
</body></html>`);

  // Slide 7: Future Plans
  await createSlideHtml(7, `<!DOCTYPE html>
<html><head><style>
html { background: #ffffff; }
body { width: 720pt; height: 405pt; margin: 0; padding: 0; font-family: Arial, sans-serif; display: flex; flex-direction: column; }
.header { background: #3B82F6; padding: 20pt 40pt; }
h1 { color: #FFFFFF; font-size: 26pt; margin: 0; }
.main { flex: 1; padding: 25pt 40pt; background: #F8FAFC; display: flex; flex-direction: column; gap: 15pt; }
.goal { background: #FFFFFF; border-radius: 8pt; padding: 15pt 25pt; display: flex; align-items: center; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
.num { width: 36pt; height: 36pt; background: #3B82F6; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 20pt; }
.num p { color: #FFFFFF; font-size: 16pt; font-weight: bold; margin: 0; }
.text { flex: 1; }
h3 { color: #1E293B; font-size: 15pt; margin: 0 0 4pt 0; }
p { color: #64748B; font-size: 12pt; margin: 0; }
</style></head>
<body>
<div class="header"><h1>2025 新年规划展望</h1></div>
<div class="main">
  <div class="goal">
    <div class="num"><p>1</p></div>
    <div class="text">
      <h3>业务拓展与创新</h3>
      <p>开拓3个新市场，推出5款创新产品</p>
    </div>
  </div>
  <div class="goal">
    <div class="num"><p>2</p></div>
    <div class="text">
      <h3>技术能力升级</h3>
      <p>引入AI技术，提升智能化水平50%</p>
    </div>
  </div>
  <div class="goal">
    <div class="num"><p>3</p></div>
    <div class="text">
      <h3>团队卓越发展</h3>
      <p>打造学习型组织，人均产出提升25%</p>
    </div>
  </div>
  <div class="goal">
    <div class="num"><p>4</p></div>
    <div class="text">
      <h3>客户价值深化</h3>
      <p>NPS提升至98%，建立长期战略伙伴关系</p>
    </div>
  </div>
</div>
</body></html>`);

  // Slide 8: Thank You
  await createSlideHtml(8, `<!DOCTYPE html>
<html><head><style>
html { background: #ffffff; }
body { width: 720pt; height: 405pt; margin: 0; padding: 0; font-family: Arial, sans-serif; display: flex; flex-direction: column; justify-content: center; align-items: center; }
.bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.content { position: relative; z-index: 1; text-align: center; }
h1 { color: #FFFFFF; font-size: 52pt; margin: 0 0 25pt 0; }
p { color: #BFDBFE; font-size: 20pt; margin: 0 0 10pt 0; }
.line { width: 80pt; height: 3pt; background: #60A5FA; margin: 30pt auto 0; border-radius: 2pt; }
</style></head>
<body>
<img class="bg" src="${endBg}">
<div class="content">
  <h1>谢谢观看</h1>
  <p>砥砺前行 共创辉煌</p>
  <p>2024.12</p>
  <div class="line"></div>
</div>
</body></html>`);

  console.log('HTML slides created. Converting to PowerPoint...');

  // Create PowerPoint
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = '2024年终总结';
  pptx.author = 'Professional Presentation';

  // Convert each slide
  for (let i = 1; i <= 8; i++) {
    console.log(`Processing slide ${i}...`);
    const htmlFile = path.join(WORKSPACE, `slide${i}.html`);
    await html2pptx(htmlFile, pptx);
  }

  // Save presentation
  await pptx.writeFile({ fileName: OUTPUT });
  console.log(`Presentation saved to: ${OUTPUT}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
