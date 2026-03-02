import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QUIZ_QUESTIONS } from '@/lib/quiz/questions';
import { QuizAnswers, QuizState } from '@/types/quiz';
import { calculateCompletionPercentage } from '@/lib/quiz/scoring';
import { ChevronLeft, ChevronRight, Clock, Brain, Lightbulb, Apple } from 'lucide-react';
import { QuizQuestion } from '@/components/quiz/QuizQuestion';
import { v4 as uuidv4 } from 'uuid';
import { trackQuizStart, trackQuizComplete, trackPageView } from '@/lib/conversion-tracking';
import { SEOHead } from '@/components/SEOHead';
import { getPageSEO } from '@/lib/seo-config';

export default function PickyEaterQuiz() {
  const navigate = useNavigate();
  const [showIntro, setShowIntro] = useState(true);
  const [quizState, setQuizState] = useState<QuizState>({
    currentStep: 0,
    answers: {},
    sessionId: uuidv4(),
    startedAt: new Date(),
  });

  const currentQuestion = QUIZ_QUESTIONS[quizState.currentStep];
  const isLastQuestion = quizState.currentStep === QUIZ_QUESTIONS.length - 1;
  const progress = calculateCompletionPercentage(quizState.answers as Partial<QuizAnswers>);

  // Track quiz start
  useEffect(() => {
    trackQuizStart('picky_eater');
    trackPageView('/picky-eater-quiz', 'Picky Eater Quiz - EatPal');
    trackAnalyticsEvent('quiz_started');
  }, []);

  const trackAnalyticsEvent = (eventType: string, data?: Record<string, unknown>) => {
    // Legacy analytics tracking (for backward compatibility)
    console.log('Analytics:', eventType, data);
  };

  const handleAnswer = (questionId: string, answer: string | string[]) => {
    setQuizState(prev => ({
      ...prev,
      answers: {
        ...prev.answers,
        [questionId]: answer,
      },
    }));

    trackAnalyticsEvent('question_answered', {
      questionId,
      answer,
      step: quizState.currentStep + 1,
    });
  };

  const handleNext = () => {
    if (isLastQuestion) {
      // Calculate completion time
      const completionTime = Math.floor(
        (new Date().getTime() - quizState.startedAt.getTime()) / 1000
      );

      // Navigate to results page with state
      navigate('/picky-eater-quiz/results', {
        state: {
          answers: quizState.answers,
          sessionId: quizState.sessionId,
          completionTime,
        },
      });

      // Track completion in new funnel tracking system
      trackQuizComplete('picky_eater', 'completed');

      trackAnalyticsEvent('quiz_completed', {
        completionTime,
        totalQuestions: QUIZ_QUESTIONS.length,
      });
    } else {
      setQuizState(prev => ({
        ...prev,
        currentStep: prev.currentStep + 1,
      }));

      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (quizState.currentStep > 0) {
      setQuizState(prev => ({
        ...prev,
        currentStep: prev.currentStep - 1,
      }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const isCurrentQuestionAnswered = currentQuestion && (quizState.answers as any)[currentQuestion.id];

  return (
    <>
      <SEOHead {...getPageSEO("pickyEaterQuiz")!} />

      <main id="main-content" className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
        <div className="container max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              Picky Eater Food Personality Quiz
            </h1>
            <p className="text-lg text-gray-600 dark:text-gray-300">
              Discover your child's eating personality and get personalized strategies
            </p>
          </div>

          {showIntro ? (
            /* Intro Section */
            <div className="text-center space-y-6 max-w-lg mx-auto py-8">
              <h2 className="text-2xl font-bold">Discover Your Child's Eating Personality</h2>
              <p className="text-muted-foreground">Take this 2-minute quiz to understand your child's eating patterns and get personalized strategies.</p>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="bg-card border rounded-lg p-4">
                  <Clock className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="font-medium">2 minutes</p>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <Brain className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="font-medium">Personality type</p>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <Lightbulb className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="font-medium">Tailored strategies</p>
                </div>
                <div className="bg-card border rounded-lg p-4">
                  <Apple className="h-5 w-5 text-primary mx-auto mb-1" />
                  <p className="font-medium">Food suggestions</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Your answers are private and never shared.</p>
              <Button size="lg" onClick={() => setShowIntro(false)}>Start Quiz</Button>
            </div>
          ) : (
            <>
              {/* Progress Bar */}
              <div className="mb-8">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Question {quizState.currentStep + 1} of {QUIZ_QUESTIONS.length}
                  </span>
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {progress}% Complete
                  </span>
                </div>
                <Progress value={progress} className="h-3" />
              </div>

              {/* Question Card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={quizState.currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <Card className="shadow-xl">
                    <CardHeader>
                      <CardTitle className="text-2xl flex items-center gap-2">
                        <span className="text-3xl">{currentQuestion?.icon}</span>
                        {currentQuestion?.question}
                      </CardTitle>
                      {currentQuestion?.description && (
                        <CardDescription className="text-base">
                          {currentQuestion.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      {currentQuestion && (
                        <QuizQuestion
                          question={currentQuestion}
                          value={(quizState.answers as any)[currentQuestion.id]}
                          onChange={(value) => handleAnswer(currentQuestion.id, value)}
                        />
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              </AnimatePresence>

              {/* Navigation Buttons */}
              <div className="flex justify-between items-center mt-8">
                <Button
                  variant="outline"
                  onClick={handleBack}
                  disabled={quizState.currentStep === 0}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Back
                </Button>

                <Button
                  onClick={handleNext}
                  disabled={!isCurrentQuestionAnswered}
                  className="flex items-center gap-2 bg-primary hover:bg-primary/90"
                  size="lg"
                >
                  {isLastQuestion ? 'See My Results' : 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {/* Encouragement Text */}
              <div className="text-center mt-6">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {isLastQuestion
                    ? 'Almost there! Click to see your personalized results.'
                    : 'Keep going! You\'re doing great.'}
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
