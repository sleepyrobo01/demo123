import { GoogleGenAI, Type } from "@google/genai";
import { Question, UserPreferences } from "../types";

const key = process.env.GEMINI_API_KEY;

if (!key || key === 'MY_GEMINI_API_KEY') {
  console.warn("⚠️ AI SERVICE WARNING: Gemini API Key is missing or using placeholder. Falling back to general trivia.");
}

const ai = new GoogleGenAI({ apiKey: key || '' });

export async function generateBangladeshQuestions(preferences?: UserPreferences): Promise<Question[]> {
  const difficulty = preferences?.difficulty || 'medium';
  const categories = preferences?.categories || [];
  
  const prompt = `You are a trivia expert specializing in Bangladesh.
  Generate exactly 5 high-quality, interesting trivia questions about Bangladesh.
  
  Difficulty Level: ${difficulty === 'any' ? 'balanced' : difficulty}

  TOPIC FOCUS (strictly limited to Bangladesh):
  - History (including the 1971 Liberation War and Language Movement)
  - Geography (Rivers, Sundarbans, Cox's Bazar, regions)
  - Culture & Heritage (Poetry, Music, Festivals, Art)
  - Sports (Cricket, National games)
  - General Knowledge (Constitution, National symbols, Famous personalities)

  Return the response as a JSON array of objects:
  {
    "question": "The question text specifically about Bangladesh",
    "correctAnswer": "The single correct answer",
    "incorrectAnswers": ["Wrong 1", "Wrong 2", "Wrong 3"],
    "category": "Appropriate category name",
    "difficulty": "${difficulty === 'any' ? 'medium' : difficulty}"
  }`;

  try {
    const response = await ai.getGenerativeModel({
      model: "gemini-1.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              correctAnswer: { type: Type.STRING },
              incorrectAnswers: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              category: { type: Type.STRING },
              difficulty: { type: Type.STRING }
            },
            required: ["question", "correctAnswer", "incorrectAnswers", "category", "difficulty"]
          }
        }
      }
    }).generateContent(prompt);

    const questions = JSON.parse(response.response.text());
    return questions.map((q: any) => ({
      ...q,
      difficulty: q.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard'
    }));
  } catch (error) {
    console.error("Error generating AI questions:", error);
    throw error;
  }
}
