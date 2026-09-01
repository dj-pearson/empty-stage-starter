import fs from 'fs';
// Which PRD to read. Default is the main prd.json; point at an epic file with
//   PRD_FILE=prd-household-planner.json node scripts/ralph/list-incomplete.js
// or pass the path as the first argument.
const prdFile = process.argv[2] || process.env.PRD_FILE || 'prd.json';
const data = JSON.parse(fs.readFileSync(prdFile, 'utf8'));
const stories = data.userStories || data.stories || [];
const incomplete = stories.filter(s => !s.passes);
console.log('PRD: ' + prdFile + (data.branchName ? ' (branch ' + data.branchName + ')' : ''));
incomplete.forEach(s => {
    console.log(s.id + ': ' + (s.title || s.name || 'N/A') + ' (priority: ' + (s.priority || 'N/A') + ')');
});
console.log('\nTotal incomplete: ' + incomplete.length + ' / ' + stories.length);
