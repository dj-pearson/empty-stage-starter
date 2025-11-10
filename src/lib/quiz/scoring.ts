/**
 * Picky Eater Quiz Scoring Algorithm
 * Calculates personality type based on weighted answers
 */

import {
  QuizAnswers,
  PersonalityType,
  PersonalityScore,
  PersonalityProfile,
  QuizResult,
  FoodRecommendations,
  MealStrategy,
  SampleMeal,
  ProgressStep,
} from '@/types/quiz';
import { QUIZ_QUESTIONS } from './questions';
import { getPersonalityType } from './personalityTypes';
import { getFoodRecommendations, getMealStrategies, getSampleMeals, getProgressPathway } from './recommendations';

/**
 * Calculate personality scores based on quiz answers
 */
export function calculatePersonalityScores(
  answers: Partial<QuizAnswers>
): PersonalityScore[] {
  const scores: Record<PersonalityType, number> = {
    texture_detective: 0,
    beige_brigade: 0,
    slow_explorer: 0,
    visual_critic: 0,
    mix_master: 0,
    flavor_seeker: 0,
  };

  // Iterate through each answer
  Object.entries(answers).forEach(([questionId, answer]) => {
    const question = QUIZ_QUESTIONS.find(q => q.id === questionId);
    if (!question) return;

    // Handle multiple choice answers
    if (Array.isArray(answer)) {
      answer.forEach(value => {
        const option = question.options.find(opt => opt.value === value);
        if (option?.weight) {
          Object.entries(option.weight).forEach(([type, weight]) => {
            scores[type as PersonalityType] += weight;
          });
        }
      });
    }
    // Handle single choice answers
    else {
      const option = question.options.find(opt => opt.value === answer);
      if (option?.weight) {
        Object.entries(option.weight).forEach(([type, weight]) => {
          scores[type as PersonalityType] += weight;
        });
      }
    }
  });

  // Calculate total score
  const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);

  // Convert to PersonalityScore array with percentages
  const personalityScores: PersonalityScore[] = Object.entries(scores).map(
    ([type, score]) => ({
      type: type as PersonalityType,
      score,
      percentage: totalScore > 0 ? Math.round((score / totalScore) * 100) : 0,
    })
  );

  // Sort by score descending
  return personalityScores.sort((a, b) => b.score - a.score);
}

/**
 * Determine primary and secondary personality types
 */
export function determinePersonalityTypes(
  scores: PersonalityScore[]
): { primary: PersonalityType; secondary?: PersonalityType } {
  const sortedScores = [...scores].sort((a, b) => b.score - a.score);

  const primary = sortedScores[0].type;
  // Include secondary type if it's at least 60% of the primary score
  const secondary =
    sortedScores[1] && sortedScores[1].score >= sortedScores[0].score * 0.6
      ? sortedScores[1].type
      : undefined;

  return { primary, secondary };
}

/**
 * Build complete personality profile
 */
export function buildPersonalityProfile(
  primaryType: PersonalityType,
  secondaryType: PersonalityType | undefined,
  scores: PersonalityScore[]
): PersonalityProfile {
  const primaryDef = getPersonalityType(primaryType);

  return {
    primaryType,
    secondaryType,
    scores,
    typeName: primaryDef.name,
    typeDescription: primaryDef.fullDescription,
    primaryChallenge: primaryDef.primaryChallenge,
    icon: primaryDef.icon,
    color: primaryDef.color,
  };
}

/**
 * Generate complete quiz results
 */
export function generateQuizResults(answers: Partial<QuizAnswers>): QuizResult {
  // Calculate scores
  const scores = calculatePersonalityScores(answers);

  // Determine personality types
  const { primary, secondary } = determinePersonalityTypes(scores);

  // Build personality profile
  const profile = buildPersonalityProfile(primary, secondary, scores);

  // Get recommendations and strategies
  const recommendations = getFoodRecommendations(primary, answers);
  const strategies = getMealStrategies(primary);
  const sampleMeals = getSampleMeals(primary);
  const progressPathway = getProgressPathway(primary);

  return {
    profile,
    recommendations,
    strategies,
    sampleMeals,
    progressPathway,
  };
}

/**
 * Validate quiz answers completeness
 */
export function validateQuizAnswers(answers: Partial<QuizAnswers>): {
  isValid: boolean;
  missingQuestions: string[];
} {
  const requiredQuestions = QUIZ_QUESTIONS.filter(q => q.required).map(q => q.id);
  const answeredQuestions = Object.keys(answers);
  const missingQuestions = requiredQuestions.filter(
    id => !answeredQuestions.includes(id)
  );

  return {
    isValid: missingQuestions.length === 0,
    missingQuestions,
  };
}

/**
 * Calculate quiz completion percentage
 */
export function calculateCompletionPercentage(answers: Partial<QuizAnswers>): number {
  const totalQuestions = QUIZ_QUESTIONS.filter(q => q.required).length;
  const answeredQuestions = Object.keys(answers).length;
  return Math.round((answeredQuestions / totalQuestions) * 100);
}

/**
 * Get personality type distribution across all responses (for analytics)
 */
export function getPersonalityDistribution(
  allResponses: Array<{ personalityType: PersonalityType }>
): Record<PersonalityType, number> {
  const distribution: Record<PersonalityType, number> = {
    texture_detective: 0,
    beige_brigade: 0,
    slow_explorer: 0,
    visual_critic: 0,
    mix_master: 0,
    flavor_seeker: 0,
  };

  allResponses.forEach(response => {
    distribution[response.personalityType]++;
  });

  return distribution;
}
