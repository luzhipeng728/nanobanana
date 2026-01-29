/**
 * Test all TTS speakers with v1 API
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

// Dynamic import after env is loaded
async function main() {
  const { BytedanceTTSClient, TTS_SPEAKERS } = await import('../src/lib/tts/bytedance-tts');
  type SpeakerKey = keyof typeof TTS_SPEAKERS;

  console.log('=== Testing All TTS Speakers with v1 API ===\n');
  console.log('TTS_APP_ID:', process.env.TTS_APP_ID ? 'Set' : 'Missing');
  console.log('TTS_ACCESS_TOKEN:', process.env.TTS_ACCESS_TOKEN ? 'Set' : 'Missing');

  const client = new BytedanceTTSClient();
  const testText = '你好，这是一个语音测试。';

  const speakerKeys = Object.keys(TTS_SPEAKERS) as SpeakerKey[];
  const results: { key: string; name: string; success: boolean; error?: string; size?: number }[] = [];

  for (const key of speakerKeys) {
    const speaker = TTS_SPEAKERS[key];
    console.log(`\nTesting: ${key} (${speaker.name})...`);

    const result = await client.synthesize({
      text: testText,
      speaker: speaker.id,
      format: 'mp3',
    });

    if (result.success && result.audioBuffer) {
      console.log(`  ✅ Success - ${(result.audioBuffer.length / 1024).toFixed(2)} KB`);
      results.push({ key, name: speaker.name, success: true, size: result.audioBuffer.length });
    } else {
      console.log(`  ❌ Failed - ${result.error}`);
      results.push({ key, name: speaker.name, success: false, error: result.error });
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\n\n=== Summary ===');
  const succeeded = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ Succeeded: ${succeeded.length}/${results.length}`);
  succeeded.forEach(r => console.log(`  - ${r.key} (${r.name})`));

  if (failed.length > 0) {
    console.log(`\n❌ Failed: ${failed.length}/${results.length}`);
    failed.forEach(r => console.log(`  - ${r.key} (${r.name}): ${r.error}`));
  }
}

main().catch(console.error);
