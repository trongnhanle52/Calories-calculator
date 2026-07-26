import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

export interface EstimateCaloriesResult {
  calories: number;
  /** true when the result came from the built-in demo estimator (no GEMINI_API_KEY configured, or the API call failed) */
  isMock: boolean;
  /**
   * false when `name` doesn't look like a real, recognizable food/drink — e.g. random
   * keyboard-mashed text, or something that clearly isn't an edible item. Lets the UI show a
   * "không tìm thấy món ăn" hint instead of a made-up calorie number for that row.
   */
  found: boolean;
}

const estimateResponseSchema = z.object({
  // Optional + defaulted to true: older/looser model responses that omit this field should
  // still be treated as a normal estimate rather than silently rejected.
  found: z.boolean().optional().default(true),
  calories: z.coerce.number().min(0),
});

/**
 * Estimates calories for a single food item given just its name and a quantity/serving
 * description (no photo) — used when the user types in a meal item by hand instead of
 * relying on the photo analyzer. Uses a lightweight text-only Gemini call (much cheaper/
 * faster than the vision call in `analyzeFood.ts`). Falls back to a rough heuristic guess
 * when no GEMINI_API_KEY is configured or the API call fails, so the field never gets stuck.
 */
export async function estimateCalories(name: string, quantity: string): Promise<EstimateCaloriesResult> {
  const apiKey = process.env.GEMINI_API_KEY?.trim();

  if (!apiKey) {
    return { ...mockEstimate(name, quantity), isMock: true };
  }

  try {
    const result = await estimateWithGemini(name, quantity, apiKey);
    return { ...result, isMock: false };
  } catch (error) {
    console.error("[estimateCalories] Gemini estimate failed, falling back to a rough guess:", error);
    return { ...mockEstimate(name, quantity), isMock: true };
  }
}

async function estimateWithGemini(
  name: string,
  quantity: string,
  apiKey: string,
): Promise<{ calories: number; found: boolean }> {
  const client = new GoogleGenAI({ apiKey });
  const model = process.env.GEMINI_MODEL?.trim() || "gemini-flash-latest";

  const interaction = await client.interactions.create({
    model,
    system_instruction:
      "Bạn là chuyên gia dinh dưỡng AI. Người dùng sẽ cho biết tên món ăn và khẩu phần/số lượng. " +
      "Việc đầu tiên: xác định xem chuỗi 'Tên món ăn' có thực sự là tên một món ăn/thức uống hợp lý hay không " +
      "(có thể là món ít phổ biến, miễn tên nghe hợp lý là thực phẩm/đồ uống — vẫn tính found=true). " +
      "Đặt found=false và calories=0 nếu tên đó là chữ gõ bừa/vô nghĩa (vd 'dnsanbdas', 'asdkjh'), tên quá mơ hồ " +
      "không xác định được là món gì, hoặc rõ ràng không phải thực phẩm/đồ uống (vd tên đồ vật, con vật sống, địa danh...). " +
      "Nếu found=true, ước tính tổng lượng calo hợp lý nhất cho đúng khẩu phần đó dựa trên kiến thức dinh dưỡng " +
      "phổ thông (ẩm thực Việt Nam là chủ yếu, nhưng cũng có thể là món khác). " +
      "Không hỏi lại, không giải thích, không thêm markdown. " +
      'Luôn trả lời DUY NHẤT một đối tượng JSON đúng theo schema đã cho, vd: {"found": true, "calories": 123} ' +
      'hoặc {"found": false, "calories": 0}',
    input: [
      {
        type: "text",
        text: `Tên món ăn: ${name}\nKhẩu phần/số lượng: ${quantity || "không rõ, giả định khẩu phần thông thường 1 người ăn"}`,
      },
    ],
    response_format: {
      type: "text",
      mime_type: "application/json",
      schema: {
        type: "object",
        properties: {
          found: {
            type: "boolean",
            description: "false nếu 'Tên món ăn' không phải một món ăn/thức uống có thật, hợp lý",
          },
          calories: { type: "number", description: "Tổng lượng calo ước tính cho khẩu phần này (0 nếu found=false)" },
        },
        required: ["found", "calories"],
      },
    },
    generation_config: {
      temperature: 0.2,
      max_output_tokens: 500,
      thinking_level: "low",
    },
  });

  const raw = interaction.output_text;
  if (!raw) {
    throw new Error("Gemini không trả về nội dung nào");
  }

  const json = extractJson(raw);
  const parsed = estimateResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(`Phản hồi của Gemini không đúng định dạng: ${parsed.error.message}`);
  }

  return {
    found: parsed.data.found,
    calories: parsed.data.found ? Math.round(parsed.data.calories) : 0,
  };
}

/**
 * Parses `raw` as JSON, tolerating models that ignore the "JSON only" instruction and wrap
 * the object in markdown fences or a bit of surrounding prose — falls back to extracting the
 * first `{...}` block before giving up.
 */
function extractJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const match = /\{[\s\S]*\}/.exec(raw);
    if (!match) {
      throw new Error(`Không tìm thấy JSON hợp lệ trong phản hồi: ${raw.slice(0, 200)}`);
    }
    return JSON.parse(match[0]);
  }
}

const VOWELS = "aàáạảãâầấậẩẫăằắặẳẵeèéẹẻẽêềếệểễiìíịỉĩoòóọỏõôồốộổỗơờớợởỡuùúụủũưừứựửữyỳýỵỷỹ";

// The three standard QWERTY letter rows — typing straight across one of these ("qwerty",
// "asdfgh", "zxcvbn", ...) is one of the most common "I'm just testing this / mashing keys"
// patterns and is safe to flag: no real food name is ever a literal substring of a keyboard row.
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function isKeyboardMash(letters: string): boolean {
  if (letters.length < 4 || !/^[a-z]+$/.test(letters)) return false;
  const reversed = [...letters].reverse().join("");
  return KEYBOARD_ROWS.some((row) => row.includes(letters) || row.includes(reversed));
}

/**
 * Heuristic-only "is this even a food name" check used for the mock fallback path (no
 * GEMINI_API_KEY configured, or the real API call failed). Can't understand meaning like
 * Gemini does, so it only catches the obvious, structurally-safe cases: no letters at all,
 * no vowels whatsoever, an implausibly long run of consonants, or typing straight across a
 * keyboard row (e.g. "qwertyuiop"). Purely random letter salad that happens to still contain
 * vowels (e.g. "dnsanbdas") can slip past this — catching that reliably needs actual meaning,
 * which is exactly what the real Gemini path above already does (it's told to reject gibberish
 * explicitly). This function only has to hold up the fort while Gemini is unavailable.
 */
function looksLikeGibberish(name: string): boolean {
  // \u1EFF covers the full "Latin Extended Additional" block so every Vietnamese toned vowel
  // (including the ones past ỉ, like ộ/ớ/ữ/ỹ) survives instead of being stripped out.
  const letters = name.toLowerCase().replace(/[^a-z\u00c0-\u1eff]/gi, "");
  if (letters.length < 2) return true;

  const vowelCount = [...letters].filter((ch) => VOWELS.includes(ch)).length;
  if (vowelCount === 0) return true;

  if (isKeyboardMash(letters)) return true;

  const consonantRun = new RegExp(`[^${VOWELS}\\s]{5,}`, "i");
  return consonantRun.test(letters);
}

/** Rough, deterministic-ish fallback so the field still gets a plausible value without an API key. */
function mockEstimate(name: string, quantity: string): { calories: number; found: boolean } {
  if (looksLikeGibberish(name)) {
    return { calories: 0, found: false };
  }

  // Try to pick up an explicit gram amount (e.g. "200g", "1 chén (150g)") for a slightly better guess.
  const gramMatch = /(\d+(?:[.,]\d+)?)\s*g\b/i.exec(quantity);
  const grams = gramMatch ? parseFloat(gramMatch[1].replace(",", ".")) : null;

  const base = grams ? grams * 1.8 : 300; // ~1.8 kcal/g is a generic mixed-plate average
  const seed = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const jitter = 0.85 + ((seed % 30) / 100); // deterministic +/- jitter per name so it doesn't feel random
  return { calories: Math.round(base * jitter), found: true };
}
