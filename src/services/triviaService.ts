import { Question, UserPreferences } from '../types';
import { generateBangladeshQuestions } from './aiService';

export const CATEGORIES = [
  { id: 1, name: 'History & Liberation War' },
  { id: 2, name: 'Geography & Nature' },
  { id: 3, name: 'Culture & Arts' },
  { id: 4, name: 'Sports' },
  { id: 5, name: 'General Knowledge' },
  { id: 6, name: 'Science & Technology' },
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
  // Use user preferences if available, otherwise use default categories
  const availableCategories = preferences?.categories && preferences.categories.length > 0
    ? CATEGORIES.filter(c => preferences.categories.includes(c.id))
    : CATEGORIES.slice(0, 6);
  
  const difficulty = preferences?.difficulty && preferences.difficulty !== 'any'
    ? `&difficulty=${preferences.difficulty}`
    : '';

  // We'll pick 5 random categories from the available ones
  const selectedCategories = [...availableCategories].sort(() => 0.5 - Math.random()).slice(0, 5);
  
  const questions: Question[] = [];
  
  // Try to get questions from selected categories
  for (const cat of selectedCategories) {
    try {
      const response = await fetch(`https://opentdb.com/api.php?amount=1&category=${cat.id}&type=multiple${difficulty}`);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const res = data.results[0];
        questions.push({
          question: decodeHtml(res.question),
          correctAnswer: decodeHtml(res.correct_answer),
          incorrectAnswers: res.incorrect_answers.map((a: string) => decodeHtml(a)),
          category: res.category,
          difficulty: res.difficulty,
        });
      }
    } catch (error) {
      console.error(`Error fetching question for category ${cat.name}:`, error);
    }
  }

  // If we don't have 5 questions, try to fill from available categories without difficulty constraint
  if (questions.length < 5) {
    for (const cat of selectedCategories) {
      if (questions.length === 5) break;
      try {
        const response = await fetch(`https://opentdb.com/api.php?amount=1&category=${cat.id}&type=multiple`);
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          const res = data.results[0];
          questions.push({
            question: decodeHtml(res.question),
            correctAnswer: decodeHtml(res.correct_answer),
            incorrectAnswers: res.incorrect_answers.map((a: string) => decodeHtml(a)),
            category: res.category,
            difficulty: res.difficulty,
          });
        }
      } catch (e) {}
    }
  }

  // Final fallback to General Knowledge if still not enough
  while (questions.length < 5) {
    try {
      const response = await fetch(`https://opentdb.com/api.php?amount=${5 - questions.length}&category=9&type=multiple`);
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
          if (questions.length === 5) break;
        }
      } else {
        break;
      }
    } catch (error) {
      break;
    }
  }
  
  return questions;
}

function decodeHtml(html: string) {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
}
