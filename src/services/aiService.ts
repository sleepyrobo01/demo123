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
  
  const prompt = `Generate 5 trivia questions specifically about Bangladesh.
  Difficulty: ${difficulty === 'any' ? 'mixed' : difficulty}
  ${categories.length > 0 ? `Try to include questions related to these category IDs if possible: ${categories.join(', ')} (where 9=General Knowledge, 17=Science, 11=Entertainment, 23=History, 22=Geography, 18=Technology, 21=Sports, 27=Animals, 20=Mythology).` : ''}
  
  Each question must be about Bangladesh's culture, history, geography, sports, or people.
  
  Return the response as a JSON array of objects with the following structure:
  {
    "question": "The question text",
    "correctAnswer": "The single correct answer",
    "incorrectAnswers": ["Wrong 1", "Wrong 2", "Wrong 3"],
    "category": "The category name (e.g. History, Geography)",
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
