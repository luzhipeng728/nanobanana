const pptxgen = require('pptxgenjs');
const html2pptx = require('/Users/luzhipeng/.claude/plugins/cache/anthropic-agent-skills/document-skills/00756142ab04/skills/pptx/scripts/html2pptx.js');
const path = require('path');

async function createPresentation() {
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_16x9';
    pptx.author = '张三';
    pptx.title = '2024年终工作总结';
    pptx.subject = '年终总结报告';
    pptx.company = '技术研发部';

    const workspacePath = '/Users/luzhipeng/projects/nanobanana/public/ppt/0c5dc487-f791-4de0-a78f-29bc958c364e/workspace';

    const slides = [
        'slide1-cover.html',
        'slide2-overview.html',
        'slide3-achievements.html',
        'slide4-growth.html',
        'slide5-challenges.html',
        'slide6-plans.html',
        'slide7-thanks.html'
    ];

    for (const slideFile of slides) {
        const htmlPath = path.join(workspacePath, slideFile);
        console.log(`Processing: ${slideFile}`);
        await html2pptx(htmlPath, pptx, { tmpDir: workspacePath });
    }

    const outputPath = '/Users/luzhipeng/projects/nanobanana/public/ppt/0c5dc487-f791-4de0-a78f-29bc958c364e/presentation.pptx';
    await pptx.writeFile({ fileName: outputPath });
    console.log(`Presentation created: ${outputPath}`);
}

createPresentation().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
