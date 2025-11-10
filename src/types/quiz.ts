/**
 * Picky Eater Quiz Types and Interfaces
 * Complete type definitions for the quiz tool
 */

export type PersonalityType =
  | 'texture_detective'
  | 'beige_brigade'
  | 'slow_explorer'
  | 'visual_critic'
  | 'mix_master'
  | 'flavor_seeker';

export type AgeGroup = 'toddler' | 'preschool' | 'early_elementary' | 'tweens';
export type ReactionType = 'curious' | 'cautious' | 'refuses' | 'gags';
export type TemperaturePreference = 'hot' | 'warm' | 'room_temp' | 'cold' | 'mixed_ok';
export type MixingPreference = 'separate' | 'some_mixing' | 'casseroles_fine';
export type FamiliarityLevel = 'limited_5_10' | 'familiar_present' | 'adventurous';
export type SocialEating = 'better_with_others' | 'prefers_alone' | 'no_difference';
export type MealInvolvement = 'helps_cook' | 'watches_cooking' | 'not_interested';

export interface QuizQuestion {
  id: string;
  question: string;
  description?: string;
  type: 'single' | 'multiple' | 'visual';
  options: QuizOption[];
  required: boolean;
  icon?: string;
}

export interface QuizOption {
  id: string;
  label: string;
  value: string;
  description?: string;
  icon?: string;
  image?: string;
  weight?: Partial<Record<PersonalityType, number>>;
}

export interface QuizAnswers {
  age: AgeGroup;
  reaction: ReactionType;
  textures: string[];
  temperature: TemperaturePreference;
  color: string;
  mixing: MixingPreference;
  familiarity: FamiliarityLevel;
  social: SocialEating;
  involvement: MealInvolvement;
  dislikes: string[];
  mealtime_behavior: string;
  eating_speed: string;
}

export interface PersonalityScore {
  type: PersonalityType;
  score: number;
  percentage: number;
}

export interface PersonalityProfile {
  primaryType: PersonalityType;
  secondaryType?: PersonalityType;
  scores: PersonalityScore[];
  typeName: string;
  typeDescription: string;
  primaryChallenge: string;
  icon: string;
  color: string;
}

export interface FoodRecommendations {
  greenLight: Food[];
  yellowLight: Food[];
  redLight: Food[];
}

export interface Food {
  name: string;
  category: string;
  description: string;
  icon?: string;
}

export interface MealStrategy {
  title: string;
  description: string;
  tips: string[];
  icon: string;
}

export interface QuizResult {
  profile: PersonalityProfile;
  recommendations: FoodRecommendations;
  strategies: MealStrategy[];
  sampleMeals: SampleMeal[];
  progressPathway: ProgressStep[];
}

export interface SampleMeal {
  id: string;
  name: string;
  description: string;
  image?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  prepTime: number;
  ingredients: string[];
  whyItWorks: string;
}

export interface ProgressStep {
  phase: number;
  title: string;
  description: string;
  duration: string;
  milestones: string[];
}

export interface QuizResponse {
  id: string;
  answers: QuizAnswers;
  personalityType: PersonalityType;
  secondaryType?: PersonalityType;
  scores: Record<PersonalityType, number>;
  email?: string;
  childName?: string;
  parentName?: string;
  sessionId: string;
  createdAt: Date;
  emailCaptured: boolean;
  pdfDownloaded: boolean;
  sharedSocial: boolean;
  completionTimeSeconds: number;
}

export interface QuizLead {
  id: string;
  email: string;
  childName?: string;
  parentName?: string;
  personalityType: PersonalityType;
  quizResponseId: string;
  emailSequenceStarted: boolean;
  trialStarted: boolean;
  referralCode: string;
  referralCount: number;
  acceptsMarketing: boolean;
  createdAt: Date;
}

export interface QuizAnalyticsEvent {
  sessionId: string;
  quizResponseId?: string;
  eventType: QuizEventType;
  eventData?: Record<string, unknown>;
  currentStep?: number;
  totalSteps?: number;
  timeOnPageSeconds?: number;
  deviceType?: string;
  abTestVariant?: string;
}

export type QuizEventType =
  | 'quiz_started'
  | 'quiz_viewed'
  | 'question_answered'
  | 'question_skipped'
  | 'quiz_completed'
  | 'quiz_abandoned'
  | 'results_viewed'
  | 'email_modal_opened'
  | 'email_captured'
  | 'email_modal_closed'
  | 'pdf_downloaded'
  | 'social_shared'
  | 'trial_clicked'
  | 'referral_link_copied';

export interface ShareData {
  platform: 'facebook' | 'instagram' | 'twitter' | 'pinterest' | 'email';
  personalityType: PersonalityType;
  quizResponseId: string;
  referralCode?: string;
}

// Personality Type Definitions
export interface PersonalityTypeDefinition {
  type: PersonalityType;
  name: string;
  shortDescription: string;
  fullDescription: string;
  icon: string;
  color: string;
  primaryChallenge: string;
  strengths: string[];
  commonBehaviors: string[];
  parentingTips: string[];
  nutritionFocus: string[];
}

// Quiz Session State
export interface QuizState {
  currentStep: number;
  answers: Partial<QuizAnswers>;
  sessionId: string;
  startedAt: Date;
  abTestVariant?: string;
  referralSource?: string;
  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
  };
}

// Email Capture Form
export interface EmailCaptureData {
  email: string;
  childName: string;
  parentName: string;
  acceptsMarketing: boolean;
}

// A/B Test Variants
export type QuizVariant = {
  id: string;
  name: string;
  questionCount: 8 | 12 | 15;
  personalityNameStyle: 'fun' | 'descriptive' | 'empowering';
  emailCaptureHook: 'complete_guide' | 'meal_plan' | 'strategy_recipes';
  trialOfferTiming: 'immediate' | 'email_only' | 'multiple';
};

// PDF Report Configuration
export interface PDFReportConfig {
  includePersonalityCard: boolean;
  includeRecommendations: boolean;
  includeStrategies: boolean;
  includeSampleMeals: boolean;
  includeProgressPath: boolean;
  includeTipsSheet: boolean;
}

// Social Share Image Config
export interface ShareImageConfig {
  personalityType: PersonalityType;
  childName?: string;
  customMessage?: string;
  template: 'card' | 'infographic' | 'story';
}
