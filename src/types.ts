export interface Question {
  question: string;
  correctAnswer: string;
  incorrectAnswers: string[];
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  allOptions?: string[]; // Shuffled options
}

export interface UserPreferences {
  categories: number[];
  difficulty: 'any' | 'easy' | 'medium' | 'hard';
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL: string;
  totalScore: number;
  currentStreak: number;
  bestStreak: number;
  lastPlayedDate: string; // YYYY-MM-DD
  createdAt: string;
  preferences?: UserPreferences;
  dailyAttempts?: number;
}

export interface QuizAttempt {
  userId: string;
  date: string;
  score: number;
  completedAt: string;
}

export interface DailyQuiz {
  date: string;
  questions: Question[];
}
