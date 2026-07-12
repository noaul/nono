const fs = require('fs');
const path = require('path');

const musicDir = path.join(__dirname, 'public', 'music');
const files = fs.readdirSync(musicDir).filter(file => !file.startsWith('.'));

const musicList = files.map(file => {
    // Remove extension for name
    const name = path.parse(file).name;
    return {
        name: name,
        url: `/music/${file}`
    };
});

console.log(JSON.stringify(musicList, null, 2));
