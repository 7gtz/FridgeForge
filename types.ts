export enum DietType {
  Omnivore = 'Omnivore',
  Vegetarian = 'Vegetarian',
  Vegan = 'Vegan',
  Keto = 'Keto',
  Paleo = 'Paleo',
  GlutenFree = 'Gluten Free',
  Pescatarian = 'Pescatarian'
}

export enum VibeType {
  Quick = 'Quick & Easy',
  Comfort = 'Cozy Comfort',
  Healthy = 'Clean & Lean',
  Gourmet = 'Gourmet',
  Budget = 'Budget Friendly',
  Spicy = 'Spicy & Bold'
}

export enum CuisineType {
  Any = 'Any Cuisine',
  Italian = 'Italian',
  Mexican = 'Mexican',
  Asian = 'Asian',
  Mediterranean = 'Mediterranean',
  American = 'American',
  Indian = 'Indian',
  French = 'French',
  MiddleEastern = 'Middle Eastern'
}

export enum MealType {
  Any = 'Any Meal',
  Breakfast = 'Breakfast',
  Lunch = 'Lunch',
  Dinner = 'Dinner',
  Snack = 'Snack',
  Dessert = 'Dessert'
}

export interface Ingredient {
  name: string;
  quantity?: string;
  inPantry: boolean;
}

export interface MacroNutrients {
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  prepTime: string;
  cookTime: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  vibeMatchScore: number; // 0-100
  ingredients: Ingredient[];
  instructions: string[];
  macros: MacroNutrients;
  imageUrl?: string; // Base64 or URL
  generatedImage?: boolean;
  tags: string[];
}

export interface UserPreferences {
  diet: DietType;
  vibe: VibeType;
  cuisine: CuisineType;
  mealType: MealType;
  allergies: string;
  userName: string;
  calorieGoal: number;
}

export type AppView = 'onboarding' | 'camera' | 'ingredients' | 'results' | 'recipe-detail' | 'history' | 'shopping-list';