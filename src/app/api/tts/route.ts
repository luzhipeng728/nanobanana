import { NextRequest, NextResponse } from 'next/server';
import { textToSpeech, TTS_SPEAKERS, type SpeakerKey } from '@/lib/tts';
import { uploadBufferToR2 } from '@/lib/r2';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, speaker, speed, volume, pitch } = body;

    if (!text || typeof text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Text is required' },
        { status: 400 }
      );
    }

    // 文本长度限制 (火山引擎限制约 5000 字符)
    if (text.length > 5000) {
      return NextResponse.json(
        { success: false, error: 'Text too long (max 5000 characters)' },
        { status: 400 }
      );
    }

    // 获取发音人 ID
    let speakerId = speaker;
    if (speaker && speaker in TTS_SPEAKERS) {
      speakerId = TTS_SPEAKERS[speaker as SpeakerKey].id;
    }

    console.log(`[TTS] Generating speech for text: "${text.substring(0, 50)}..." with speaker: ${speakerId || 'default'}`);

    const result = await textToSpeech(text, {
      speaker: speakerId,
      speed: speed || 1.0,
      volume: volume || 1.0,
      pitch: pitch || 1.0,
    });

    if (!result.success || !result.audioBuffer) {
      console.error('[TTS] Generation failed:', result.error);
      return NextResponse.json(
        { success: false, error: result.error || 'TTS generation failed' },
        { status: 500 }
      );
    }

    console.log(`[TTS] Audio generated, size: ${result.audioBuffer.length} bytes`);

    // 上传到 R2
    const audioUrl = await uploadBufferToR2(
      result.audioBuffer,
      result.mimeType || 'audio/mpeg',
      'audio'
    );

    console.log(`[TTS] Audio uploaded to R2: ${audioUrl}`);

    return NextResponse.json({
      success: true,
      audioUrl,
      mimeType: result.mimeType,
      textLength: text.length,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[TTS] API Error:', errorMessage);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

// 获取可用的发音人列表
export async function GET() {
  const speakers = Object.entries(TTS_SPEAKERS).map(([key, value]) => ({
    key,
    ...value,
  }));

  return NextResponse.json({
    success: true,
    speakers,
  });
}
