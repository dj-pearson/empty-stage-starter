import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QUIZ_QUESTIONS } from '@/lib/quiz/questions';
import { QuizAnswers, QuizState } from '@/types/quiz';
import { calculateCompletionPercentage } from '@/lib/quiz/scoring';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { QuizQuestion } from '@/components/quiz/QuizQuestion';
import { v4 as uuidv4 } from 'uuid';

export default function PickyEaterQuiz() {
  const navigate = useNavigate();
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
    // Track analytics event: quiz_started
    trackAnalyticsEvent('quiz_started');
  }, []);

  const trackAnalyticsEvent = (eventType: string, data?: Record<string, unknown>) => {
    // Analytics tracking would go here
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
      <Helmet>
        <title>Free Picky Eater Quiz - Discover Your Child's Food Personality | TryEatPal</title>
        <meta
          name="description"
          content="Take our 2-minute quiz to understand why your child refuses food and get a personalized feeding strategy. Free results + meal plan for picky eaters."
        />
        <meta name="keywords" content="picky eater quiz, food personality quiz for kids, picky eater assessment, child eating personality" />
        <meta property="og:title" content="Free Picky Eater Quiz - Discover Your Child's Food Personality" />
        <meta property="og:description" content="Take our 2-minute quiz to understand why your child refuses food and get a personalized feeding strategy." />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
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
                ? '🎉 Almost there! Click to see your personalized results.'
                : '✨ Keep going! You\'re doing great.'}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
