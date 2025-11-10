/**
 * Picky Eater Quiz Recommendations
 * Food recommendations, strategies, and meal ideas by personality type
 */

import {
  PersonalityType,
  FoodRecommendations,
  Food,
  MealStrategy,
  SampleMeal,
  ProgressStep,
  QuizAnswers,
} from '@/types/quiz';

/**
 * Get food recommendations based on personality type
 */
export function getFoodRecommendations(
  type: PersonalityType,
  answers: Partial<QuizAnswers>
): FoodRecommendations {
  const recommendations: Record<PersonalityType, FoodRecommendations> = {
    texture_detective: {
      greenLight: [
        { name: 'Crunchy vegetables (carrots, celery)', category: 'Vegetables', description: 'Consistent texture they can predict', icon: '🥕' },
        { name: 'Smooth nut butters', category: 'Protein', description: 'Predictable creamy texture', icon: '🥜' },
        { name: 'Crispy chicken tenders', category: 'Protein', description: 'Crunchy coating, soft inside', icon: '🍗' },
        { name: 'Apple slices', category: 'Fruit', description: 'Clean, crisp texture', icon: '🍎' },
        { name: 'Crackers and pretzels', category: 'Grains', description: 'Reliable crunch', icon: '🥨' },
      ],
      yellowLight: [
        { name: 'Roasted vegetables', category: 'Vegetables', description: 'Can be crispy outside, introduce slowly', icon: '🥦' },
        { name: 'Grilled cheese (well-toasted)', category: 'Dairy/Grains', description: 'Crunchy outside helps', icon: '🧀' },
        { name: 'Smoothies', category: 'Various', description: 'Fully smooth, no chunks', icon: '🥤' },
        { name: 'Rice cakes', category: 'Grains', description: 'Light, airy crunch', icon: '🍘' },
        { name: 'Frozen fruit pops', category: 'Fruit', description: 'Cold, consistent texture', icon: '🍧' },
      ],
      redLight: [
        { name: 'Mushrooms', category: 'Vegetables', description: 'Slimy texture trigger', icon: '🍄' },
        { name: 'Yogurt with chunks', category: 'Dairy', description: 'Mixed textures problematic', icon: '🍓' },
        { name: 'Stews and soups', category: 'Mixed', description: 'Too many texture variations', icon: '🍲' },
        { name: 'Overripe bananas', category: 'Fruit', description: 'Mushy texture issue', icon: '🍌' },
        { name: 'Ground meat in sauce', category: 'Protein', description: 'Unpredictable texture', icon: '🍝' },
      ],
    },

    beige_brigade: {
      greenLight: [
        { name: 'Chicken nuggets (baked)', category: 'Protein', description: 'Classic safe food', icon: '🍗' },
        { name: 'Mac and cheese', category: 'Grains/Dairy', description: 'Comfort food favorite', icon: '🧀' },
        { name: 'Toast or bread', category: 'Grains', description: 'Predictable and safe', icon: '🍞' },
        { name: 'Crackers', category: 'Grains', description: 'Crunchy and neutral', icon: '🧈' },
        { name: 'French fries (baked)', category: 'Vegetables', description: 'Gateway vegetable', icon: '🍟' },
      ],
      yellowLight: [
        { name: 'Cauliflower tots', category: 'Vegetables', description: 'Hidden veggie in familiar form', icon: '🥦' },
        { name: 'Whole grain bread', category: 'Grains', description: 'Healthier beige option', icon: '🌾' },
        { name: 'Hummus (plain)', category: 'Protein', description: 'Beige and nutritious', icon: '🧆' },
        { name: 'Banana', category: 'Fruit', description: 'Not too colorful, sweet', icon: '🍌' },
        { name: 'Turkey slices', category: 'Protein', description: 'Mild, beige protein', icon: '🦃' },
      ],
      redLight: [
        { name: 'Broccoli', category: 'Vegetables', description: 'Too green, avoid for now', icon: '🥦' },
        { name: 'Tomatoes', category: 'Vegetables', description: 'Bright red trigger', icon: '🍅' },
        { name: 'Berry smoothies', category: 'Fruit', description: 'Too colorful', icon: '🫐' },
        { name: 'Spinach anything', category: 'Vegetables', description: 'Visible green flecks', icon: '🥬' },
        { name: 'Colorful peppers', category: 'Vegetables', description: 'Too vibrant', icon: '🫑' },
      ],
    },

    slow_explorer: {
      greenLight: [
        { name: 'Familiar fruits (apples, bananas)', category: 'Fruit', description: 'Build on what they know', icon: '🍎' },
        { name: 'Pasta (plain or with butter)', category: 'Grains', description: 'Safe starting point', icon: '🍝' },
        { name: 'Mild cheeses', category: 'Dairy', description: 'Not too intimidating', icon: '🧀' },
        { name: 'Chicken (plain)', category: 'Protein', description: 'Neutral, familiar', icon: '🍗' },
        { name: 'Rice', category: 'Grains', description: 'Versatile base', icon: '🍚' },
      ],
      yellowLight: [
        { name: 'Roasted sweet potato', category: 'Vegetables', description: 'Sweet flavor bridge', icon: '🍠' },
        { name: 'Mild tacos', category: 'Mixed', description: 'Deconstructed is key', icon: '🌮' },
        { name: 'Cucumber slices', category: 'Vegetables', description: 'Mild veggie gateway', icon: '🥒' },
        { name: 'Quesadillas', category: 'Grains/Dairy', description: 'Familiar with variation', icon: '🫓' },
        { name: 'Berries', category: 'Fruit', description: 'Small, manageable bites', icon: '🍓' },
      ],
      redLight: [
        { name: 'Spicy foods', category: 'Various', description: 'Too bold too fast', icon: '🌶️' },
        { name: 'Strong cheeses', category: 'Dairy', description: 'Overwhelming flavor', icon: '🧀' },
        { name: 'Unfamiliar cuisines', category: 'Various', description: 'Too many unknowns', icon: '🍛' },
        { name: 'Complex mixed dishes', category: 'Mixed', description: 'Save for later', icon: '🥘' },
        { name: 'Exotic fruits', category: 'Fruit', description: 'Too different initially', icon: '🥭' },
      ],
    },

    visual_critic: {
      greenLight: [
        { name: 'Colorful fruit arranged nicely', category: 'Fruit', description: 'Beautiful presentation matters', icon: '🍓' },
        { name: 'Bento box meals', category: 'Various', description: 'Organized and attractive', icon: '🍱' },
        { name: 'Smoothie bowls with toppings', category: 'Various', description: 'Instagram-worthy food', icon: '🥣' },
        { name: 'Cucumber "coins"', category: 'Vegetables', description: 'Fun, uniform shape', icon: '🥒' },
        { name: 'Rainbow carrots', category: 'Vegetables', description: 'Pretty colors', icon: '🥕' },
      ],
      yellowLight: [
        { name: 'Pasta with hidden veggie sauce', category: 'Grains', description: 'Sauce must look smooth', icon: '🍝' },
        { name: 'Quesadilla triangles', category: 'Grains/Dairy', description: 'Neat, tidy pieces', icon: '🫓' },
        { name: 'Apple "donuts" with nut butter', category: 'Fruit', description: 'Fun presentation', icon: '🍎' },
        { name: 'Veggie sushi rolls', category: 'Vegetables', description: 'Artistic arrangement', icon: '🍣' },
        { name: 'Fruit kabobs', category: 'Fruit', description: 'Playful presentation', icon: '🍡' },
      ],
      redLight: [
        { name: 'Messy pasta dishes', category: 'Grains', description: 'Looks chaotic', icon: '🍝' },
        { name: 'Brown/mushy foods', category: 'Various', description: 'Unappealing appearance', icon: '🥔' },
        { name: 'Foods with visible specs', category: 'Various', description: 'Looks "dirty"', icon: '🌿' },
        { name: 'Mixed casseroles', category: 'Mixed', description: 'Too visually chaotic', icon: '🥘' },
        { name: 'Anything "sloppy"', category: 'Various', description: 'Visual turn-off', icon: '🌭' },
      ],
    },

    mix_master: {
      greenLight: [
        { name: 'Deconstructed tacos', category: 'Various', description: 'All components separate', icon: '🌮' },
        { name: 'Protein + veggie + carb (separated)', category: 'Various', description: 'Balanced but apart', icon: '🍱' },
        { name: 'Dips in separate containers', category: 'Various', description: 'Control over mixing', icon: '🥫' },
        { name: 'Build-your-own meals', category: 'Various', description: 'Full control', icon: '🍽️' },
        { name: 'Snack plates with sections', category: 'Various', description: 'Clear boundaries', icon: '🧈' },
      ],
      yellowLight: [
        { name: 'Pasta with sauce on side', category: 'Grains', description: 'They add their own', icon: '🍝' },
        { name: 'Burrito bowl (not wrapped)', category: 'Various', description: 'Layered, not mixed', icon: '🥙' },
        { name: 'Pizza (toppings separate)', category: 'Various', description: 'Plain is usually better', icon: '🍕' },
        { name: 'Salad (deconstructed)', category: 'Vegetables', description: 'Components apart', icon: '🥗' },
        { name: 'Sandwiches (can open)', category: 'Various', description: 'Ability to modify', icon: '🥪' },
      ],
      redLight: [
        { name: 'Casseroles', category: 'Mixed', description: 'Everything touching', icon: '🥘' },
        { name: 'Stir-fries', category: 'Mixed', description: 'All mixed together', icon: '🍜' },
        { name: 'Mixed fried rice', category: 'Grains', description: 'Too integrated', icon: '🍛' },
        { name: 'Soups with ingredients', category: 'Mixed', description: 'Everything swimming together', icon: '🍲' },
        { name: 'Pre-dressed salads', category: 'Vegetables', description: 'Can\'t separate', icon: '🥗' },
      ],
    },

    flavor_seeker: {
      greenLight: [
        { name: 'International cuisines', category: 'Various', description: 'Exciting flavors', icon: '🌍' },
        { name: 'Well-seasoned vegetables', category: 'Vegetables', description: 'Flavor makes it better', icon: '🥦' },
        { name: 'Diverse proteins', category: 'Protein', description: 'Variety is key', icon: '🍖' },
        { name: 'Fresh herbs', category: 'Various', description: 'Enhances everything', icon: '🌿' },
        { name: 'Flavorful sauces', category: 'Various', description: 'Adds complexity', icon: '🥫' },
      ],
      yellowLight: [
        { name: 'Spicy foods (age-appropriate)', category: 'Various', description: 'Build tolerance gradually', icon: '🌶️' },
        { name: 'Strong cheeses', category: 'Dairy', description: 'Bold flavors they might love', icon: '🧀' },
        { name: 'Fermented foods', category: 'Various', description: 'Complex but interesting', icon: '🥒' },
        { name: 'Adventurous fruits', category: 'Fruit', description: 'Try new varieties', icon: '🥭' },
        { name: 'Gourmet dishes', category: 'Various', description: 'Sophisticated palate', icon: '🍽️' },
      ],
      redLight: [
        { name: 'Bland chicken nuggets', category: 'Protein', description: 'Too boring', icon: '🍗' },
        { name: 'Plain pasta', category: 'Grains', description: 'Needs flavor', icon: '🍝' },
        { name: 'Unseasoned food', category: 'Various', description: 'Not interesting enough', icon: '🥔' },
        { name: 'Kids menu basics', category: 'Various', description: 'Under-stimulating', icon: '🍕' },
        { name: 'Repetitive meals', category: 'Various', description: 'Gets bored easily', icon: '🍽️' },
      ],
    },
  };

  return recommendations[type];
}

/**
 * Get meal introduction strategies by personality type
 */
export function getMealStrategies(type: PersonalityType): MealStrategy[] {
  const strategies: Record<PersonalityType, MealStrategy[]> = {
    texture_detective: [
      {
        title: 'Texture Preparation',
        description: 'Cook foods to their preferred texture consistently',
        tips: [
          'Roast vegetables for crunch instead of steaming',
          'Offer raw veggies if they prefer crunch',
          'Blend smoothies completely smooth, no chunks',
          'Keep textures consistent meal to meal',
        ],
        icon: '👨‍🍳',
      },
      {
        title: 'Touch Exploration',
        description: 'Let them explore textures without eating pressure',
        tips: [
          'Sensory play with food (no pressure to eat)',
          'Let them help with food prep to feel textures',
          'Describe textures before serving',
          'Offer food "tasting parties" with no-pressure touching',
        ],
        icon: '✋',
      },
    ],
    beige_brigade: [
      {
        title: 'Color Bridge Method',
        description: 'Gradually introduce colors through familiar vehicles',
        tips: [
          'Start with tan/beige veggies (cauliflower, potatoes)',
          'Add one colorful food to an all-beige plate',
          'Use cheese sauce to make vegetables more acceptable',
          'Celebrate trying colors, not eating them',
        ],
        icon: '🌈',
      },
      {
        title: 'Nutrition Optimization',
        description: 'Make beige foods more nutritious',
        tips: [
          'Choose whole grain versions of beige foods',
          'Add protein powder to baked goods',
          'Fortify mac & cheese with hidden veggies',
          'Offer daily vitamin to fill gaps',
        ],
        icon: '💊',
      },
    ],
    slow_explorer: [
      {
        title: 'Repeated Exposure',
        description: 'Serve new foods 10-15 times without pressure',
        tips: [
          'Put new food on plate without expectation',
          'Share your enjoyment of the food',
          'Never force or pressure eating',
          'Celebrate looking, touching, smelling as wins',
        ],
        icon: '🔄',
      },
      {
        title: 'Family Meals',
        description: 'Model adventurous eating at family dinners',
        tips: [
          'Eat together as often as possible',
          'Talk positively about all foods',
          'Let them see others enjoying new foods',
          'Keep mealtimes relaxed and pleasant',
        ],
        icon: '👨‍👩‍👧',
      },
    ],
    visual_critic: [
      {
        title: 'Plating Excellence',
        description: 'Make food visually appealing',
        tips: [
          'Use cookie cutters for fun shapes',
          'Arrange food in patterns or pictures',
          'Serve in special plates or bento boxes',
          'Let them help with plating design',
        ],
        icon: '🎨',
      },
      {
        title: 'Color Psychology',
        description: 'Use colors strategically',
        tips: [
          'Group similar colors together',
          'Create rainbow plates gradually',
          'Use naturally bright, appealing colors',
          'Avoid brown/gray color combinations',
        ],
        icon: '🌈',
      },
    ],
    mix_master: [
      {
        title: 'Separation Strategy',
        description: 'Honor their need for separated foods',
        tips: [
          'Use divided plates or multiple small plates',
          'Serve all sauces and dips on the side',
          'Deconstruct complex dishes',
          'Let them assemble their own meals',
        ],
        icon: '🍱',
      },
      {
        title: 'Gradual Integration',
        description: 'Slowly introduce some mixing',
        tips: [
          'Start with foods barely touching',
          'Offer "mix-ins" they can add themselves',
          'Gradually reduce plate divider sizes',
          'Celebrate small mixing victories',
        ],
        icon: '🔄',
      },
    ],
    flavor_seeker: [
      {
        title: 'Culinary Education',
        description: 'Teach them about food and cooking',
        tips: [
          'Involve them in meal planning and cooking',
          'Explore different cuisines together',
          'Visit ethnic markets and restaurants',
          'Let them choose new recipes to try',
        ],
        icon: '👨‍🍳',
      },
      {
        title: 'Flavor Exploration',
        description: 'Encourage their adventurous palate',
        tips: [
          'Try a new food each week together',
          'Create tasting journals',
          'Experiment with herbs and spices',
          'Support their food curiosity',
        ],
        icon: '🌟',
      },
    ],
  };

  return strategies[type];
}

/**
 * Get sample meals by personality type
 */
export function getSampleMeals(type: PersonalityType): SampleMeal[] {
  // This is a simplified version - in production, you'd have a large database
  const meals: Record<PersonalityType, SampleMeal[]> = {
    texture_detective: [
      {
        id: '1',
        name: 'Crispy Chicken Tenders with Crunchy Veggies',
        description: 'Consistently crunchy textures throughout',
        difficulty: 'easy',
        prepTime: 25,
        ingredients: ['Chicken breast', 'Panko breadcrumbs', 'Carrots', 'Celery'],
        whyItWorks: 'All textures are crunchy and predictable',
      },
      {
        id: '2',
        name: 'Smooth Banana Oat Smoothie',
        description: 'Completely smooth, no chunks',
        difficulty: 'easy',
        prepTime: 5,
        ingredients: ['Banana', 'Oats', 'Milk', 'Honey'],
        whyItWorks: 'Uniform smooth texture they can trust',
      },
    ],
    beige_brigade: [
      {
        id: '1',
        name: 'Cauliflower Mac & Cheese',
        description: 'Hidden veggies in a beige favorite',
        difficulty: 'easy',
        prepTime: 20,
        ingredients: ['Pasta', 'Cheese', 'Cauliflower', 'Milk'],
        whyItWorks: 'Looks and tastes like regular mac & cheese',
      },
    ],
    slow_explorer: [
      {
        id: '1',
        name: 'Build-Your-Own Taco Night',
        description: 'Familiar foods with optional new additions',
        difficulty: 'easy',
        prepTime: 30,
        ingredients: ['Tortillas', 'Ground meat', 'Cheese', 'Optional toppings'],
        whyItWorks: 'They control what goes on their plate',
      },
    ],
    visual_critic: [
      {
        id: '1',
        name: 'Rainbow Fruit Kabobs',
        description: 'Colorful, organized, beautiful',
        difficulty: 'easy',
        prepTime: 15,
        ingredients: ['Various colorful fruits', 'Skewers'],
        whyItWorks: 'Visually appealing presentation matters',
      },
    ],
    mix_master: [
      {
        id: '1',
        name: 'Bento Box Lunch',
        description: 'Everything separated and organized',
        difficulty: 'easy',
        prepTime: 15,
        ingredients: ['Protein', 'Carb', 'Veggies', 'Fruit', 'Dip'],
        whyItWorks: 'Clear boundaries between all foods',
      },
    ],
    flavor_seeker: [
      {
        id: '1',
        name: 'Homemade Chicken Tikka',
        description: 'Flavorful international cuisine',
        difficulty: 'medium',
        prepTime: 45,
        ingredients: ['Chicken', 'Yogurt', 'Spices', 'Rice'],
        whyItWorks: 'Bold flavors they crave',
      },
    ],
  };

  return meals[type] || [];
}

/**
 * Get progress pathway by personality type
 */
export function getProgressPathway(type: PersonalityType): ProgressStep[] {
  const pathways: Record<PersonalityType, ProgressStep[]> = {
    texture_detective: [
      {
        phase: 1,
        title: 'Texture Awareness (Weeks 1-4)',
        description: 'Identify and honor preferred textures',
        duration: '4 weeks',
        milestones: [
          'Create list of accepted textures',
          'Serve meals with consistent textures',
          'Introduce sensory play with food',
          'No pressure to eat new textures',
        ],
      },
      {
        phase: 2,
        title: 'Safe Exploration (Months 2-3)',
        description: 'Gradually introduce texture variations',
        duration: '2 months',
        milestones: [
          'Try one preferred texture prepared differently',
          'Celebrate touching/smelling new textures',
          'Involve in texture-focused food prep',
          'Build texture vocabulary',
        ],
      },
      {
        phase: 3,
        title: 'Expanding Comfort (Months 4-6)',
        description: 'Increase texture variety slowly',
        duration: '3 months',
        milestones: [
          'Accept 2-3 new texture preparations',
          'Try foods with dual textures (crispy outside, soft inside)',
          'Independently explore new textures',
          'Growing confidence at mealtimes',
        ],
      },
    ],
    beige_brigade: [
      {
        phase: 1,
        title: 'Optimize Current Diet (Weeks 1-4)',
        description: 'Make beige foods more nutritious',
        duration: '4 weeks',
        milestones: [
          'Switch to whole grain versions',
          'Add fortified foods',
          'Establish daily vitamin routine',
          'Reduce mealtime pressure',
        ],
      },
      {
        phase: 2,
        title: 'Color Introduction (Months 2-4)',
        description: 'Begin adding subtle colors',
        duration: '3 months',
        milestones: [
          'Add beige/tan vegetables',
          'Try one new color per month',
          'Use favorite dips for new colors',
          'Celebrate looking at colorful foods',
        ],
      },
      {
        phase: 3,
        title: 'Rainbow Expansion (Months 5-8)',
        description: 'Increase color variety gradually',
        duration: '4 months',
        milestones: [
          'Accept 1-2 colorful vegetables',
          'Try colorful fruits',
          'Eat rainbow plate once per week',
          'More balanced nutrition overall',
        ],
      },
    ],
    slow_explorer: [
      {
        phase: 1,
        title: 'Pressure-Free Exposure (Weeks 1-6)',
        description: 'Introduce new foods without eating expectations',
        duration: '6 weeks',
        milestones: [
          'Serve 2-3 new foods weekly (no pressure)',
          'Establish relaxed family meals',
          'Celebrate curiosity and questions',
          'Build positive mealtime associations',
        ],
      },
      {
        phase: 2,
        title: 'Gentle Exploration (Months 2-4)',
        description: 'Encourage interaction with new foods',
        duration: '3 months',
        milestones: [
          'Child touches/smells new foods voluntarily',
          'Takes first bites of 1-2 new foods',
          'Asks to help with food preparation',
          'Growing openness to trying new things',
        ],
      },
      {
        phase: 3,
        title: 'Expanding Palate (Months 5-9)',
        description: 'Building variety and confidence',
        duration: '5 months',
        milestones: [
          'Regularly tries new foods',
          'Accepts 5-10 previously refused foods',
          'Shows excitement about some new foods',
          'Significantly more adventurous',
        ],
      },
    ],
    visual_critic: [
      {
        phase: 1,
        title: 'Beautiful Plating (Weeks 1-4)',
        description: 'Focus on presentation excellence',
        duration: '4 weeks',
        milestones: [
          'Upgrade to appealing plates/containers',
          'Make current foods more attractive',
          'Involve child in food arrangement',
          'Create positive visual associations',
        ],
      },
      {
        phase: 2,
        title: 'Color Integration (Months 2-3)',
        description: 'Strategically add appealing colors',
        duration: '2 months',
        milestones: [
          'Add one beautiful new food per week',
          'Create rainbow arrangements',
          'Use cookie cutters and fun shapes',
          'Expanding accepted color palette',
        ],
      },
      {
        phase: 3,
        title: 'Beyond Appearance (Months 4-6)',
        description: 'Food acceptance based on more than looks',
        duration: '3 months',
        milestones: [
          'Willing to try "ugly" but delicious foods',
          'Focuses less on perfect presentation',
          'Expanding variety significantly',
          'More flexible about appearance',
        ],
      },
    ],
    mix_master: [
      {
        phase: 1,
        title: 'Separation Respect (Weeks 1-4)',
        description: 'Honor need for separated foods',
        duration: '4 weeks',
        milestones: [
          'Use divided plates consistently',
          'All sauces on the side',
          'Deconstruct complex meals',
          'Establish trust and respect',
        ],
      },
      {
        phase: 2,
        title: 'Controlled Mixing (Months 2-3)',
        description: 'Child-led food combination',
        duration: '2 months',
        milestones: [
          'They add their own sauces/dips',
          'Build-your-own meal nights',
          'Foods can touch briefly',
          'Growing confidence with proximity',
        ],
      },
      {
        phase: 3,
        title: 'Accepting Integration (Months 4-6)',
        description: 'Gradually tolerating mixed dishes',
        duration: '3 months',
        milestones: [
          'Tries one mixed dish per week',
          'Accepts some pre-mixed foods',
          'Less rigid about separation',
          'More flexible at restaurants',
        ],
      },
    ],
    flavor_seeker: [
      {
        phase: 1,
        title: 'Culinary Exploration (Weeks 1-4)',
        description: 'Encourage their adventurous spirit',
        duration: '4 weeks',
        milestones: [
          'Try one new cuisine per week',
          'Involve in meal planning',
          'Visit ethnic markets together',
          'Build on their enthusiasm',
        ],
      },
      {
        phase: 2,
        title: 'Cooking Skills (Months 2-4)',
        description: 'Develop their culinary abilities',
        duration: '3 months',
        milestones: [
          'Learn basic cooking techniques',
          'Experiment with seasonings',
          'Create own recipe variations',
          'Growing kitchen confidence',
        ],
      },
      {
        phase: 3,
        title: 'Food Leadership (Months 5+)',
        description: 'Become family food advocate',
        duration: 'Ongoing',
        milestones: [
          'Plan and cook family meals',
          'Introduce family to new foods',
          'Develop sophisticated palate',
          'Lifetime love of food established',
        ],
      },
    ],
  };

  return pathways[type] || [];
}
