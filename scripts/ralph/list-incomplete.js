import fs from 'fs';
const data = JSON.parse(fs.readFileSync('prd.json', 'utf8'));
const stories = data.userStories || data.stories || [];
const incomplete = stories.filter(s => !s.passes);
incomplete.forEach(s => {
    console.log(s.id + ': ' + (s.title || s.name || 'N/A') + ' (priority: ' + (s.priority || 'N/A') + ')');
});
console.log('\nTotal incomplete: ' + incomplete.length + ' / ' + stories.length);
