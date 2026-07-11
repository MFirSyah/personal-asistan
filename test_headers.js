const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    fetch: async (url, init) => {
      const res = await fetch(url, init);
      console.log('HEADERS:');
      for (const [key, value] of res.headers.entries()) {
        console.log(`${key}: ${value}`);
      }
      return res;
    }
  }
});

ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Hello'
}).then(() => console.log('Done')).catch(console.error);
