// Draw.io AI Chat API - 使用 AI SDK
// 完整复刻自 next-ai-draw-io 项目
// 支持 Gemini 和 Anthropic 模型

import { streamText, convertToModelMessages } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { z } from 'zod';

export const maxDuration = 300;

// 模型配置
const GEMINI_BASE_URL = process.env.SCROLLYTELLING_API_BASE_URL || '';
const GEMINI_API_KEY = process.env.SCROLLYTELLING_API_KEY || '';
const DEFAULT_GEMINI_MODEL = process.env.SCROLLYTELLING_MODEL || 'gemini-3-pro-preview';
const DEFAULT_ANTHROPIC_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
const MAX_TOKENS = 64000;

// 可用的模型列表 - 只支持两个模型（仅展示名称）
export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-5-20251101', name: '豆包 图表-快速', description: '默认模型', isDefault: true },
  { id: 'claude-sonnet-4-20250514', name: '豆包 图表-专业', description: '高精度图表生成', isDefault: false },
];

// 判断是否是 Gemini 模型
function isGeminiModel(modelId: string): boolean {
  return modelId.startsWith('gemini');
}

// Helper function to check if diagram is minimal/empty
function isMinimalDiagram(xml: string): boolean {
  const stripped = xml.replace(/\s/g, '');
  return !stripped.includes('id="2"');
}

// 系统提示词 - Draw.io 图表生成专家
const SYSTEM_PROMPT = `You are an expert diagram creation assistant specializing in draw.io XML generation.
Your primary function is chat with user and crafting clear, well-organized visual diagrams through precise XML specifications.
You can see the image that user uploaded.

You utilize the following tools:
---Tool1---
tool name: display_diagram
description: Display a NEW diagram on draw.io. Use this when creating a diagram from scratch or when major structural changes are needed.
parameters: {
  xml: string
}
---Tool2---
tool name: edit_diagram
description: Edit specific parts of the EXISTING diagram. Use this when making small targeted changes like adding/removing elements, changing labels, or adjusting properties. This is more efficient than regenerating the entire diagram.
parameters: {
  edits: Array<{search: string, replace: string}>
}
---End of tools---

IMPORTANT: Choose the right tool:
- Use display_diagram for: Creating new diagrams, major restructuring, or when the current diagram XML is empty
- Use edit_diagram for: Small modifications, adding/removing elements, changing text/colors, repositioning items

Core capabilities:
- Generate valid, well-formed XML strings for draw.io diagrams
- Create professional flowcharts, mind maps, entity diagrams, and technical illustrations
- Convert user descriptions into visually appealing diagrams using basic shapes and connectors
- Apply proper spacing, alignment and visual hierarchy in diagram layouts
- Adapt artistic concepts into abstract diagram representations using available shapes
- Optimize element positioning to prevent overlapping and maintain readability
- Structure complex systems into clear, organized visual components

Layout constraints:
- CRITICAL: Keep all diagram elements within a single page viewport to avoid page breaks
- Position all elements with x coordinates between 0-800 and y coordinates between 0-600
- Maximum width for containers (like AWS cloud boxes): 700 pixels
- Maximum height for containers: 550 pixels
- Use compact, efficient layouts that fit the entire diagram in one view
- Start positioning from reasonable margins (e.g., x=40, y=40) and keep elements grouped closely
- For large diagrams with many elements, use vertical stacking or grid layouts that stay within bounds
- Avoid spreading elements too far apart horizontally - users should see the complete diagram without a page break line

Note that:
- Use proper tool calls to generate or edit diagrams;
  - never return raw XML in text responses,
  - never use display_diagram to generate messages that you want to send user directly. e.g. to generate a "hello" text box when you want to greet user.
- Focus on producing clean, professional diagrams that effectively communicate the intended information through thoughtful layout and design choices.
- When artistic drawings are requested, creatively compose them using standard diagram shapes and connectors while maintaining visual clarity.
- Return XML only via tool calls, never in text responses.
- If user asks you to replicate a diagram based on an image, remember to match the diagram style and layout as closely as possible. Especially, pay attention to the lines and shapes, for example, if the lines are straight or curved, and if the shapes are rounded or square.
- Note that when you need to generate diagram about aws architecture, use **AWS 2025 icons**.

When using edit_diagram tool:
- Keep edits minimal - only include the specific line being changed plus 1-2 context lines
- Example GOOD edit: {"search": "  <mxCell id=\"2\" value=\"Old Text\">", "replace": "  <mxCell id=\"2\" value=\"New Text\">"}
- Example BAD edit: Including 10+ unchanged lines just to change one attribute
- For multiple changes, use separate edits: [{"search": "line1", "replace": "new1"}, {"search": "line2", "replace": "new2"}]
- RETRY POLICY: If edit_diagram fails because the search pattern cannot be found:
  * You may retry edit_diagram up to 3 times with adjusted search patterns
  * After 3 failed attempts, you MUST fall back to using display_diagram to regenerate the entire diagram
  * The error message will indicate how many retries remain

## Draw.io XML Structure Reference

Basic structure:
\`\`\`xml
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- All other cells go here as siblings -->
  </root>
</mxGraphModel>
\`\`\`

CRITICAL RULES:
1. Always include the two root cells: <mxCell id="0"/> and <mxCell id="1" parent="0"/>
2. ALL mxCell elements must be DIRECT children of <root> - NEVER nest mxCell inside another mxCell
3. Use unique sequential IDs for all cells (start from "2" for user content)
4. Set parent="1" for top-level shapes, or parent="<container-id>" for grouped elements

Shape (vertex) example:
\`\`\`xml
<mxCell id="2" value="Label" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
  <mxGeometry x="100" y="100" width="120" height="60" as="geometry"/>
</mxCell>
\`\`\`

Connector (edge) example:
\`\`\`xml
<mxCell id="3" style="endArrow=classic;html=1;" edge="1" parent="1" source="2" target="4">
  <mxGeometry relative="1" as="geometry"/>
</mxCell>
\`\`\`

Common styles:
- Shapes: rounded=1 (rounded corners), fillColor=#hex, strokeColor=#hex
- Edges: endArrow=classic/block/open/none, startArrow=none/classic, curved=1, edgeStyle=orthogonalEdgeStyle
- Text: fontSize=14, fontStyle=1 (bold), align=center/left/right
`;

// Beta headers for fine-grained tool streaming (Anthropic)
const ANTHROPIC_BETA_HEADERS = {
  'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14',
};

// Create model based on model ID
function createModel(modelId: string) {
  const useGemini = isGeminiModel(modelId);

  if (useGemini) {
    console.log('[DrawIO Chat] Using Gemini model:', modelId);
    // Ensure baseURL ends with /v1beta for Google AI API
    let googleBaseURL = GEMINI_BASE_URL;
    if (googleBaseURL && !googleBaseURL.endsWith('/v1beta')) {
      googleBaseURL = googleBaseURL.replace(/\/$/, '') + '/v1beta';
    }
    console.log('[DrawIO Chat] Google baseURL:', googleBaseURL);
    const google = createGoogleGenerativeAI({
      apiKey: GEMINI_API_KEY,
      baseURL: googleBaseURL || undefined,
    });
    return { model: google(modelId), isGemini: true };
  } else {
    console.log('[DrawIO Chat] Using Anthropic model:', modelId);
    const baseURL = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1';
    const anthropic = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
      baseURL: baseURL.endsWith('/v1') ? baseURL : `${baseURL}/v1`,
      headers: ANTHROPIC_BETA_HEADERS,
    });
    return { model: anthropic(modelId), isGemini: false };
  }
}

export async function POST(req: Request) {
  try {
    const { messages, xml, modelId: requestModelId } = await req.json();

    // 使用请求中的模型ID，默认使用 Claude
    const modelId = requestModelId || DEFAULT_ANTHROPIC_MODEL;

    // Get the last message for processing
    const lastMessage = messages[messages.length - 1];

    // Extract text from the last message parts
    const lastMessageText = lastMessage.parts?.find((part: any) => part.type === 'text')?.text || '';

    // Extract file parts (images) from the last message
    const fileParts = lastMessage.parts?.filter((part: any) => part.type === 'file') || [];

    const formattedTextContent = `
Current diagram XML:
"""xml
${xml || ''}
"""
User input:
"""md
${lastMessageText}
"""`;

    // Convert UIMessages to ModelMessages
    const modelMessages = convertToModelMessages(messages);

    // Filter out messages with empty content arrays
    let enhancedMessages = modelMessages.filter((msg: any) =>
      msg.content && Array.isArray(msg.content) && msg.content.length > 0
    );

    // Update the last message with formatted content if it's a user message
    if (enhancedMessages.length >= 1) {
      const lastModelMessage = enhancedMessages[enhancedMessages.length - 1];
      if (lastModelMessage.role === 'user') {
        // Build content array with text and file parts
        const contentParts: any[] = [
          { type: 'text', text: formattedTextContent }
        ];

        // Add image parts back
        for (const filePart of fileParts) {
          contentParts.push({
            type: 'image',
            image: filePart.url,
            mimeType: filePart.mediaType
          });
        }

        enhancedMessages = [
          ...enhancedMessages.slice(0, -1),
          { ...lastModelMessage, content: contentParts }
        ];
      }
    }

    // Create model
    const { model, isGemini } = createModel(modelId);

    // Build streamText options
    // Note: When thinking is enabled, temperature must not be set for Claude
    const streamOptions: any = {
      model: model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...enhancedMessages,
      ],
      tools: {
        // Client-side tool that will be executed on the client
        display_diagram: {
          description: `Display a diagram on draw.io. Pass the XML content inside <root> tags.

VALIDATION RULES (XML will be rejected if violated):
1. All mxCell elements must be DIRECT children of <root> - never nested
2. Every mxCell needs a unique id
3. Every mxCell (except id="0") needs a valid parent attribute
4. Edge source/target must reference existing cell IDs
5. Escape special chars in values: &lt; &gt; &amp; &quot;
6. Always start with: <mxCell id="0"/><mxCell id="1" parent="0"/>

Example with swimlanes and edges (note: all mxCells are siblings):
<root>
  <mxCell id="0"/>
  <mxCell id="1" parent="0"/>
  <mxCell id="lane1" value="Frontend" style="swimlane;" vertex="1" parent="1">
    <mxGeometry x="40" y="40" width="200" height="200" as="geometry"/>
  </mxCell>
  <mxCell id="step1" value="Step 1" style="rounded=1;" vertex="1" parent="lane1">
    <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
  </mxCell>
  <mxCell id="lane2" value="Backend" style="swimlane;" vertex="1" parent="1">
    <mxGeometry x="280" y="40" width="200" height="200" as="geometry"/>
  </mxCell>
  <mxCell id="step2" value="Step 2" style="rounded=1;" vertex="1" parent="lane2">
    <mxGeometry x="20" y="60" width="160" height="40" as="geometry"/>
  </mxCell>
  <mxCell id="edge1" style="edgeStyle=orthogonalEdgeStyle;endArrow=classic;" edge="1" parent="1" source="step1" target="step2">
    <mxGeometry relative="1" as="geometry"/>
  </mxCell>
</root>

Notes:
- For AWS diagrams, use **AWS 2025 icons**.
- For animated connectors, add "flowAnimation=1" to edge style.
`,
          inputSchema: z.object({
            xml: z.string().describe("XML string to be displayed on draw.io")
          })
        },
        edit_diagram: {
          description: `Edit specific parts of the current diagram by replacing exact line matches. Use this tool to make targeted fixes without regenerating the entire XML.
IMPORTANT: Keep edits concise:
- Only include the lines that are changing, plus 1-2 surrounding lines for context if needed
- Break large changes into multiple smaller edits
- Each search must contain complete lines (never truncate mid-line)
- First match only - be specific enough to target the right element`,
          inputSchema: z.object({
            edits: z.array(z.object({
              search: z.string().describe("Exact lines to search for (including whitespace and indentation)"),
              replace: z.string().describe("Replacement lines")
            })).describe("Array of search/replace pairs to apply sequentially")
          })
        },
      },
    };

    // Add thinking (chain of thought) for both models
    // Note: Claude doesn't support temperature when thinking is enabled
    // And maxOutputTokens + thinkingBudget must not exceed model limit (64000)
    if (isGemini) {
      streamOptions.maxOutputTokens = MAX_TOKENS;
      streamOptions.temperature = 0;
      streamOptions.providerOptions = {
        google: {
          thinkingConfig: {
            includeThoughts: true,
          },
        },
      };
    } else {
      // Claude extended thinking - no temperature, and budget must fit within 64000
      const thinkingBudget = 4000; // 较短的思考预算
      streamOptions.maxOutputTokens = 60000; // 64000 - 4000 thinking budget
      // Don't set temperature when thinking is enabled for Claude
      streamOptions.providerOptions = {
        anthropic: {
          thinking: {
            type: 'enabled',
            budgetTokens: thinkingBudget,
          },
        },
      };
    }

    const result = streamText(streamOptions);

    // Error handler function to provide detailed error messages
    function errorHandler(error: unknown) {
      if (error == null) {
        return 'unknown error';
      }

      const errorString = typeof error === 'string'
        ? error
        : error instanceof Error
          ? error.message
          : JSON.stringify(error);

      // Check for image not supported error
      if (errorString.includes('image_url') ||
          errorString.includes('unknown variant') ||
          (errorString.includes('image') && errorString.includes('not supported'))) {
        return 'This model does not support image inputs. Please remove the image and try again, or switch to a vision-capable model.';
      }

      return errorString;
    }

    return result.toUIMessageStreamResponse({
      onError: errorHandler,
    });
  } catch (error) {
    console.error('Error in chat route:', error);
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
