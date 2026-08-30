require('dotenv').config();
const { chat, vision, generateImage, ping } = require('./utils/ai/nvidiaClient');
const { getConfig } = require('./utils/ai/config');
const fs = require('fs');

async function main() {
  const cfg = getConfig();
  console.log('=== NVIDIA BUILD TEST ===');
  console.log('Base:', cfg.baseUrl);
  console.log('Text:', cfg.textModel);
  console.log('Vision:', cfg.visionModel);
  console.log('Image:', cfg.imageModel, cfg.imageSize);
  console.log('API Key:', cfg.apiKey ? cfg.apiKey.slice(0,8)+'...' : 'MISSING');
  if (!cfg.apiKey) {
    console.error('❌ NVIDIA_API_KEY não configurada — coloque no .env e rode de novo');
    process.exit(1);
  }

  console.log('\n[1/4] Ping text model...');
  try {
    const latency = await ping();
    console.log(`✅ Ping OK ${latency}ms`);
  } catch (e) {
    console.error(`❌ Ping falhou: ${e.message} (status ${e.status})`, e.details || '');
  }

  console.log('\n[2/4] Chat SimSimi (openai/gpt-oss-20b) — teste persona...');
  try {
    const resp = await chat({
      messages: [
        { role: 'system', content: 'Você é o SimSimi, ácida e debochada, 2 frases max, pt-BR, gírias brasileiras.' },
        { role: 'user', content: 'oi simsimi, tudo bem?' },
      ],
      temperature: 0.85,
      max_tokens: 300,
    });
    console.log(`✅ Chat OK: "${resp.slice(0,200)}"`);
  } catch (e) {
    console.error(`❌ Chat falhou: ${e.message}`, e.details || '');
  }

  console.log('\n[3/4] Vision 90B — teste com 1x1 png base64 (sem baixar imagem real)...');
  try {
    // 1x1 transparent png
    const tinyBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
    const resp = await vision('Descreva esta imagem em 1 frase curta em pt-BR.', tinyBase64, 'image/png');
    console.log(`✅ Vision OK: "${resp.slice(0,150)}"`);
  } catch (e) {
    console.error(`❌ Vision falhou: ${e.message}`, e.details || '');
  }

  console.log('\n[4/4] Image SDXL Turbo — gerar 512x512 teste...');
  // Só testa se quiser gastar 1 crédito. Comenta se não quiser.
  const doImage = process.argv.includes('--with-image');
  if (!doImage) {
    console.log('⏭️  Pulado (use --with-image para testar e gastar 1 crédito)');
  } else {
    try {
      const buf = await generateImage('a cute astronaut cat on mars, cartoon style', {
        negative_prompt: 'blurry, low quality',
        width: 512,
        height: 512,
        seed: 42,
      });
      console.log(`✅ Image OK: ${buf.length} bytes`);
      fs.writeFileSync('/tmp/nvidia_test.png', buf);
      console.log('   salvo em /tmp/nvidia_test.png');
    } catch (e) {
      console.error(`❌ Image falhou: ${e.message}`, e.details || '');
    }
  }

  console.log('\n=== FIM ===');
}

main().catch(e => { console.error('Fatal', e); process.exit(1); });
