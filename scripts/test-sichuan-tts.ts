/**
 * Test Sichuan dialect TTS with v1 API
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

async function testSichuanTTS() {
  // Dynamic import after env is loaded
  const { BytedanceTTSClient, TTS_SPEAKERS } = await import('../src/lib/tts/bytedance-tts');
  const fs = await import('fs');
  const path = await import('path');

  console.log('=== Testing Sichuan Dialect TTS (v1 API) ===\n');

  // Check environment variables
  console.log('TTS_APP_ID:', process.env.TTS_APP_ID ? 'Set' : 'Missing');
  console.log('TTS_ACCESS_TOKEN:', process.env.TTS_ACCESS_TOKEN ? 'Set' : 'Missing');

  // Get Sichuan speaker info
  const sichuanSpeaker = TTS_SPEAKERS.zh_female_sichuan;
  console.log('\nSichuan Speaker Config:');
  console.log('  ID:', sichuanSpeaker.id);
  console.log('  Name:', sichuanSpeaker.name);
  console.log('  Language:', sichuanSpeaker.language);

  // Create client
  const client = new BytedanceTTSClient();

  // Test text
  const testText = '你好呀，我是呆萌川妹，今天天气好巴适哦！';
  console.log('\nTest Text:', testText);

  // Get speaker ID
  const speakerId = BytedanceTTSClient.getSpeakerId('zh_female_sichuan');
  console.log('\nUsing Speaker ID:', speakerId);

  // Synthesize
  console.log('\nSynthesizing...');
  const result = await client.synthesize({
    text: testText,
    speaker: speakerId,
    format: 'mp3',
    speed: 1.0,
  });

  if (result.success && result.audioBuffer) {
    // Save to file
    const outputPath = path.join(__dirname, 'sichuan-test-output.mp3');
    fs.writeFileSync(outputPath, result.audioBuffer);
    console.log('\n✅ Success! Audio saved to:', outputPath);
    console.log('   Size:', (result.audioBuffer.length / 1024).toFixed(2), 'KB');
  } else {
    console.error('\n❌ Failed:', result.error);
  }
}

testSichuanTTS().catch(console.error);
