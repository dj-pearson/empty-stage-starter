const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const screenshotsDir = path.join(__dirname, 'marketing_screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir);
}

const assets = [
  { img: 'IMG_2554.PNG', isFirst: true, title: 'Your Personal<br>Nutrition Assistant', sub: 'Track meals, analyze nutrition, and<br>achieve your goals effortlessly.' },
  { img: 'IMG_2556.PNG', isFirst: false, title: 'Scan & Log<br>in Seconds', sub: 'Point your camera at any barcode to<br>instantly add food to your diary.' },
  { img: 'IMG_2559.PNG', isFirst: false, title: 'Organize Your<br>Family Meals', sub: 'Plan and coordinate meals for everyone<br>with our intuitive tools.' },
  { img: 'IMG_2562.PNG', isFirst: false, title: 'Detailed<br>Analytics', sub: 'Understand your eating habits with<br>beautifully rich charts.' }
];

const targetSizes = [
  { name: 'iphone_6_5_inch', width: 1242, height: 2688 },
  { name: 'iphone_6_7_inch', width: 1284, height: 2778 },
  { name: 'ipad', width: 2064, height: 2752 }
];

async function generate() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  for (const size of targetSizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    
    for (let i = 0; i < assets.length; i++) {
        const asset = assets[i];
      
        const imgPath = path.join(__dirname, 'screenshots', asset.img);
        const imgBase64 = fs.readFileSync(imgPath).toString('base64');
        const imgSrc = `data:image/png;base64,${imgBase64}`;
        
        // CSS Scaling magic
        const isIphone = size.name.includes('iphone');
        const scaleBase = isIphone ? 1 : 1.4;
        
        const titleSize = isIphone ? 110 : 130;
        const subSize = isIphone ? 55 : 65;
        const marginTop = isIphone ? 250 : 350;
        const phoneWidth = isIphone ? 1010 : 1200; // slightly smaller width to fit 1242px screen
        const phoneMarginTop = isIphone ? 120 : 180;
        
        let containerTransform = '';
        if (asset.isFirst) {
            containerTransform = 'transform: perspective(2500px) rotateX(12deg) rotateY(-5deg) rotateZ(2deg) scale(1.05);';
        }
        
        // Gradient color palette for varied backgrounds
        const gradients = [
            'radial-gradient(circle at 50% 0%, rgba(34,197,94,0.2) 0%, rgba(0,0,0,0) 80%)',
            'radial-gradient(circle at 100% 0%, rgba(59,130,246,0.2) 0%, rgba(0,0,0,0) 80%)',
            'radial-gradient(circle at 0% 0%, rgba(139,92,246,0.2) 0%, rgba(0,0,0,0) 80%)',
            'radial-gradient(circle at 50% 100%, rgba(245,158,11,0.2) 0%, rgba(0,0,0,0) 80%)'
        ];
        const currentGradient = gradients[i % gradients.length];
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800&display=swap" rel="stylesheet">
        <style>
            body {
                margin: 0;
                padding: 0;
                background: #09090b;
                font-family: 'Inter', sans-serif;
                color: white;
                display: flex;
                flex-direction: column;
                align-items: center;
                overflow: hidden;
            }
            .background-glow {
                position: absolute;
                width: 200vw;
                height: 200vh;
                top: -50vh;
                left: -50vw;
                background: ${currentGradient};
                z-index: 0;
                filter: blur(80px);
            }
            .content {
                position: relative;
                z-index: 10;
                display: flex;
                flex-direction: column;
                align-items: center;
                width: 100%;
                height: 100%;
                text-align: center;
            }
            .title {
                font-size: ${titleSize}px;
                font-weight: 800;
                line-height: 1.1;
                letter-spacing: -2px;
                margin-top: ${marginTop}px;
                margin-bottom: 40px;
                background: linear-gradient(180deg, #FFFFFF 0%, #A1A1AA 100%);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            .subtitle {
                font-size: ${subSize}px;
                font-weight: 500;
                color: #a1a1aa;
                line-height: 1.4;
            }
            .phone-wrapper {
                margin-top: ${phoneMarginTop}px;
                width: ${phoneWidth}px;
                border-radius: 80px;
                padding: 24px;
                background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%);
                box-shadow: 0 60px 120px -20px rgba(0,0,0,0.9), inset 0 1px 2px rgba(255,255,255,0.25);
                ${containerTransform}
                transition: transform 0s;
            }
            .phone-screen {
                width: 100%;
                border-radius: 60px;
                box-shadow: inset 0 0 0 2px rgba(0,0,0,1);
                display: block;
            }
            
            ${asset.isFirst ? `
            /* Additional flair for the first image */
            .flare {
                position: absolute;
                top: 20%;
                left: 10%;
                width: 400px;
                height: 400px;
                background: radial-gradient(circle, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0) 70%);
                filter: blur(20px);
                z-index: 20;
                mix-blend-mode: overlay;
                border-radius: 50%;
                pointer-events: none;
            }
            ` : ''}
        </style>
        </head>
        <body>
            <div class="background-glow"></div>
            ${asset.isFirst ? '<div class="flare"></div>' : ''}
            <div class="content">
                <div class="title">${asset.title}</div>
                <div class="subtitle">${asset.sub}</div>
                <div class="phone-wrapper">
                    <img src="${imgSrc}" class="phone-screen" />
                </div>
            </div>
        </body>
        </html>
        `;

        await page.setContent(html, { waitUntil: 'networkidle' });
        // wait for a moment to ensure fonts are loaded
        await page.waitForTimeout(2000);
        
        const outName = size.name + '_screenshot_' + (i + 1) + '.png';
        await page.screenshot({ path: path.join(screenshotsDir, outName) });
        console.log('Generated ' + outName);
    }
  }
  
  await browser.close();
  console.log('All done!');
}

generate().catch(console.error);
