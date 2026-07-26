import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export interface AnalyzedFoodItem {
  name: string;
  calories: number;
  quantity: string;
}

export interface AnalyzeResult {
  items: AnalyzedFoodItem[];
  /** true when the result came from the built-in demo analyzer (no GEMINI_API_KEY configured, or the API call failed) */
  isMock: boolean;
  /** true when Gemini successfully looked at the photo but found no food or drink in it */
  noFoodDetected: boolean;
}

const analysisResponseSchema = z.object({
  // An empty array is valid: it's how Gemini tells us the photo has no food/drink in it.
  items: z.array(
    z.object({
      name: z.string().min(1),
      quantity: z.string().default(""),
      calories: z.coerce.number().min(0),
    }),
  ),
});

// Bounds how long we'll wait on a single Gemini call before giving up and falling back to
// the mock analyzer. Without this, a hung/slow network path to Gemini could leave the whole
// request stuck until Vercel's `maxDuration` (300s) kills the function — which the user would
// experience as the UI just spinning forever with zero feedback. Configurable in case Gemini
// vision calls genuinely need longer under normal conditions.
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 55_000;

/**
 * Analyzes a meal photo and returns the detected food items with estimated calories.
 * Uses Google Gemini's vision-capable model when GEMINI_API_KEY is configured.
 * Falls back to a built-in demo analyzer (randomized, plausible sample data) when no key is
 * configured or the API call itself fails, so the app always stays usable. When Gemini runs
 * successfully but confirms the photo has no food in it, that's reported via `noFoodDetected`
 * instead of being treated as a failure.
 *
 * @param reqId optional request id (propagated from the API route) purely for log correlation.
 */
export async function analyzeFoodImage(imageDataUrl: string, reqId = "-"): Promise<AnalyzeResult> {
  const tag = `[analyzeFoodImage:${reqId}]`;
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    console.log(`${tag} no GEMINI_API_KEY configured -> using mock analyzer`);
    return { items: mockAnalyze(), isMock: true, noFoodDetected: false };
  }

  const startedAt = Date.now();
  try {
    console.log(`${tag} calling Gemini (imageDataUrl length=${imageDataUrl.length} chars)`);
    const items = await analyzeWithGemini(imageDataUrl, apiKey, tag);
    console.log(`${tag} Gemini responded in ${Date.now() - startedAt}ms, items=${items.length}`);
    if (!items.length) {
      return { items: [], isMock: false, noFoodDetected: true };
    }
    return { items, isMock: false, noFoodDetected: false };
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    const name = error instanceof Error ? error.name : typeof error;
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      `${tag} Gemini analysis failed after ${elapsed}ms (${name}: ${message}) — falling back to demo data`,
      error,
    );
    return { items: mockAnalyze(), isMock: true, noFoodDetected: false };
  }
}

/** Splits a `data:<mime>;base64,<data>` URL into its parts for the Gemini SDK. */
function parseDataUrl(dataUrl: string): { mimeType: string; base64: string } {
  const match = /^data:(.+?);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) {
    throw new Error("Ảnh không đúng định dạng data URL");
  }
  return { mimeType: match[1], base64: match[2] };
}

async function analyzeWithGemini(
  imageDataUrl: string,
  apiKey: string,
  tag: string,
): Promise<AnalyzedFoodItem[]> {
  // `httpOptions.timeout` bounds the actual HTTP call to Gemini itself (in ms) — see
  // GEMINI_TIMEOUT_MS above for why this matters.
  const client = new GoogleGenAI({ apiKey, httpOptions: { timeout: GEMINI_TIMEOUT_MS } });
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";
  const { mimeType, base64 } = parseDataUrl(imageDataUrl);
  console.log(`${tag} model=${model} mimeType=${mimeType} base64Length=${base64.length} timeoutMs=${GEMINI_TIMEOUT_MS}`);

  const requestStartedAt = Date.now();
  const interaction = await client.interactions.create({
    model,
    system_instruction:
      "Bạn là chuyên gia dinh dưỡng AI, chuyên nhận diện món ăn trong ảnh và ước tính lượng calo. " +
      "Luôn trả lời DUY NHẤT một đối tượng JSON hợp lệ theo đúng định dạng sau, không thêm markdown hay giải thích:\n" +
      '{"items": [{"name": "Tên món ăn bằng tiếng Việt", "quantity": "Mô tả khẩu phần ước tính, vd \'1 chén (200g)\'", "calories": 123}]}\n' +
      "Ước tính calo dựa trên khẩu phần nhìn thấy trong ảnh và kiến thức dinh dưỡng phổ thông. " +
      "Nếu ảnh có nhiều món, liệt kê từng món riêng biệt. Nếu có đồ ăn/thức uống nhưng khó nhận diện chính xác, " +
      "vẫn cố gắng đoán và đưa ra ước tính hợp lý nhất — không được bỏ qua. " +
      'Chỉ trả về {"items": []} khi ảnh THỰC SỰ không chứa bất kỳ món ăn hay thức uống nào ' +
      "(ví dụ: ảnh phong cảnh, con người, đồ vật, ảnh mờ/đen không nhìn rõ nội dung).",
    input: [
      {
        type: "text",
        text: "Hãy nhận diện các món ăn trong hình và ước tính calo cho từng món.",
      },
      {
        type: "image",
        data: base64,
        mime_type: mimeType,
      },
    ],
    response_format: { type: "text", mime_type: "application/json" },
    generation_config: {
      temperature: 0.2,
      max_output_tokens: 1500,
      thinking_level: "low",
    },
  });

  const raw = interaction.output_text;
  console.log(`${tag} raw HTTP call completed in ${Date.now() - requestStartedAt}ms, output_text length=${raw?.length ?? 0}`);
  if (!raw) {
    throw new Error("Gemini không trả về nội dung nào");
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (parseError) {
    // Log a preview (not the full payload — could be long) so malformed-JSON cases are
    // diagnosable straight from the logs without needing to reproduce the exact request.
    console.error(`${tag} Gemini output_text is not valid JSON. Preview: ${raw.slice(0, 300)}`);
    throw parseError;
  }
  const parsed = analysisResponseSchema.safeParse(json);
  if (!parsed.success) {
    console.error(`${tag} Gemini JSON didn't match expected schema:`, parsed.error.message, "Raw preview:", raw.slice(0, 300));
    throw new Error(`Phản hồi của Gemini không đúng định dạng: ${parsed.error.message}`);
  }

  return parsed.data.items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    calories: Math.round(item.calories),
  }));
}

/** Curated demo food pool so the app is fully usable without a Gemini API key. */
const DEMO_FOOD_POOL: AnalyzedFoodItem[] = [
  { name: "Phở bò", calories: 480, quantity: "1 tô (500g)" },
  { name: "Cơm tấm sườn bì chả", calories: 720, quantity: "1 đĩa (450g)" },
  { name: "Bún chả Hà Nội", calories: 650, quantity: "1 phần (400g)" },
  { name: "Gỏi cuốn tôm thịt", calories: 220, quantity: "3 cuốn" },
  { name: "Bánh mì thịt", calories: 400, quantity: "1 ổ (250g)" },
  { name: "Cơm chiên dương châu", calories: 580, quantity: "1 đĩa (400g)" },
  { name: "Canh chua cá lóc", calories: 180, quantity: "1 tô (350g)" },
  { name: "Rau muống xào tỏi", calories: 120, quantity: "1 đĩa (150g)" },
  { name: "Trứng ốp la", calories: 160, quantity: "2 quả" },
  { name: "Chả giò rán", calories: 280, quantity: "4 cuốn" },
];

function mockAnalyze(): AnalyzedFoodItem[] {
  const shuffled = [...DEMO_FOOD_POOL].sort(() => Math.random() - 0.5);
  const count = 2 + Math.floor(Math.random() * 3); // 2 to 4 items
  return shuffled.slice(0, count).map((item) => ({
    ...item,
    // add +/-10% jitter so repeated demo calls don't always look identical
    calories: Math.round(item.calories * (0.9 + Math.random() * 0.2)),
  }));
}
