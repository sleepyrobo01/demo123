import { Question, UserPreferences } from '../types';
import { generateBangladeshQuestions } from './aiService';

export const CATEGORIES = [
  { id: 1, name: 'Bangladesh History & Liberation War' },
  { id: 2, name: 'Bangladesh Geography & Nature' },
  { id: 3, name: 'Bangladesh Culture & Arts' },
  { id: 4, name: 'Bangladesh Sports' },
  { id: 5, name: 'Bangladesh General Knowledge' },
  { id: 6, name: 'Bangladesh Science & Technology' },
];

export async function fetchDailyQuestions(preferences?: UserPreferences): Promise<Question[]> {
  try {
    // We now use AI to generate Bangladesh-specific questions
    return await generateBangladeshQuestions(preferences);
  } catch (error) {
    console.error("AI question generation failed, falling back to OpenTDB:", error);
    // Fallback logic in case AI fails
    return await fetchOpenTDBQuestions(preferences);
  }
}

async function fetchOpenTDBQuestions(preferences?: UserPreferences): Promise<Question[]> {
  // OpenTDB category IDs: 23=History, 22=Geography, 21=Sports, 9=General Knowledge, 18=Science/Tech
  const openTDBCats = [23, 22, 21, 9, 18];
  
  const difficulty = preferences?.difficulty && preferences.difficulty !== 'any'
    ? `&difficulty=${preferences.difficulty}`
    : '';

  const questions: Question[] = [];
  
  // Try to get questions from OpenTDB
  try {
    const response = await fetch(`https://opentdb.com/api.php?amount=5&category=9&type=multiple${difficulty}`);
    const data = await response.json();
    
    if (data.results && data.results.length > 0) {
      for (const res of data.results) {
        questions.push({
          question: decodeHtml(res.question),
          correctAnswer: decodeHtml(res.correct_answer),
          incorrectAnswers: res.incorrect_answers.map((a: string) => decodeHtml(a)),
          category: res.category,
          difficulty: res.difficulty,
        });
      }
    }
  } catch (error) {
    console.error("Error fetching fallback questions:", error);
  }
  
  return questions;
}

function decodeHtml(html: string) {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}
