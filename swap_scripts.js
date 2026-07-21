
const fs = require('fs');
const path = require('path');
const publicDir = path.join(__dirname, 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));
files.forEach(file => {
    const filePath = path.join(publicDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Find <script src="js/component.js" defer></script> and move it up above the page-specific script
    // A regex to find the page specific script and component.js
    // Let's just find "<script src="js/component.js" defer></script>\r?\n" and remove it, then insert it before the first script with defer
    
    if (content.includes('js/component.js')) {
        let lines = content.split(/\r?\n/);
        let componentIdx = -1;
        for (let i=0; i<lines.length; i++) {
            if (lines[i].includes('js/component.js')) {
                componentIdx = i;
                break;
            }
        }
        
        if (componentIdx !== -1) {
            let componentLine = lines.splice(componentIdx, 1)[0];
            
            // Find where to insert it. Let's insert it right after api.js, or before the other defer scripts.
            let targetIdx = -1;
            for (let i=lines.length-1; i>=0; i--) {
                if (lines[i].includes('<script ') && !lines[i].includes('skeleton.js') && !lines[i].includes('api.js')) {
                    targetIdx = i;
                }
            }
            if (targetIdx !== -1) {
                lines.splice(targetIdx, 0, componentLine);
                fs.writeFileSync(filePath, lines.join('\n'));
                console.log('Swapped in ' + file);
            }
        }
    }
});

