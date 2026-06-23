const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

// Manual env parsing
const envFile = fs.readFileSync('d:/PORTOFOLIO/ai_personal_asistan/.env.local', 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/"/g, '');
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing environment variables in .env.local");
  process.exit(1);
}

console.log("Connecting to:", supabaseUrl);
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log("Sending query to 'ai_personalities'...");
  const start = Date.now();
  
  const { data, error } = await supabase
    .from('ai_personalities')
    .select('id')
    .limit(1);

  const duration = Date.now() - start;
  if (error) {
    console.error("Database query failed:", error);
  } else {
    console.log(`Success! Query took ${duration}ms. Data received:`, data);
  }
}

check();
