const https = require('https');
https.get('https://sport.newepoch.cc/', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const styleStart = data.indexOf('<style>') + 7;
    const styleEnd = data.indexOf('</style>');
    const css = data.substring(styleStart, styleEnd);
    
    // Print the full CSS to see if minifier broke anything
    console.log('=== FULL CSS ===');
    console.log(css);
    console.log('\n=== CSS LENGTH ===', css.length);
    
    // Check the HTML structure around main content area
    const mainContent = data.indexOf('main-content');
    console.log('\n=== main-content context ===');
    console.log(data.substring(mainContent - 50, mainContent + 150));
    
    // Check min-height:0
    const minH = data.indexOf('min-height:0');
    console.log('\n=== min-height:0 context ===');
    if (minH > -1) console.log(data.substring(minH - 50, minH + 50));
    else console.log('NOT FOUND');
  });
}).on('error', e => console.error('Error:', e.message));
