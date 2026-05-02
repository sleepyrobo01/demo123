import React, { useState, useEffect, createContext, useContext } from 'react';
import { onAuthStateChanged, User, signInWithPopup, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, query, orderBy, limit } from 'firebase/firestore';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from './firebase';
import { UserProfile, Question } from './types';
import { Trophy, User as UserIcon, Play, BarChart3, LogOut, Loader2, Mail, Lock, Eye, EyeOff, ArrowRight, Settings as SettingsIcon, Check, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { fetchDailyQuestions, CATEGORIES } from './services/triviaService';
import { format } from 'date-fns';

// Custom hook to handle PWA installation
const usePWAInstall = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const installApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  return { isInstallable, installApp };
};

// Context for global state
interface AppContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAuthReady: boolean;
  setActiveTab: (tab: 'quiz' | 'leaderboard' | 'profile' | 'settings') => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        const errInfo = JSON.parse(this.state.error.message);
        message = `Firestore Error: ${errInfo.error} during ${errInfo.operationType}`;
      } catch (e) {
        message = this.state.error.message || message;
      }
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-red-50">
          <div className="bg-white p-6 rounded-xl shadow-xl max-w-md w-full border border-red-200">
            <h2 className="text-xl font-bold text-red-600 mb-2">Application Error</h2>
            <p className="text-gray-600 mb-4">{message}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [activeTab, setActiveTab] = useState<'quiz' | 'leaderboard' | 'profile' | 'settings'>('quiz');

  const [globalError, setGlobalError] = useState<any>(null);
  const { isInstallable, installApp } = usePWAInstall();

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      try {
        setUser(currentUser);
        setIsAuthReady(true);
        
        if (currentUser) {
          const userRef = doc(db, 'users', currentUser.uid);
          
          // Set up real-time profile listener
          unsubscribeProfile = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
              const currentProfile = docSnap.data() as UserProfile;
              setProfile(currentProfile);
              setLoading(false);
            } else {
              // Profile doesn't exist, create it
              const newProfile: UserProfile = {
                uid: currentUser.uid,
                displayName: currentUser.displayName || 'Anonymous',
                email: currentUser.email || '',
                photoURL: currentUser.photoURL || '',
                totalScore: 0,
                currentStreak: 0,
                bestStreak: 0,
                lastPlayedDate: '',
                createdAt: new Date().toISOString(),
                dailyAttempts: 0,
              };
              
              setDoc(userRef, newProfile).catch(err => 
                handleFirestoreError(err, OperationType.WRITE, `users/${currentUser.uid}`)
              );
              
              setDoc(doc(db, 'profiles', currentUser.uid), {
                uid: currentUser.uid,
                displayName: newProfile.displayName,
                photoURL: newProfile.photoURL,
                totalScore: 0,
                currentStreak: 0
              }).catch(err => 
                handleFirestoreError(err, OperationType.WRITE, `profiles/${currentUser.uid}`)
              );
            }
          }, (error) => {
            handleFirestoreError(error, OperationType.GET, `users/${currentUser.uid}`);
          });

        } else {
          setProfile(null);
          setLoading(false);
          if (unsubscribeProfile) {
            unsubscribeProfile();
            unsubscribeProfile = null;
          }
        }
      } catch (error) {
        console.error('Auth state change error:', error);
        setGlobalError(error);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  if (globalError) throw globalError;

  if (loading && !isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AppContext.Provider value={{ user, profile, loading, isAuthReady, setActiveTab }}>
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100">
          {!user ? (
            <LoginView />
          ) : (
            <div className="max-w-md mx-auto min-h-screen flex flex-col relative pb-20">
              <header className="p-4 flex justify-between items-center bg-white border-b border-slate-200 sticky top-0 z-10">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center text-white font-bold">BD</div>
                  <h1 className="font-bold text-lg tracking-tight">BangladeshTrivia</h1>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-orange-50 text-orange-700 px-2 py-1 rounded-full text-xs font-bold border border-orange-100">
                    🔥 {profile?.currentStreak || 0}
                  </div>
                  <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-red-500 transition-colors">
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              </header>

              {isInstallable && (
                <div className="bg-indigo-600 p-3 flex justify-between items-center text-white sticky top-[65px] z-10 shadow-lg">
                  <div className="flex items-center gap-2">
                    <Download className="w-5 h-5" />
                    <div>
                      <p className="text-sm font-bold leading-none">Install App</p>
                      <p className="text-[10px] opacity-80">Add to home screen for the best experience</p>
                    </div>
                  </div>
                  <button 
                    onClick={installApp}
                    className="bg-white text-indigo-600 px-3 py-1 rounded-full text-xs font-bold shadow-sm hover:bg-slate-100 transition-colors"
                  >
                    Install
                  </button>
                </div>
              )}

              <main className="flex-1 p-4">
                <AnimatePresence mode="wait">
                  {activeTab === 'quiz' && <QuizView key="quiz" />}
                  {activeTab === 'leaderboard' && <LeaderboardView key="leaderboard" />}
                  {activeTab === 'profile' && <ProfileView key="profile" />}
                  {activeTab === 'settings' && <SettingsView key="settings" />}
                </AnimatePresence>
              </main>

              <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-2 flex justify-around items-center max-w-md mx-auto z-20">
                <NavButton 
                  active={activeTab === 'quiz'} 
                  onClick={() => setActiveTab('quiz')} 
                  icon={<Play className="w-5 h-5" />} 
                  label="Play" 
                />
                <NavButton 
                  active={activeTab === 'leaderboard'} 
                  onClick={() => setActiveTab('leaderboard')} 
                  icon={<Trophy className="w-5 h-5" />} 
                  label="Ranks" 
                />
                <NavButton 
                  active={activeTab === 'profile'} 
                  onClick={() => setActiveTab('profile')} 
                  icon={<UserIcon className="w-5 h-5" />} 
                  label="Profile" 
                />
                <NavButton 
                  active={activeTab === 'settings'} 
                  onClick={() => setActiveTab('settings')} 
                  icon={<SettingsIcon className="w-5 h-5" />} 
                  label="Settings" 
                />
              </nav>
            </div>
          )}
        </div>
      </AppContext.Provider>
    </ErrorBoundary>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl transition-all ${active ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-slate-600'}`}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}

function LoginView() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setIsSubmitting(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Google login error:', error);
      setAuthError(`Failed to sign in with Google: ${error.code || error.message}. Check the Authorized Domains in Firebase Settings.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (displayName) {
          await updateProfile(userCredential.user, { displayName });
        }
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error: any) {
      console.error('Auth error:', error);
      let message = 'An error occurred during authentication.';
      if (error.code === 'auth/email-already-in-use') message = 'This email is already registered.';
      if (error.code === 'auth/invalid-credential') message = 'Invalid email or password.';
      if (error.code === 'auth/weak-password') message = 'Password should be at least 6 characters.';
      if (error.code === 'auth/invalid-email') message = 'Invalid email address.';
      setAuthError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-indigo-600 to-indigo-800 text-white overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm space-y-8 py-8"
      >
        <div className="text-center space-y-4">
          <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-3xl flex items-center justify-center mx-auto border border-white/20 shadow-2xl">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <div className="space-y-1">
            <h1 className="text-4xl font-black tracking-tighter">TriviaDaily</h1>
            <p className="text-indigo-100 text-sm font-medium opacity-80">
              {isRegistering ? 'Create your account' : 'Welcome back!'}
            </p>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-lg p-6 rounded-3xl border border-white/20 shadow-xl space-y-6">
          <form onSubmit={handleEmailAuth} className="space-y-4">
            {isRegistering && (
              <div className="space-y-1">
                <label className="text-xs font-bold text-indigo-200 uppercase tracking-wider ml-1">Name</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-300" />
                  <input 
                    type="text" 
                    placeholder="Your name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 pl-11 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all"
                    required={isRegistering}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-bold text-indigo-200 uppercase tracking-wider ml-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-300" />
                <input 
                  type="email" 
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 pl-11 pr-4 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-indigo-200 uppercase tracking-wider ml-1">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-indigo-300" />
                <input 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white/10 border border-white/20 rounded-2xl py-3 pl-11 pr-12 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all"
                  required
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-300 hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <motion.p 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="text-xs font-bold text-red-300 bg-red-500/20 p-3 rounded-xl border border-red-500/30"
              >
                {authError}
              </motion.p>
            )}

            <button 
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-white text-indigo-900 py-4 rounded-2xl font-bold text-lg shadow-xl hover:bg-indigo-50 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
            >
              {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : (isRegistering ? 'Create Account' : 'Sign In')}
              {!isSubmitting && <ArrowRight className="w-5 h-5" />}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
            <div className="relative flex justify-center text-xs uppercase tracking-widest"><span className="bg-transparent px-2 text-indigo-200 font-bold">Or continue with</span></div>
          </div>

          <button 
            onClick={handleGoogleLogin}
            className="w-full bg-white/10 border border-white/20 text-white py-4 px-6 rounded-2xl font-bold text-lg shadow-xl hover:bg-white/20 transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-6 h-6" alt="Google" />
            Google
          </button>
        </div>

        <div className="text-center">
          <button 
            onClick={() => {
              setIsRegistering(!isRegistering);
              setAuthError(null);
            }}
            className="text-indigo-100 text-sm font-bold hover:text-white transition-colors"
          >
            {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
          </button>
        </div>
        
        <p className="text-[10px] text-center text-indigo-200/40 font-bold uppercase tracking-widest">
          By continuing, you agree to our Terms of Service.
        </p>
      </motion.div>
    </div>
  );
}

// --- Sub-Views ---

function QuizView() {
  const { profile, user, setActiveTab } = useApp();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [gameState, setGameState] = useState<'start' | 'playing' | 'feedback' | 'finished' | 'already_played'>('start');
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const today = format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (gameState === 'start' && profile?.lastPlayedDate === today && (profile?.dailyAttempts || 0) >= 3) {
      setGameState('already_played');
    }
  }, [profile, today, gameState]);

  const startQuiz = async () => {
    setLoading(true);
    try {
      // Try to fetch today's quiz from Firestore first
      const quizRef = doc(db, 'quizzes', today);
      let quizSnap;
      try {
        quizSnap = await getDoc(quizRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `quizzes/${today}`);
        return;
      }
      
      let quizData: Question[];
      if (quizSnap.exists() && !profile?.preferences) {
        quizData = quizSnap.data().questions;
      } else {
        quizData = await fetchDailyQuestions(profile?.preferences);
        if (!quizData || quizData.length === 0) {
          throw new Error('Failed to fetch trivia questions. Please check your internet connection and try again.');
        }
        // Only save to global quizzes if it's the default quiz
        if (!profile?.preferences) {
          try {
            await setDoc(quizRef, { date: today, questions: quizData });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, `quizzes/${today}`);
          }
        }
      }

      // Ensure we have exactly 5 questions
      if (quizData.length < 5) {
        const extra = await fetchDailyQuestions();
        quizData = [...quizData, ...extra].slice(0, 5);
      }

      // Shuffle options for each question
      const shuffled = quizData.map(q => ({
        ...q,
        allOptions: [...q.incorrectAnswers, q.correctAnswer].sort(() => Math.random() - 0.5)
      }));

      setQuestions(shuffled);
      setCurrentIndex(0);
      setScore(0);
      setSelectedAnswer(null);
      setIsCorrect(null);
      setGameState('playing');
    } catch (error: any) {
      console.error(error);
      alert(`Could not load quiz: ${error.message || 'Unknown error'}. Please check if your GEMINI_API_KEY is correctly set in Netlify site settings.`);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (answer: string) => {
    if (selectedAnswer) return;
    setSelectedAnswer(answer);
    const correct = answer === questions[currentIndex].correctAnswer;
    setIsCorrect(correct);
    if (correct) setScore(s => s + 1);
    setGameState('feedback');
  };

  const nextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setIsCorrect(null);
      setGameState('playing');
    } else {
      finishQuiz();
    }
  };

  const finishQuiz = async () => {
    setGameState('finished');
    if (!profile || !user) return;

    const newTotalScore = (profile.totalScore || 0) + score;
    const today = format(new Date(), 'yyyy-MM-dd');
    const isNewDay = profile.lastPlayedDate !== today;
    
    // Streak logic: check if last played was yesterday
    const yesterday = format(new Date(Date.now() - 86400000), 'yyyy-MM-dd');
    let newStreak = profile.currentStreak || 0;
    
    if (isNewDay) {
      if (profile.lastPlayedDate === yesterday) {
        newStreak += 1;
      } else {
        newStreak = 1;
      }
    }
    
    const newBestStreak = Math.max(profile.bestStreak || 0, newStreak);
    const newAttempts = isNewDay ? 1 : (profile.dailyAttempts || 0) + 1;

    try {
      // Save attempt with unique ID
      const attemptId = `${user.uid}_${today}_${Date.now()}`;
      await setDoc(doc(db, 'attempts', attemptId), {
        userId: user.uid,
        date: today,
        score,
        completedAt: new Date().toISOString()
      });

      // Update private user profile
      await setDoc(doc(db, 'users', user.uid), {
        ...profile,
        totalScore: newTotalScore,
        currentStreak: newStreak,
        bestStreak: newBestStreak,
        lastPlayedDate: today,
        dailyAttempts: newAttempts
      });

      // Update public profile
      await setDoc(doc(db, 'profiles', user.uid), {
        uid: user.uid,
        displayName: profile.displayName,
        photoURL: profile.photoURL,
        totalScore: newTotalScore,
        currentStreak: newStreak
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attempts/${user.uid}_${today}`);
    }
  };

  if (gameState === 'already_played') {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-6 py-12">
        <div className="w-24 h-24 bg-indigo-100 rounded-full flex items-center justify-center mx-auto text-indigo-600">
          <Play className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-tight">Daily Limit Reached!</h2>
          <p className="text-slate-500 font-medium">
            You've played 3 times today. Come back tomorrow for a new challenge!
          </p>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-1">Today's Streak</p>
          <p className="text-4xl font-black text-orange-500">🔥 {profile?.currentStreak || 0}</p>
        </div>
      </motion.div>
    );
  }

  if (gameState === 'start') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 space-y-8">
        <div className="bg-green-600 rounded-3xl p-8 text-white shadow-xl shadow-green-200 relative overflow-hidden">
          <div className="relative z-10 space-y-4">
            <h2 className="text-3xl font-black leading-tight">Bangladesh Challenge</h2>
            <p className="text-green-50 font-medium opacity-90">Test your knowledge with 5 questions about Bangladesh. Show us what you know!</p>
            <button 
              onClick={startQuiz}
              disabled={loading}
              className="w-full bg-white text-green-700 py-4 rounded-2xl font-bold text-lg shadow-lg hover:bg-green-50 transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Start Quiz'}
            </button>
          </div>
          <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -left-10 -top-10 w-32 h-32 bg-red-500/20 rounded-full blur-2xl" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Points</p>
            <p className="text-2xl font-black text-green-600">{profile?.totalScore || 0}</p>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Best Streak</p>
            <p className="text-2xl font-black text-orange-500">{profile?.bestStreak || 0}d</p>
          </div>
        </div>
      </motion.div>
    );
  }

  if (gameState === 'finished') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 py-4">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 text-center space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
          
          <div className="space-y-2">
            <span className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em]">Quiz Complete</span>
            <h2 className="text-4xl font-black tracking-tighter">Great Job!</h2>
          </div>

          <div className="flex justify-center gap-4">
            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex-1">
              <div className="text-3xl font-black text-indigo-600">{score}/5</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Score</div>
            </div>
            <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 flex-1">
              <div className="text-3xl font-black text-indigo-600">+{score * 10}</div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Points</div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex justify-between text-xs font-black text-slate-400 uppercase tracking-wider">
              <span>Streak Progress</span>
              <span className="text-orange-600">🔥 {profile?.currentStreak || 0} Days</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(((profile?.currentStreak || 0) / 10) * 100, 100)}%` }}
                className="h-full bg-orange-500 rounded-full"
              />
            </div>
          </div>

          <div className="pt-4 space-y-3">
            {(profile?.dailyAttempts || 0) < 3 ? (
              <button 
                onClick={() => {
                  setGameState('start');
                  startQuiz();
                }}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                Play Again ({(profile?.dailyAttempts || 0)}/3)
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <p className="text-slate-400 text-xs font-bold italic">Daily limit reached (3/3)</p>
            )}
            
            <button 
              onClick={() => setActiveTab('leaderboard')}
              className="w-full bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold text-lg hover:bg-slate-200 transition-all active:scale-95"
            >
              View Ranks
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  const currentQ = questions[currentIndex];

  if (!currentQ) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        <p className="text-slate-500 font-medium">Loading questions...</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 py-4">
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Question {currentIndex + 1} of {questions.length}</span>
          <span className="text-xs font-bold bg-indigo-100 text-indigo-600 px-2 py-1 rounded-lg">{currentQ.category}</span>
        </div>
        
        {/* Progress Bar */}
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${((currentIndex + (gameState === 'feedback' ? 1 : 0)) / questions.length) * 100}%` }}
            className="h-full bg-indigo-600 transition-all duration-500"
          />
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm min-h-[160px] flex items-center justify-center text-center">
        <h3 className="text-xl font-bold leading-snug">{currentQ.question}</h3>
      </div>

      <div className="space-y-3">
        {currentQ.allOptions?.map((option, idx) => {
          const isSelected = selectedAnswer === option;
          const isCorrectOption = option === currentQ.correctAnswer;
          let btnClass = "w-full p-4 rounded-2xl text-left font-bold transition-all border-2 flex justify-between items-center ";
          
          if (!selectedAnswer) {
            btnClass += "bg-white border-slate-100 hover:border-indigo-600 hover:bg-indigo-50 active:scale-[0.98]";
          } else if (isCorrectOption) {
            btnClass += "bg-green-50 border-green-500 text-green-700";
          } else if (isSelected && !isCorrectOption) {
            btnClass += "bg-red-50 border-red-500 text-red-700";
          } else {
            btnClass += "bg-white border-slate-100 opacity-50";
          }

          return (
            <button 
              key={idx} 
              onClick={() => handleAnswer(option)}
              disabled={!!selectedAnswer}
              className={btnClass}
            >
              <span>{option}</span>
              {selectedAnswer && isCorrectOption && <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white text-xs">✓</div>}
              {selectedAnswer && isSelected && !isCorrectOption && <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs">✕</div>}
            </button>
          );
        })}
      </div>

      <AnimatePresence>
        {gameState === 'feedback' && (
          <motion.div 
            initial={{ y: 20, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 20, opacity: 0 }}
            className="pt-4"
          >
            <button 
              onClick={nextQuestion}
              className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              {currentIndex === questions.length - 1 ? 'See Results' : 'Next Question'}
              <ArrowRight className="w-5 h-5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SettingsView() {
  const { profile, user } = useApp();
  const [selectedCategories, setSelectedCategories] = useState<number[]>(profile?.preferences?.categories || []);
  const [difficulty, setDifficulty] = useState<'any' | 'easy' | 'medium' | 'hard'>(profile?.preferences?.difficulty || 'any');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const toggleCategory = (id: number) => {
    setSelectedCategories(prev => 
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const saveSettings = async () => {
    if (!user || !profile) return;
    setIsSaving(true);
    try {
      const updatedProfile = {
        ...profile,
        preferences: {
          categories: selectedCategories,
          difficulty
        }
      };
      await setDoc(doc(db, 'users', user.uid), updatedProfile);
      // We don't necessarily need to update the public profile with preferences
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 py-4 pb-12">
      <div className="space-y-1">
        <h2 className="text-2xl font-black tracking-tighter">Quiz Settings</h2>
        <p className="text-slate-500 text-sm font-medium">Personalize your daily trivia experience.</p>
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="space-y-3">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Difficulty</label>
          <div className="grid grid-cols-2 gap-2">
            {(['any', 'easy', 'medium', 'hard'] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`py-3 px-4 rounded-xl font-bold text-sm border-2 transition-all ${
                  difficulty === d 
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' 
                    : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-100'
                }`}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest">Categories</label>
          <p className="text-[10px] text-slate-400 font-medium italic">If none selected, we'll pick for you.</p>
          <div className="grid grid-cols-1 gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={`flex items-center justify-between p-4 rounded-2xl font-bold text-sm border-2 transition-all ${
                  selectedCategories.includes(cat.id)
                    ? 'bg-indigo-50 border-indigo-600 text-indigo-700'
                    : 'bg-white border-slate-100 text-slate-600 hover:border-indigo-100'
                }`}
              >
                <span>{cat.name}</span>
                {selectedCategories.includes(cat.id) && <Check className="w-4 h-4" />}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={saveSettings}
          disabled={isSaving}
          className={`w-full py-4 rounded-2xl font-bold text-lg shadow-xl transition-all flex items-center justify-center gap-2 ${
            saveSuccess 
              ? 'bg-emerald-500 text-white' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'
          }`}
        >
          {isSaving ? <Loader2 className="w-6 h-6 animate-spin" /> : saveSuccess ? <><Check className="w-6 h-6" /> Saved!</> : 'Save Preferences'}
        </button>
      </div>
    </motion.div>
  );
}

function LeaderboardView() {
  const [leaders, setLeaders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'profiles'), orderBy('totalScore', 'desc'), limit(10));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data());
      setLeaders(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'profiles');
    });

    return () => unsubscribe();
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 py-4">
      <div className="space-y-1">
        <h2 className="text-2xl font-black tracking-tighter">Global Ranks</h2>
        <p className="text-slate-500 text-sm font-medium">Top 10 trivia masters worldwide.</p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {leaders.map((leader, idx) => (
              <div key={leader.uid} className="flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${
                  idx === 0 ? 'bg-yellow-100 text-yellow-700' : 
                  idx === 1 ? 'bg-slate-200 text-slate-700' : 
                  idx === 2 ? 'bg-orange-100 text-orange-700' : 'text-slate-400'
                }`}>
                  {idx + 1}
                </div>
                <img 
                  src={leader.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${leader.uid}`} 
                  className="w-10 h-10 rounded-xl bg-slate-100" 
                  alt={leader.displayName}
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold truncate">{leader.displayName}</p>
                  <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest">🔥 {leader.currentStreak}d Streak</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-indigo-600">{leader.totalScore}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Points</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ProfileView() {
  const { profile } = useApp();

  if (!profile) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 py-4">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
        <div className="relative inline-block">
          <img 
            src={profile.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile.uid}`} 
            className="w-24 h-24 rounded-3xl mx-auto bg-slate-100 shadow-lg" 
            alt={profile.displayName}
            referrerPolicy="no-referrer"
          />
          <div className="absolute -bottom-2 -right-2 bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center border-4 border-white font-bold text-xs">
            {profile.currentStreak}
          </div>
        </div>
        <div className="space-y-1">
          <h2 className="text-2xl font-black tracking-tighter">{profile.displayName}</h2>
          <p className="text-slate-400 text-sm font-medium">{profile.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Total Score" value={profile.totalScore} color="text-indigo-600" />
        <StatCard label="Current Streak" value={`${profile.currentStreak}d`} color="text-orange-500" />
        <StatCard label="Best Streak" value={`${profile.bestStreak}d`} color="text-emerald-500" />
        <StatCard label="Joined" value={format(new Date(profile.createdAt), 'MMM yyyy')} color="text-slate-600" />
      </div>

      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-400 text-xs uppercase tracking-widest">Achievements</h3>
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
          <Badge active={profile.totalScore >= 100} label="Centurion" icon="💯" />
          <Badge active={profile.bestStreak >= 7} label="Week Warrior" icon="📅" />
          <Badge active={profile.bestStreak >= 30} label="Monthly Master" icon="👑" />
          <Badge active={profile.totalScore >= 1000} label="Trivia Legend" icon="🌟" />
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, color }: { label: string, value: string | number, color: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
    </div>
  );
}

function Badge({ active, label, icon }: { active: boolean, label: string, icon: string }) {
  return (
    <div className={`flex flex-col items-center gap-2 min-w-[80px] ${active ? 'opacity-100' : 'opacity-20 grayscale'}`}>
      <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl shadow-inner border border-slate-100">
        {icon}
      </div>
      <span className="text-[10px] font-bold text-center leading-tight">{label}</span>
    </div>
  );
}
