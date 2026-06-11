import { GoogleGenAI, Type } from "@google/genai";

export interface AIInsight {
  status: 'positive' | 'warning' | 'critical' | 'info';
  title: string;
  recommendation: string;
  reasoning: string;
}

export interface AIStrategyResponse {
  summary: string;
  insights: AIInsight[];
  overallHealth: number; // 0-100
}

let aiClient: GoogleGenAI | null = null;

function getAI() {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY not found in environment");
      return null;
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export async function getDashboardStrategy(data: any): Promise<AIStrategyResponse | null> {
  const ai = getAI();
  if (!ai) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: `
        Analyze the following marketing performance data and provide a strategic summary.
        Data: ${JSON.stringify(data)}

        IMPORTANT: 
        1. TRẢ LỜI 100% BẰNG TIẾNG VIỆT (VIETNAMESE).
        2. Dữ liệu doanh thu thực tế đã được chuyển thành chỉ số ROAS. Do đó, KHÔNG nhận xét về việc "thiếu dữ liệu doanh thu" hay "doanh thu bằng 0". Hãy tập trung phân tích hiệu quả doanh thu thông qua chỉ số ROAS và số lượng đơn hàng/lượt mua.
        3. Trong dữ liệu gửi lên, "realRoasMonth" là chỉ số ROAS (%) của tháng tính theo khoảng thời gian đang chọn. "realRoas3Months" là chỉ số ROAS (%) trung bình của 3 tháng gần nhất. Cả 2 chỉ số này tính theo đơn vị % (ví dụ 169.55 nghĩa là 169.55%). Cần tận dụng để phân tích xu hướng thu lời của dự án.

        Provide your response in JSON format according to the following schema:
        {
          "summary": "Short overview text",
          "overallHealth": number (0-100 score),
          "insights": [
            {
              "status": "positive" | "warning" | "critical" | "info",
              "title": "Short title",
              "recommendation": "What should be done",
              "reasoning": "Why this is recommended"
            }
          ]
        }
      `}] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            overallHealth: { type: Type.NUMBER },
            insights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  status: { 
                    type: Type.STRING,
                    description: "Status level: positive, warning, critical, or info"
                  },
                  title: { type: Type.STRING },
                  recommendation: { type: Type.STRING },
                  reasoning: { type: Type.STRING }
                },
                required: ["status", "title", "recommendation", "reasoning"]
              }
            }
          },
          required: ["summary", "overallHealth", "insights"]
        }
      }
    });

    const text = response.text;
    if (text) {
      const cleanText = text.replace(/```(?:json)?\n?/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText);
    }
    return null;
  } catch (error) {
    console.error("Gemini Strategy Error:", error);
    return null;
  }
}

export async function extractKpiFromImage(base64: string, mimeType: string): Promise<any> {
  const ai = getAI();
  if (!ai) return null;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{
        role: "user",
        parts: [
          { text: "Extract the KPI configuration data from this image carefully. Read all the table cells for budget, data quantities, and personnel mapping. Map 'Nội Địa' to domestic and 'Nước Ngoài' (or 'Việt Kiều') to overseas." },
          { inlineData: { data: base64.split(",")[1], mimeType } }
        ]
      }],
      config: getKpiExtractConfig()
    });

    const text = response.text;
    if (text) {
      const cleanText = text.replace(/```(?:json)?\n?/gi, '').replace(/```/g, '').trim();
      return JSON.parse(cleanText);
    }
    return null;
  } catch (error) {
    console.error("Gemini Image Extraction Error:", error);
  }
  return null;
}

export async function extractKpiFromText(csvText: string): Promise<any> {
    const ai = getAI();
    if (!ai) return null;

    const models = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"];
    const contents = [{
      role: "user",
      parts: [{ text: `Extract the KPI configuration data from this CSV content carefully. Look for total budget (domestic/overseas), total data count (domestic/overseas), base prices, base data counts, and the list of personnel with their level and market.\n\nCSV:\n${csvText}` }]
    }];

    for (const model of models) {
      try {
        const response = await ai.models.generateContent({ model, contents, config: getKpiExtractConfig() });
        let text = response.text;
        if (!text) {
          const parts = (response as any)?.candidates?.[0]?.content?.parts;
          if (parts?.length) text = parts[0].text;
        }
        if (text) {
          const cleanText = text.replace(/```(?:json)?\n?/gi, '').replace(/```/g, '').trim();
          return JSON.parse(cleanText);
        }
      } catch (error: any) {
        console.warn(`[Gemini KPI] Model ${model} failed:`, error?.message || error);
        if (model === models[models.length - 1]) console.error("Gemini Text Extraction Error: all models failed");
      }
    }
    return null;
}

function getKpiExtractConfig() {
  return {
    responseMimeType: "application/json",
    responseSchema: {
      type: Type.OBJECT,
      properties: {
        totalBudgetDomestic: { type: Type.NUMBER, description: "Total domestic budget" },
        totalBudgetOverseas: { type: Type.NUMBER, description: "Total overseas budget" },
        totalDataDomestic: { type: Type.NUMBER, description: "Total domestic data count" },
        totalDataOverseas: { type: Type.NUMBER, description: "Total overseas data count" },
        basePriceDomestic: { type: Type.NUMBER, description: "Base price per data for domestic" },
        basePriceOverseas: { type: Type.NUMBER, description: "Base price per data for overseas" },
        baseDataDomestic: { type: Type.NUMBER, description: "Base data count for Level 1 domestic" },
        baseDataOverseas: { type: Type.NUMBER, description: "Base data count for Level 1 overseas" },
        personnel: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              levelId: { type: Type.STRING, description: "level1, level2, level3, level4" },
              market: { type: Type.STRING, description: "'Nội Địa', 'Việt Kiều', or 'Cả Hai'" }
            },
            required: ["name", "levelId", "market"]
          }
        }
      }
    }
  };
}
