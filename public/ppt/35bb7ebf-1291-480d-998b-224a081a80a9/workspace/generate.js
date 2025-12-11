const pptxgen = require('pptxgenjs');
const path = require('path');
const html2pptx = require('/Users/luzhipeng/.claude/plugins/cache/anthropic-agent-skills/document-skills/00756142ab04/skills/pptx/scripts/html2pptx.js');

async function createPresentation() {
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = 'Annual Report';
    pptx.title = '2024 年终总结';
    pptx.subject = '年度工作总结报告';

    const workspaceDir = '/Users/luzhipeng/projects/nanobanana/public/ppt/35bb7ebf-1291-480d-998b-224a081a80a9/workspace';
    const outputPath = '/Users/luzhipeng/projects/nanobanana/public/ppt/35bb7ebf-1291-480d-998b-224a081a80a9/presentation.pptx';

    const slides = [
        'slide1.html', // 封面页
        'slide2.html', // 年度业绩概览
        'slide3.html', // 项目进展与成果
        'slide4.html', // 团队建设与发展
        'slide5.html', // 经验总结与反思
        'slide6.html', // 2025年度规划
        'slide7.html'  // 结束页
    ];

    for (const slideFile of slides) {
        const htmlPath = path.join(workspaceDir, slideFile);
        await html2pptx(htmlPath, pptx);
        console.log(`Created: ${slideFile}`);
    }

    await pptx.writeFile({ fileName: outputPath });
    console.log(`\nPresentation saved to: ${outputPath}`);
}

createPresentation().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
