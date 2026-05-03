import { Question, UserPreferences } from '../types';
import { BANGLADESH_QUESTIONS } from '../data/bangladeshQuestions';

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
    // Pick 5 random questions from our local bank
    const shuffled = [...BANGLADESH_QUESTIONS].sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);
    
    // Add artificial delay to simulate network/AI for a smoother UI feel
    await new Promise(resolve => setTimeout(resolve, 800));
    
    return selected;
  } catch (error) {
    console.error("Local question fetch failed:", error);
    return BANGLADESH_QUESTIONS.slice(0, 5);
  }
}
