/**
 * Picky Eater Quiz Questions Configuration
 * All 12 questions with weighted scoring for personality types
 */

import { QuizQuestion } from '@/types/quiz';

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'age',
    question: "How old is your child?",
    description: "This helps us customize recommendations",
    type: 'visual',
    required: true,
    icon: '🎂',
    options: [
      {
        id: 'toddler',
        label: 'Toddler',
        value: 'toddler',
        description: '2-3 years',
        icon: '👶',
      },
      {
        id: 'preschool',
        label: 'Preschool',
        value: 'preschool',
        description: '4-5 years',
        icon: '🧒',
      },
      {
        id: 'early_elementary',
        label: 'Early Elementary',
        value: 'early_elementary',
        description: '6-8 years',
        icon: '👧',
      },
      {
        id: 'tweens',
        label: 'Tweens',
        value: 'tweens',
        description: '9-12 years',
        icon: '🧑',
      },
    ],
  },

  {
    id: 'reaction',
    question: "How does your child typically react to new foods?",
    description: "Choose the most common reaction",
    type: 'visual',
    required: true,
    icon: '😊',
    options: [
      {
        id: 'curious',
        label: 'Curious',
        value: 'curious',
        description: 'Interested and willing to explore',
        icon: '🤔',
        weight: {
          flavor_seeker: 3,
          slow_explorer: 2,
        },
      },
      {
        id: 'cautious',
        label: 'Cautious',
        value: 'cautious',
        description: 'Hesitant but might try with encouragement',
        icon: '😐',
        weight: {
          slow_explorer: 3,
          visual_critic: 2,
        },
      },
      {
        id: 'refuses',
        label: 'Refuses',
        value: 'refuses',
        description: 'Pushes away or says "no" immediately',
        icon: '🙅',
        weight: {
          beige_brigade: 3,
          visual_critic: 2,
        },
      },
      {
        id: 'gags',
        label: 'Gags or becomes upset',
        value: 'gags',
        description: 'Strong negative physical reaction',
        icon: '😫',
        weight: {
          texture_detective: 3,
          beige_brigade: 2,
        },
      },
    ],
  },

  {
    id: 'textures',
    question: "Which textures does your child prefer?",
    description: "Select all that apply",
    type: 'multiple',
    required: true,
    icon: '👋',
    options: [
      {
        id: 'crunchy',
        label: 'Crunchy',
        value: 'crunchy',
        icon: '🥨',
        weight: {
          texture_detective: 2,
          beige_brigade: 1,
        },
      },
      {
        id: 'smooth',
        label: 'Smooth',
        value: 'smooth',
        icon: '🥛',
        weight: {
          texture_detective: 2,
        },
      },
      {
        id: 'chewy',
        label: 'Chewy',
        value: 'chewy',
        icon: '🍖',
        weight: {
          flavor_seeker: 1,
        },
      },
      {
        id: 'soft',
        label: 'Soft',
        value: 'soft',
        icon: '🍞',
        weight: {
          beige_brigade: 2,
        },
      },
      {
        id: 'avoid_mushy',
        label: 'Avoids mushy textures',
        value: 'avoid_mushy',
        icon: '🚫',
        weight: {
          texture_detective: 3,
        },
      },
    ],
  },

  {
    id: 'temperature',
    question: "What temperature foods does your child prefer?",
    description: "Choose the best fit",
    type: 'single',
    required: true,
    icon: '🌡️',
    options: [
      {
        id: 'hot',
        label: 'Hot foods only',
        value: 'hot',
        weight: {
          texture_detective: 1,
        },
      },
      {
        id: 'warm',
        label: 'Warm foods',
        value: 'warm',
        weight: {
          beige_brigade: 1,
        },
      },
      {
        id: 'room_temp',
        label: 'Room temperature',
        value: 'room_temp',
        weight: {
          beige_brigade: 2,
        },
      },
      {
        id: 'cold',
        label: 'Cold foods',
        value: 'cold',
        weight: {
          texture_detective: 1,
        },
      },
      {
        id: 'mixed_ok',
        label: 'Any temperature is fine',
        value: 'mixed_ok',
        weight: {
          flavor_seeker: 2,
          slow_explorer: 1,
        },
      },
    ],
  },

  {
    id: 'color',
    question: "How does food color affect your child's eating?",
    description: "Choose what sounds most like your child",
    type: 'single',
    required: true,
    icon: '🎨',
    options: [
      {
        id: 'beige_only',
        label: 'Will only eat beige/brown foods',
        value: 'beige_only',
        weight: {
          beige_brigade: 4,
        },
      },
      {
        id: 'bright_ok',
        label: 'Bright colors are okay',
        value: 'bright_ok',
        weight: {
          flavor_seeker: 2,
          slow_explorer: 1,
        },
      },
      {
        id: 'no_green',
        label: 'Refuses green foods',
        value: 'no_green',
        weight: {
          visual_critic: 3,
          beige_brigade: 2,
        },
      },
      {
        id: 'mixed_plates',
        label: 'Colorful mixed plates are fine',
        value: 'mixed_plates',
        weight: {
          flavor_seeker: 3,
        },
      },
      {
        id: 'specific_colors',
        label: 'Very specific about certain colors',
        value: 'specific_colors',
        weight: {
          visual_critic: 4,
        },
      },
    ],
  },

  {
    id: 'mixing',
    question: "How does your child feel about mixed foods?",
    description: "Think about casseroles, stir-fries, mixed dishes",
    type: 'visual',
    required: true,
    icon: '🍲',
    options: [
      {
        id: 'separate',
        label: 'Everything must be separate',
        value: 'separate',
        description: 'Foods cannot touch',
        icon: '🍱',
        weight: {
          mix_master: 4,
        },
      },
      {
        id: 'some_mixing',
        label: 'Some mixing okay',
        value: 'some_mixing',
        description: 'Depends on the food',
        icon: '🍽️',
        weight: {
          slow_explorer: 2,
          visual_critic: 1,
        },
      },
      {
        id: 'casseroles_fine',
        label: 'Casseroles are fine',
        value: 'casseroles_fine',
        description: 'No problem with mixed dishes',
        icon: '🥘',
        weight: {
          flavor_seeker: 3,
        },
      },
    ],
  },

  {
    id: 'familiarity',
    question: "How adventurous is your child with food?",
    description: "In terms of trying new things",
    type: 'single',
    required: true,
    icon: '🗺️',
    options: [
      {
        id: 'limited_5_10',
        label: 'Only eats 5-10 foods',
        value: 'limited_5_10',
        weight: {
          beige_brigade: 4,
          texture_detective: 2,
        },
      },
      {
        id: 'familiar_present',
        label: 'Will try if familiar foods are also present',
        value: 'familiar_present',
        weight: {
          slow_explorer: 3,
        },
      },
      {
        id: 'adventurous',
        label: 'Generally adventurous',
        value: 'adventurous',
        weight: {
          flavor_seeker: 4,
        },
      },
    ],
  },

  {
    id: 'social',
    question: "Does social context affect eating?",
    description: "Think about eating with friends vs. alone",
    type: 'single',
    required: true,
    icon: '👥',
    options: [
      {
        id: 'better_with_others',
        label: 'Eats better with others',
        value: 'better_with_others',
        weight: {
          slow_explorer: 2,
          flavor_seeker: 1,
        },
      },
      {
        id: 'prefers_alone',
        label: 'Prefers eating alone',
        value: 'prefers_alone',
        weight: {
          texture_detective: 2,
          mix_master: 1,
        },
      },
      {
        id: 'no_difference',
        label: 'No difference',
        value: 'no_difference',
        weight: {
          beige_brigade: 1,
        },
      },
    ],
  },

  {
    id: 'involvement',
    question: "Does your child help with meal preparation?",
    description: "Any involvement in cooking or food prep",
    type: 'single',
    required: true,
    icon: '👨‍🍳',
    options: [
      {
        id: 'helps_cook',
        label: 'Yes, helps with cooking',
        value: 'helps_cook',
        weight: {
          flavor_seeker: 3,
          slow_explorer: 2,
        },
      },
      {
        id: 'watches_cooking',
        label: 'Watches but doesn\'t help',
        value: 'watches_cooking',
        weight: {
          visual_critic: 2,
          slow_explorer: 1,
        },
      },
      {
        id: 'not_interested',
        label: 'Not interested in food prep',
        value: 'not_interested',
        weight: {
          beige_brigade: 2,
          texture_detective: 1,
        },
      },
    ],
  },

  {
    id: 'dislikes',
    question: "What food categories does your child avoid most?",
    description: "Select up to 3",
    type: 'multiple',
    required: true,
    icon: '🚫',
    options: [
      {
        id: 'vegetables',
        label: 'Vegetables',
        value: 'vegetables',
        weight: {
          beige_brigade: 2,
          visual_critic: 2,
        },
      },
      {
        id: 'meat',
        label: 'Meat',
        value: 'meat',
        weight: {
          texture_detective: 2,
        },
      },
      {
        id: 'dairy',
        label: 'Dairy',
        value: 'dairy',
        weight: {
          texture_detective: 1,
        },
      },
      {
        id: 'fruit',
        label: 'Fruit',
        value: 'fruit',
        weight: {
          texture_detective: 2,
          beige_brigade: 1,
        },
      },
      {
        id: 'grains',
        label: 'Grains',
        value: 'grains',
        weight: {
          texture_detective: 1,
        },
      },
      {
        id: 'sauces',
        label: 'Sauces & condiments',
        value: 'sauces',
        weight: {
          mix_master: 3,
          visual_critic: 2,
        },
      },
    ],
  },

  {
    id: 'mealtime_behavior',
    question: "What best describes mealtime behavior?",
    description: "Choose the most common scenario",
    type: 'single',
    required: true,
    icon: '⏰',
    options: [
      {
        id: 'battles',
        label: 'Frequent battles and stress',
        value: 'battles',
        weight: {
          beige_brigade: 2,
          texture_detective: 2,
        },
      },
      {
        id: 'negotiations',
        label: 'Lots of negotiation',
        value: 'negotiations',
        weight: {
          slow_explorer: 2,
          mix_master: 1,
        },
      },
      {
        id: 'particular',
        label: 'Particular but manageable',
        value: 'particular',
        weight: {
          visual_critic: 2,
          mix_master: 2,
        },
      },
      {
        id: 'pleasant',
        label: 'Generally pleasant',
        value: 'pleasant',
        weight: {
          flavor_seeker: 3,
          slow_explorer: 1,
        },
      },
    ],
  },

  {
    id: 'eating_speed',
    question: "How quickly does your child eat?",
    description: "When eating foods they like",
    type: 'single',
    required: true,
    icon: '⚡',
    options: [
      {
        id: 'very_slow',
        label: 'Very slow, takes forever',
        value: 'very_slow',
        weight: {
          texture_detective: 2,
          slow_explorer: 1,
        },
      },
      {
        id: 'slow',
        label: 'Slow but steady',
        value: 'slow',
        weight: {
          slow_explorer: 2,
          visual_critic: 1,
        },
      },
      {
        id: 'moderate',
        label: 'Moderate pace',
        value: 'moderate',
        weight: {
          mix_master: 1,
        },
      },
      {
        id: 'fast',
        label: 'Fast when they like it',
        value: 'fast',
        weight: {
          flavor_seeker: 2,
          beige_brigade: 1,
        },
      },
    ],
  },
];

// Helper function to get question by ID
export function getQuestionById(id: string): QuizQuestion | undefined {
  return QUIZ_QUESTIONS.find(q => q.id === id);
}

// Get total number of questions
export function getTotalQuestions(): number {
  return QUIZ_QUESTIONS.length;
}
