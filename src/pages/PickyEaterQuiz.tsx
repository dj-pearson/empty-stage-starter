import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from "@/lib/logger";
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
import { FAQSchema } from '@/components/schema/FAQSchema';
import { HowToSchema } from '@/components/schema/HowToSchema';
import { getAllPersonalityTypes } from '@/lib/quiz/personalityTypes';
import { QUIZ_PAGE } from '@/lib/tool-page-content';
import { Link } from 'react-router-dom';

export default function PickyEaterQuiz() {
  const { t } = useTranslation();
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
    logger.info('Analytics:', eventType, data);
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
      <FAQSchema faqs={QUIZ_PAGE.faqs} />
      <HowToSchema
        name={QUIZ_PAGE.howTo.name}
        description={QUIZ_PAGE.howTo.description}
        totalTime={QUIZ_PAGE.howTo.totalTime}
        steps={QUIZ_PAGE.howTo.steps}
      />

      <main id="main-content" className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
        <div className="container max-w-4xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-2">
              {t('pickyEaterQuiz.title')}
            </h1>
            <p className="text-lg text-muted-foreground">
              {t('pickyEaterQuiz.subtitle')}
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
                  <span className="text-sm font-medium text-muted-foreground">
                    Question {quizState.currentStep + 1} of {QUIZ_QUESTIONS.length}
                  </span>
                  <span className="text-sm font-medium text-muted-foreground">
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
                <p className="text-sm text-muted-foreground">
                  {isLastQuestion
                    ? 'Almost there! Click to see your personalized results.'
                    : 'Keep going! You\'re doing great.'}
                </p>
              </div>
            </>
          )}
        </div>

        {/*
          US-648: everything below is the reason this page exists in search rather than
          the reason it exists in the product.

          /picky-eater-quiz prerendered 106 words and ranked at position 10.8 on 1,754
          impressions, because an interactive form gives a crawler nothing to read and an
          assistant nothing to quote. The six eating patterns were the best writing on the
          site and were reachable only by finishing the quiz, so they are rendered here in
          full before anyone answers a question. Prose lives in src/lib/tool-page-content.ts.

          It renders while the intro is showing, which is the state the prerenderer
          snapshots and the state every first-time visitor lands in. Once the quiz starts
          it goes away, because a reference article underneath question three is noise.
        */}
        {showIntro && (
          <div className="container mx-auto max-w-3xl px-4 pb-16">
            <p className="border-l-2 border-primary pl-4 text-lg font-medium leading-relaxed">
              {QUIZ_PAGE.answer}
            </p>

            {QUIZ_PAGE.intro.map((paragraph) => (
              <p key={paragraph} className="mt-4 leading-relaxed text-muted-foreground">
                {paragraph}
              </p>
            ))}

            <h2 className="mt-12 font-heading text-2xl font-bold">
              The six eating patterns
            </h2>
            <p className="mt-2 text-muted-foreground">
              These are the possible results. The quiz works out which one fits; reading
              them first works too, and takes longer.
            </p>
            <div className="mt-6 space-y-8">
              {getAllPersonalityTypes().map((type) => (
                <section key={type.type}>
                  <h3 className="font-heading text-xl font-semibold text-primary">
                    <span aria-hidden="true">{type.icon}</span> {type.name}
                  </h3>
                  <p className="mt-1 font-medium">{type.shortDescription}</p>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {type.fullDescription}
                  </p>
                  <p className="mt-3 text-sm">
                    <strong className="font-semibold">Main difficulty: </strong>
                    {type.primaryChallenge}
                  </p>
                  <h4 className="mt-4 text-sm font-semibold uppercase text-muted-foreground">
                    What this looks like at the table
                  </h4>
                  <ul className="mt-2 space-y-1">
                    {type.commonBehaviors.map((behavior) => (
                      <li key={behavior} className="leading-relaxed">
                        {behavior}
                      </li>
                    ))}
                  </ul>
                  <h4 className="mt-4 text-sm font-semibold uppercase text-muted-foreground">
                    What helps
                  </h4>
                  <ul className="mt-2 space-y-1">
                    {type.parentingTips.map((tip) => (
                      <li key={tip} className="leading-relaxed text-muted-foreground">
                        {tip}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {/*
              "am i a picky eater quiz" and "are you a picky eater quiz" are adults asking
              about themselves. Every other word on this page is addressed to a parent
              about a child, so those searches currently land on something written for
              somebody else.
            */}
            <section className="mt-12 rounded-xl bg-primary/5 p-8">
              <h2 className="font-heading text-2xl font-bold">
                {QUIZ_PAGE.adultNote.heading}
              </h2>
              {QUIZ_PAGE.adultNote.body.map((paragraph) => (
                <p key={paragraph} className="mt-3 leading-relaxed">
                  {paragraph}
                </p>
              ))}
              <p className="mt-3">
                <Link to="/arfid/arfid-in-adults" className="font-semibold text-primary hover:underline">
                  More on ARFID in adults
                </Link>
              </p>
            </section>

            <h2 className="mt-12 font-heading text-2xl font-bold">
              {QUIZ_PAGE.howTo.name}
            </h2>
            <p className="mt-2 text-muted-foreground">{QUIZ_PAGE.howTo.description}</p>
            <ol className="mt-4 space-y-5">
              {QUIZ_PAGE.howTo.steps.map((step) => (
                <li key={step.name}>
                  <h3 className="font-semibold">{step.name}</h3>
                  <p className="mt-1 leading-relaxed text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>

            <h2 className="mt-12 font-heading text-2xl font-bold">Common questions</h2>
            <dl className="mt-4 space-y-5">
              {QUIZ_PAGE.faqs.map((faq) => (
                <div key={faq.question}>
                  <dt className="font-semibold">{faq.question}</dt>
                  <dd className="mt-1 leading-relaxed text-muted-foreground">{faq.answer}</dd>
                </div>
              ))}
            </dl>

            <nav className="mt-12" aria-label="Related reading">
              <h2 className="font-heading text-2xl font-bold">Related</h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                <li>
                  <Link to="/arfid/what-is-arfid" className="font-semibold text-primary hover:underline">
                    What is ARFID?
                  </Link>
                </li>
                <li>
                  <Link to="/arfid/arfid-vs-picky-eating" className="font-semibold text-primary hover:underline">
                    ARFID vs picky eating
                  </Link>
                </li>
                <li>
                  <Link to="/picky-eater/dinner-ideas" className="font-semibold text-primary hover:underline">
                    Dinner ideas for picky eaters
                  </Link>
                </li>
                <li>
                  <Link to="/budget-calculator" className="font-semibold text-primary hover:underline">
                    Grocery budget calculator
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
        )}
      </main>
    </>
  );
}
