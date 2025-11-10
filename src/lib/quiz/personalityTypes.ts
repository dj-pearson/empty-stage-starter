/**
 * Picky Eater Personality Type Definitions
 * Comprehensive profiles for each eating personality
 */

import { PersonalityType, PersonalityTypeDefinition } from '@/types/quiz';

export const PERSONALITY_TYPES: Record<PersonalityType, PersonalityTypeDefinition> = {
  texture_detective: {
    type: 'texture_detective',
    name: 'The Texture Detective',
    shortDescription: 'Sensory-sensitive eater who explores foods through touch and feel',
    fullDescription:
      'Your child is highly attuned to how foods feel in their mouth. They can detect subtle differences in textures that others might miss. This heightened sensory awareness is actually a strength - these children often become adventurous eaters once they find textures they love.',
    icon: '🔍',
    color: '#8B5CF6',
    primaryChallenge: 'Texture sensitivity makes many foods uncomfortable',
    strengths: [
      'Highly observant and detail-oriented',
      'Strong sensory awareness',
      'Can articulate what they do and don\'t like',
      'Often enjoys specific food preparation methods',
    ],
    commonBehaviors: [
      'Removes certain textures from mixed foods',
      'Prefers consistent textures (all crunchy or all smooth)',
      'May gag on slimy, mushy, or unexpected textures',
      'Touches food before eating it',
      'Asks detailed questions about how food is prepared',
    ],
    parentingTips: [
      'Respect their texture preferences - this is sensory, not behavioral',
      'Offer foods in different preparations (roasted vs. steamed)',
      'Let them help with food prep to explore textures safely',
      'Start with their preferred texture and gradually introduce variations',
      'Celebrate small wins - trying one bite is huge progress',
    ],
    nutritionFocus: [
      'Ensure variety within preferred texture categories',
      'Supplement if diet becomes too limited',
      'Focus on nutrient-dense versions of accepted textures',
      'Work with OT if sensory issues are severe',
    ],
  },

  beige_brigade: {
    type: 'beige_brigade',
    name: 'The Beige Brigade',
    shortDescription: 'Safe food enthusiast who prefers familiar, neutral-colored foods',
    fullDescription:
      'Your child finds comfort and safety in predictable foods. While their current diet may seem limited, this phase is actually common and manageable. With patience and the right strategies, they can gradually expand their food repertoire.',
    icon: '🍞',
    color: '#D4A574',
    primaryChallenge: 'Limited food variety, mostly carbohydrates and neutral colors',
    strengths: [
      'Knows what they like and will eat consistently',
      'Meal planning can be predictable',
      'Usually not dramatic at mealtimes once preferences are met',
      'Often willing to try different brands of accepted foods',
    ],
    commonBehaviors: [
      'Primarily eats bread, pasta, crackers, chicken nuggets',
      'Avoids colorful vegetables and fruits',
      'Prefers dry, crispy, or plain foods',
      'Will eat the same meals repeatedly',
      'May refuse foods that touch each other',
    ],
    parentingTips: [
      'Don\'t panic - this is a phase, not forever',
      'Serve one accepted food with one new food each meal',
      'Make favorite foods healthier (whole grain bread, baked nuggets)',
      'Introduce color gradually through dips and sauces',
      'Never force eating - it backfires with these kids',
    ],
    nutritionFocus: [
      'Choose fortified versions of preferred foods',
      'Hide nutrition where possible (cauliflower mac & cheese)',
      'Offer daily multivitamin',
      'Ensure adequate protein and healthy fats',
    ],
  },

  slow_explorer: {
    type: 'slow_explorer',
    name: 'The Slow Explorer',
    shortDescription: 'Cautious but willing to try new things with proper introduction',
    fullDescription:
      'Your child approaches new foods thoughtfully and needs time to warm up. This isn\'t pickiness - it\'s a careful, methodical approach to eating. With repeated, pressure-free exposure, they typically become adventurous eaters.',
    icon: '🐢',
    color: '#10B981',
    primaryChallenge: 'Needs multiple exposures before accepting new foods',
    strengths: [
      'Actually willing to try new things (given time)',
      'Thoughtful decision-making skills',
      'Remembers foods they\'ve liked in the past',
      'Responds well to gentle encouragement',
    ],
    commonBehaviors: [
      'Looks at new foods for several meals before trying',
      'May touch, smell, or lick food before eating',
      'Asks questions about unfamiliar foods',
      'Eats better when not pressured',
      'Will eventually try foods they initially refused',
    ],
    parentingTips: [
      'Serve new foods 10-15 times before expecting acceptance',
      'Let them interact with food without eating pressure',
      'Share your own enjoyment of the food',
      'Celebrate curiosity, not just eating',
      'Keep family meals relaxed and positive',
    ],
    nutritionFocus: [
      'Continue offering balanced meals regardless of what\'s eaten',
      'Don\'t become a "short-order cook"',
      'Trust their appetite regulation',
      'Focus on long-term progress, not daily intake',
    ],
  },

  visual_critic: {
    type: 'visual_critic',
    name: 'The Visual Critic',
    shortDescription: 'Appearance-focused eater who judges food by how it looks',
    fullDescription:
      'Your child experiences food visually before they taste it. Presentation, color, and arrangement deeply impact their willingness to eat. This visual sensitivity can actually be leveraged to increase food acceptance.',
    icon: '👁️',
    color: '#F59E0B',
    primaryChallenge: 'Food presentation and appearance heavily influence eating',
    strengths: [
      'Appreciates beautiful food presentation',
      'May enjoy helping arrange plates',
      'Remembers how favorite foods should look',
      'Responds well to creative plating',
    ],
    commonBehaviors: [
      'Refuses food if it "looks weird"',
      'Very aware of food colors and combinations',
      'May reject foods with visible seasonings or specks',
      'Prefers Instagram-worthy food presentation',
      'Notices when familiar foods look different',
    ],
    parentingTips: [
      'Invest time in attractive food presentation',
      'Use cookie cutters, fun plates, and creative arrangements',
      'Let them help design their plates',
      'Introduce new colors gradually and intentionally',
      'Make food fun and visually appealing',
    ],
    nutritionFocus: [
      'Smoothies can hide vegetables with colorful fruits',
      'Arrange colorful foods in appealing patterns',
      'Use dips and sauces in separate containers',
      'Ensure variety through visual appeal',
    ],
  },

  mix_master: {
    type: 'mix_master',
    name: 'The Mix Master',
    shortDescription: 'Separate food advocate who needs clear boundaries between foods',
    fullDescription:
      'Your child needs to experience each food individually and dislikes when flavors blend together. This preference for separation is about control and predictability, and it\'s completely valid.',
    icon: '🍱',
    color: '#EC4899',
    primaryChallenge: 'Cannot tolerate foods touching or mixing on the plate',
    strengths: [
      'Willing to eat variety as long as it\'s separated',
      'Can clearly communicate preferences',
      'May eat MORE foods than expected if served separately',
      'Enjoys bento-box style meals',
    ],
    commonBehaviors: [
      'Refuses casseroles, mixed dishes, and stir-fries',
      'May have meltdowns if foods touch',
      'Prefers sectioned plates or multiple small plates',
      'Eats food in a specific order',
      'Dislikes sauces mixed into food',
    ],
    parentingTips: [
      'Use divided plates - this is an easy accommodation',
      'Serve sauces and dips on the side',
      'Deconstruct mixed dishes for them',
      'Don\'t make them feel abnormal - this is common',
      'Gradually introduce one-pot meals with minimal mixing',
    ],
    nutritionFocus: [
      'Deconstructed meals can still be balanced',
      'Focus on variety across the week, not each meal',
      'Bento boxes make nutrition easy to track',
      'Ensure protein, carbs, and veggies are all represented',
    ],
  },

  flavor_seeker: {
    type: 'flavor_seeker',
    name: 'The Flavor Seeker',
    shortDescription: 'Actually adventurous eater with sophisticated palate',
    fullDescription:
      'Your child is genuinely interested in food and willing to explore flavors! While they may have specific preferences, they\'re not actually picky - they\'re discerning. This is wonderful and should be encouraged.',
    icon: '🌟',
    color: '#3B82F6',
    primaryChallenge: 'Wants flavorful food, may reject bland options',
    strengths: [
      'Willing to try new foods',
      'Enjoys variety and different cuisines',
      'Can articulate what they like about foods',
      'May enjoy cooking and food preparation',
    ],
    commonBehaviors: [
      'Gets bored with repetitive meals',
      'Enjoys seasonings and bold flavors',
      'Will eat vegetables if they\'re well-prepared',
      'Interested in trying international foods',
      'May refuse "kid menu" foods as too bland',
    ],
    parentingTips: [
      'Involve them in meal planning and cooking',
      'Experiment with different cuisines together',
      'Don\'t default to chicken nuggets - they want real food',
      'Let them season their own food',
      'Encourage their adventurous spirit',
    ],
    nutritionFocus: [
      'This child likely has great nutrition already',
      'Continue exposing them to variety',
      'Teach them about balanced meals',
      'Foster their love of food and cooking',
    ],
  },
};

// Helper functions
export function getPersonalityType(type: PersonalityType): PersonalityTypeDefinition {
  return PERSONALITY_TYPES[type];
}

export function getAllPersonalityTypes(): PersonalityTypeDefinition[] {
  return Object.values(PERSONALITY_TYPES);
}

export function getPersonalityColor(type: PersonalityType): string {
  return PERSONALITY_TYPES[type].color;
}

export function getPersonalityIcon(type: PersonalityType): string {
  return PERSONALITY_TYPES[type].icon;
}

export function getPersonalityName(type: PersonalityType): string {
  return PERSONALITY_TYPES[type].name;
}
