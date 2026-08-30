const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    // Não há um método direto listModels na classe principal na versão atual, 
    // mas vamos tentar fazer uma chamada simples para ver o erro ou sucesso.
    // Se falhar, vamos tentar o modelo 'gemini-pro' padrão.
    
    console.log("Testando gemini-1.5-flash-001...");
    const model2 = genAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
    const result = await model2.generateContent("Oi");
    console.log("Sucesso com gemini-1.5-flash-001!");
    return;
  } catch (error) {
    console.log("Erro com gemini-1.5-flash-001:", error.message);
  }

  try {
    console.log("Testando gemini-1.5-flash...");
    const model3 = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model3.generateContent("Oi");
    console.log("Sucesso com gemini-1.5-flash!");
  } catch (error) {
     console.log("Erro com gemini-1.5-flash:", error.message);
  }
}

listModels();
