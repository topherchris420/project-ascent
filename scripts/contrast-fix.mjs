import {readFile,writeFile} from 'node:fs/promises';
const file='src/app/globals.css';let css=await readFile(file,'utf8');
const luminance=hex=>{const parts=hex.match(/\w\w/g).map(s=>parseInt(s,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return parts[0]*.2126+parts[1]*.7152+parts[2]*.0722;};
css=css.replace(/([^{}]+)\{([^{}]*)\}/g,(all,selector,body)=>{if(/auth-story|valuation-card|range-labels|image-location|badge\.light|floating-copilot|button\.primary|skip-link/.test(selector))return all;return `${selector}{${body.replace(/(^|;)color:#([a-f\d]{6})(?=;|$)/gi,(m,lead,hex)=>luminance(hex)>.19?`${lead}color:#63715b`:m)}}`;});
await writeFile(file,css);
