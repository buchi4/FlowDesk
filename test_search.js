const { searchMessages } = require('./src/db/supabase');
require('dotenv').config({ path: './.env' });

async function testSearch() {
  try {
    const results = await searchMessages("who is going to review the code?");
    console.log('Results:', results);
  } catch (e) {
    console.error(e);
  }
}

testSearch();
