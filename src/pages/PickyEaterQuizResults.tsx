// @ts-nocheck
import { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { QuizAnswers, QuizResult } from '@/types/quiz';
import { generateQuizResults, calculatePersonalityScores, determinePersonalityTypes } from '@/lib/quiz/scoring';
import { getPersonalityType } from '@/lib/quiz/personalityTypes';
import { PersonalityChart } from '@/components/quiz/PersonalityChart';
import { FoodRecommendationsDisplay } from '@/components/quiz/FoodRecommendationsDisplay';
import { StrategyCards } from '@/components/quiz/StrategyCards';
import { SampleMealsCarousel } from '@/components/quiz/SampleMealsCarousel';
import { ProgressPathway } from '@/components/quiz/ProgressPathway';
import { EmailCaptureModal } from '@/components/quiz/EmailCaptureModal';
import { ShareButtons } from '@/components/quiz/ShareButtons';
import { downloadPDFReport } from '@/lib/quiz/pdfGenerator';
import { saveQuizResponse, trackQuizAnalytics, trackPDFDownload } from '@/lib/quiz/supabaseIntegration';
import { getSyncStorage } from '@/lib/platform';
import { Download, Share2, Sparkles, TrendingUp, Loader2, Lock, Gift } from 'lucide-react';

export default function PickyEaterQuizResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const [results, setResults] = useState<QuizResult | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [quizResponseId, setQuizResponseId] = useState<string | null>(null);
  const [childName, setChildName] = useState<string>('');
  const [parentName, setParentName] = useState<string>('');
  const [isDownloadingPDF, setIsDownloadingPDF] = useState(false);
  const [showUnlockPrompt, setShowUnlockPrompt] = useState(false);

  // Use platform-safe storage for cross-platform compatibility
  const storage = useMemo(() => getSyncStorage(), []);

  // Check if user has already provided email (stored in storage)
  useEffect(() => {
    const savedEmail = storage.getItem('quiz_email_captured');
    if (savedEmail) {
      setEmailCaptured(true);
    }
  }, [storage]);

  useEffect(() => {
    const state = location.state as {
      answers: Partial<QuizAnswers>;
      sessionId: string;
      completionTime: number;
    };

    if (!state || !state.answers) {
      // Redirect back to quiz if no state
      navigate('/picky-eater-quiz');
      return;
    }

    // Generate results
    const quizResults = generateQuizResults(state.answers);
    setResults(quizResults);

    // Celebrate with confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });

    // Save to database
    (async () => {
      try {
        const scores = calculatePersonalityScores(state.answers);
        const { primary, secondary } = determinePersonalityTypes(scores);

        const scoresObj = scores.reduce((acc, score) => {
          acc[score.type] = score.score;
          return acc;
        }, {} as Record<string, number>);

        const responseId = await saveQuizResponse(
          state.sessionId,
          state.answers,
          primary,
          secondary,
          scoresObj as any,
          state.completionTime
        );

        setQuizResponseId(responseId);

        // Track results viewed
        await trackQuizAnalytics({
          sessionId: state.sessionId,
          quizResponseId: responseId,
          eventType: 'results_viewed',
          eventData: {
            personalityType: primary,
            completionTime: state.completionTime,
          },
        });
      } catch (error) {
        console.error('Error saving quiz response:', error);
        toast.error('Unable to save your results to our database. Your results are still displayed below.');
      }
    })();
  }, [location.state, navigate]);

  const handleDownloadPDF = async () => {
    if (!results) return;

    if (!emailCaptured) {
      setShowEmailModal(true);
      return;
    }

    try {
      setIsDownloadingPDF(true);

      await downloadPDFReport(results, {
        childName: childName || undefined,
        parentName: parentName || undefined,
        includeProgressPath: true,
        includeMealIdeas: true,
      });

      // Track PDF download
      if (quizResponseId) {
        await trackPDFDownload(quizResponseId);
      }

      toast.success('PDF downloaded successfully!');
    } catch (error) {
      console.error('Error downloading PDF:', error);
      toast.error('Failed to download PDF. Please try again.');
    } finally {
      setIsDownloadingPDF(false);
    }
  };

  const handleShare = () => {
    // ShareButtons component handles the actual sharing
    toast.info('Choose a platform to share your results!');
  };

  const handleEmailCaptured = (email: string, child: string, parent: string) => {
    setEmailCaptured(true);
    setChildName(child);
    setParentName(parent);
    setShowEmailModal(false);
    setShowUnlockPrompt(false);
    // Save to storage so returning users don't see gate again
    storage.setItem('quiz_email_captured', 'true');
    toast.success('Email saved! Here are your full results.');
  };

  const handleUnlockResults = () => {
    setShowEmailModal(true);
    setShowUnlockPrompt(false);
  };

  if (!results) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Generating your personalized results...</p>
        </div>
      </div>
    );
  }

  const personalityDef = getPersonalityType(results.profile.primaryType);

  return (
    <>
      <Helmet>
        <title>Your Child is {personalityDef.name}! - Picky Eater Quiz Results</title>
        <meta
          name="description"
          content={`Your child's eating personality: ${personalityDef.name}. Get personalized strategies and meal plans.`}
        />
      </Helmet>

      <div id="main-content" className="min-h-screen bg-gradient-to-b from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="container max-w-6xl mx-auto px-4 py-12">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Your Results Are Ready!</span>
            </div>

            <h1 className="text-5xl md:text-6xl font-bold mb-4">
              <span className="text-6xl md:text-7xl block mb-2">{personalityDef.icon}</span>
              {personalityDef.name}
            </h1>

            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-6">
              {personalityDef.shortDescription}
            </p>

            <div className="flex flex-wrap justify-center gap-3 mb-8">
              <Button
                size="lg"
                onClick={handleDownloadPDF}
                className="gap-2"
                disabled={isDownloadingPDF}
              >
                {isDownloadingPDF ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating PDF...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Download Full Report (PDF)
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={handleShare}
                className="gap-2"
              >
                <Share2 className="w-4 h-4" />
                Share Results
              </Button>
            </div>

            <ShareButtons
              personalityType={results.profile.primaryType}
              quizResponseId={quizResponseId}
              childName={childName || undefined}
            />
          </motion.div>

          {/* Personality Overview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Card className="mb-8 shadow-xl" style={{ borderColor: personalityDef.color }}>
              <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
                <CardTitle className="text-2xl">Understanding Your Child</CardTitle>
                <CardDescription>What this personality type means</CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <p className="text-lg mb-6">{personalityDef.fullDescription}</p>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <Badge variant="destructive">Primary Challenge</Badge>
                    </h3>
                    <p className="text-gray-700 dark:text-gray-300">
                      {personalityDef.primaryChallenge}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3">
                      <Badge variant="default">Strengths</Badge>
                    </h3>
                    <ul className="space-y-2">
                      {personalityDef.strengths.slice(0, 3).map((strength, i) => (
                        <li key={i} className="flex items-start gap-2">
                          <span className="text-green-500 mt-1">✓</span>
                          <span className="text-gray-700 dark:text-gray-300">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Personality Score Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-8"
          >
            <PersonalityChart scores={results.profile.scores} />
          </motion.div>

          {/* Gated Content Section */}
          {emailCaptured ? (
            <>
              {/* Food Recommendations */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="mb-8"
              >
                <FoodRecommendationsDisplay recommendations={results.recommendations} />
              </motion.div>

              {/* Strategies */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="mb-8"
              >
                <StrategyCards strategies={results.strategies} />
              </motion.div>

              {/* Sample Meals */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="mb-8"
              >
                <SampleMealsCarousel meals={results.sampleMeals} />
              </motion.div>

              {/* Progress Pathway */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.6 }}
                className="mb-8"
              >
                <ProgressPathway pathway={results.progressPathway} />
              </motion.div>
            </>
          ) : (
            /* Email Gate - Show blurred preview with unlock prompt */
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mb-8 relative"
            >
              {/* Blurred Preview */}
              <div className="relative">
                <div className="filter blur-sm pointer-events-none opacity-60">
                  <div className="grid md:grid-cols-2 gap-4 mb-4">
                    <Card className="p-6">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
                      <div className="space-y-2">
                        <div className="h-3 bg-gray-100 rounded w-full" />
                        <div className="h-3 bg-gray-100 rounded w-5/6" />
                        <div className="h-3 bg-gray-100 rounded w-4/6" />
                      </div>
                    </Card>
                    <Card className="p-6">
                      <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
                      <div className="space-y-2">
                        <div className="h-3 bg-gray-100 rounded w-full" />
                        <div className="h-3 bg-gray-100 rounded w-5/6" />
                        <div className="h-3 bg-gray-100 rounded w-4/6" />
                      </div>
                    </Card>
                  </div>
                  <Card className="p-6">
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
                    <div className="grid grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-32 bg-gray-100 rounded" />
                      ))}
                    </div>
                  </Card>
                </div>

                {/* Unlock Overlay */}
                <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-background via-background/80 to-transparent">
                  <Card className="max-w-md mx-4 shadow-2xl border-2 border-primary/20">
                    <CardContent className="pt-6 text-center">
                      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                        <Gift className="w-8 h-8 text-primary" />
                      </div>
                      <h3 className="text-2xl font-bold mb-2">
                        Unlock Your Full Strategy Guide
                      </h3>
                      <p className="text-muted-foreground mb-6">
                        Get personalized food recommendations, proven strategies,
                        sample meal plans, and a 12-week progress pathway tailored
                        to your {personalityDef.name} child.
                      </p>

                      <div className="space-y-3 text-left mb-6">
                        {[
                          '15+ personalized food recommendations',
                          '5 proven strategies for ' + personalityDef.name + ' eaters',
                          'Sample meals your child will love',
                          '12-week progress pathway',
                        ].map((item, i) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                              <span className="text-green-600 text-xs">✓</span>
                            </div>
                            <span>{item}</span>
                          </div>
                        ))}
                      </div>

                      <Button
                        size="lg"
                        className="w-full gap-2"
                        onClick={handleUnlockResults}
                      >
                        <Lock className="w-4 h-4" />
                        Unlock Free Results
                      </Button>

                      <p className="text-xs text-muted-foreground mt-3">
                        Just enter your email. No spam, unsubscribe anytime.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </motion.div>
          )}

          <Separator className="my-12" />

          {/* CTA Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <Card className="bg-gradient-to-br from-primary/10 to-purple-100 dark:from-primary/20 dark:to-purple-900 border-primary/20 shadow-2xl">
              <CardHeader className="text-center pb-4">
                <CardTitle className="text-3xl mb-2">
                  Ready for Stress-Free Mealtimes?
                </CardTitle>
                <CardDescription className="text-lg">
                  TryEatPal creates personalized meal plans specifically for {personalityDef.name} kids
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="grid md:grid-cols-3 gap-6 mb-8">
                  <div className="p-4">
                    <div className="text-4xl mb-2">📅</div>
                    <h4 className="font-semibold mb-1">Weekly Meal Plans</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Personalized to your child's eating personality
                    </p>
                  </div>
                  <div className="p-4">
                    <div className="text-4xl mb-2">🛒</div>
                    <h4 className="font-semibold mb-1">Smart Grocery Lists</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Organized by aisle, nothing wasted
                    </p>
                  </div>
                  <div className="p-4">
                    <div className="text-4xl mb-2">📊</div>
                    <h4 className="font-semibold mb-1">Progress Tracking</h4>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      See your child's eating journey evolve
                    </p>
                  </div>
                </div>

                <Button size="lg" className="text-lg px-8 py-6" onClick={() => navigate('/pricing')}>
                  <TrendingUp className="w-5 h-5 mr-2" />
                  Start Your $1 Trial Today
                </Button>

                <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
                  Risk-free • Cancel anytime • Join 3,142 parents succeeding at mealtimes
                </p>
              </CardContent>
            </Card>
          </motion.div>

          {/* Retake Quiz Link */}
          <div className="text-center mt-8">
            <Button
              variant="ghost"
              onClick={() => navigate('/picky-eater-quiz')}
            >
              Take Quiz Again for Another Child
            </Button>
          </div>
        </div>
      </div>

      {/* Email Capture Modal */}
      <EmailCaptureModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        personalityType={results.profile.primaryType}
        quizResponseId={quizResponseId}
        onEmailCaptured={handleEmailCaptured}
      />
    </>
  );
}
