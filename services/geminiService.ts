import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Recipe, UserPreferences } from "../types";

const apiKey = process.env.API_KEY;

if (!apiKey) {
  console.error("API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

/**
 * Step 1: Identify Ingredients from Image
 */
export const identifyIngredients = async (base64Image: string): Promise<string[]> => {
  try {
    // Switching to gemini-2.5-flash for stability and speed with Vision + JSON tasks.
    // The preview model was causing RPC/XHR errors with large payloads.
    const model = "gemini-2.5-flash";
    
    const schema: Schema = {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    };

    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: base64Image,
            },
          },
          {
            text: "Analyze this image. Return a JSON array of strings listing ONLY the food ingredients that are VISIBLE with 100% CERTAINTY. Do NOT guess. Do NOT list ingredients inside opaque containers. Do NOT list generic categories like 'vegetables'. Be specific (e.g., 'Red Bell Pepper'). If you are unsure about an item, DO NOT include it. I prefer fewer, accurate items over a long list of guesses. Ignore non-food items.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.1, // Low temperature for maximum determinism
      },
    });

    if (response.text) {
        try {
            const parsed = JSON.parse(response.text);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.warn("JSON parse failed, attempting cleanup", e);
            // Fallback cleanup if model returns markdown code blocks despite mimetype
            const cleanText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
            return JSON.parse(cleanText);
        }
    }
    return [];
  } catch (error) {
    console.error("Error identifying ingredients:", error);
    throw error;
  }
};

/**
 * Step 2: Generate Recipes
 */
export const generateRecipes = async (
  ingredients: string[],
  prefs: UserPreferences
): Promise<Recipe[]> => {
  try {
    const model = "gemini-2.5-flash"; 

    const recipeSchema: Schema = {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          prepTime: { type: Type.STRING },
          cookTime: { type: Type.STRING },
          difficulty: { type: Type.STRING, enum: ["Easy", "Medium", "Hard"] },
          vibeMatchScore: { type: Type.INTEGER },
          ingredients: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                quantity: { type: Type.STRING },
                inPantry: { type: Type.BOOLEAN },
              },
              required: ["name", "inPantry"]
            }
          },
          instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
          macros: {
            type: Type.OBJECT,
            properties: {
              calories: { type: Type.INTEGER },
              protein: { type: Type.INTEGER },
              carbs: { type: Type.INTEGER },
              fats: { type: Type.INTEGER },
            },
            required: ["calories", "protein", "carbs", "fats"]
          },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["title", "description", "ingredients", "instructions", "macros", "vibeMatchScore"]
      }
    };

    const prompt = `
      Role: Michelin Star Chef & Nutritional Strategist.
      Task: Create 3 unique, high-quality recipes based on the user's inventory and constraints.

      User Profile:
      - Name: ${prefs.userName}
      - Calorie Goal: ${prefs.calorieGoal} calories/day (Ensure meals fit within a reasonable portion of this).

      User Inventory: ${ingredients.length > 0 ? ingredients.join(", ") : "Staple pantry items (assume oil, salt, pepper, flour, sugar, pasta, rice)"}.
      
      Constraints:
      - Diet: ${prefs.diet}
      - Cuisine Style: ${prefs.cuisine}
      - Meal Type: ${prefs.mealType}
      - Vibe/Goal: ${prefs.vibe}
      - Allergies/Restrictions: ${prefs.allergies || "None"}

      Directives:
      1. Prioritize using the provided inventory.
      2. If ingredients are missing, assume the user will buy them (mark inPantry: false).
      3. Ensure recipes are realistically cookable but impressive.
      4. 'vibeMatchScore' (0-100) should reflect how well the recipe fits the requested Vibe and Cuisine.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: recipeSchema,
        temperature: 0.75, // Slightly higher for creativity
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text);
      return data.map((r: any) => ({ ...r, id: crypto.randomUUID() }));
    }
    return [];

  } catch (error) {
    console.error("Error generating recipes:", error);
    throw error;
  }
};

/**
 * Step 3: Generate Image
 */
export const generateRecipeImage = async (recipe: Recipe): Promise<string | null> => {
  try {
    const model = "gemini-2.5-flash-image"; 

    const prompt = `
      Create an award-winning, highly realistic food photography shot of the dish: "${recipe.title}".
      
      Visual Style: Modern Editorial Food Photography. 
      Lighting: Cinematic chiaroscuro lighting, soft window light coming from the left, deep shadows.
      Resolution: 8k, hyper-detailed texture.
      Composition: 45-degree angle or top-down.
      Details: Steam rising, visible moisture/glaze on food, fresh herbs garnishing.
      Plating: Elegant but rustic ceramic dishware, dark textured background (slate or wood).
      
      Ingredients to highlight: ${recipe.ingredients.slice(0, 5).map(i => i.name).join(', ')}.
      
      Strictly NO text, NO labels, NO graphics. Pure photorealism only.
    `;

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
};