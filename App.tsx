import React, { useState, useEffect, useRef } from 'react';
import { 
  Camera, ChefHat, ShoppingCart, Clock, Flame, Leaf, ArrowRight, 
  RefreshCw, Sparkles, Trash2, Scan, History, ArrowLeft, Save, X, 
  Settings, Utensils, Globe, AlertCircle, ChevronRight, Check, Upload, User, Zap
} from 'lucide-react';
import { Button } from './components/Button';
import { identifyIngredients, generateRecipes, generateRecipeImage } from './services/geminiService';
import { AppView, DietType, Ingredient, Recipe, UserPreferences, VibeType, CuisineType, MealType } from './types';

// --- Visual Assets & Icons ---
const DietIcons = {
  [DietType.Omnivore]: <Flame size={16} />,
  [DietType.Vegetarian]: <Leaf size={16} />,
  [DietType.Vegan]: <Leaf size={16} className="text-green-400" />,
  [DietType.Keto]: <Flame size={16} className="text-red-500" />,
  [DietType.Paleo]: <Flame size={16} className="text-orange-500" />,
  [DietType.GlutenFree]: <Leaf size={16} className="text-yellow-400" />,
  [DietType.Pescatarian]: <Sparkles size={16} className="text-blue-400" />,
};

export default function App() {
  // --- State ---
  const [view, setView] = useState<AppView>('onboarding');
  const [prefs, setPrefs] = useState<UserPreferences>({
    diet: DietType.Omnivore,
    vibe: VibeType.Quick,
    cuisine: CuisineType.Any,
    mealType: MealType.Any,
    allergies: '',
    userName: 'Chef',
    calorieGoal: 2000
  });
  
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [recipeHistory, setRecipeHistory] = useState<Recipe[]>([]);
  const [shoppingList, setShoppingList] = useState<string[]>([]);

  const [isScanning, setIsScanning] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [showHistorySidebar, setShowHistorySidebar] = useState(false);

  // --- Refs ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- Effects ---
  // Load history and prefs on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('fridgeForgeHistory');
    if (savedHistory) setRecipeHistory(JSON.parse(savedHistory));
    
    const savedShopping = localStorage.getItem('fridgeForgeShopping');
    if (savedShopping) setShoppingList(JSON.parse(savedShopping));

    const savedPrefs = localStorage.getItem('fridgeForgePrefs');
    if (savedPrefs) {
      setPrefs(JSON.parse(savedPrefs));
    }
  }, []);

  // Save state updates
  useEffect(() => {
    localStorage.setItem('fridgeForgeHistory', JSON.stringify(recipeHistory));
  }, [recipeHistory]);

  useEffect(() => {
    localStorage.setItem('fridgeForgeShopping', JSON.stringify(shoppingList));
  }, [shoppingList]);

  useEffect(() => {
    localStorage.setItem('fridgeForgePrefs', JSON.stringify(prefs));
  }, [prefs]);

  // --- Handlers ---
  const startCamera = async () => {
    setCapturedImage(null); // Clear previous capture
    setView('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error("Camera failed", err);
      alert("Unable to access camera. Please use upload.");
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const context = canvasRef.current.getContext('2d');
    if (context) {
      // Optimize Image Size: Limit max dimension to 800px to prevent huge payloads
      const MAX_DIMENSION = 800;
      let width = videoRef.current.videoWidth;
      let height = videoRef.current.videoHeight;
      
      if (width > height) {
        if (width > MAX_DIMENSION) {
          height = Math.round(height * (MAX_DIMENSION / width));
          width = MAX_DIMENSION;
        }
      } else {
        if (height > MAX_DIMENSION) {
          width = Math.round(width * (MAX_DIMENSION / height));
          height = MAX_DIMENSION;
        }
      }

      canvasRef.current.width = width;
      canvasRef.current.height = height;
      context.drawImage(videoRef.current, 0, 0, width, height);
      
      const dataUrl = canvasRef.current.toDataURL('image/jpeg', 0.80); // 80% quality
      const base64 = dataUrl.split(',')[1];
      setCapturedImage(dataUrl);
      stopCamera();
      await processImage(base64);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      const dataUrl = reader.result as string;
      
      // We still need to resize uploaded images to prevent massive payloads
      const img = new Image();
      img.onload = async () => {
        if (!canvasRef.current) return;
        const MAX_DIMENSION = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_DIMENSION) {
            height = Math.round(height * (MAX_DIMENSION / width));
            width = MAX_DIMENSION;
          }
        } else {
          if (height > MAX_DIMENSION) {
            width = Math.round(width * (MAX_DIMENSION / height));
            height = MAX_DIMENSION;
          }
        }

        canvasRef.current.width = width;
        canvasRef.current.height = height;
        const ctx = canvasRef.current.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const resizedDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.8);
        const base64 = resizedDataUrl.split(',')[1];
        
        setCapturedImage(resizedDataUrl);
        setView('camera');
        await processImage(base64);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  const processImage = async (base64: string) => {
    setIsScanning(true);
    try {
      const detected = await identifyIngredients(base64);
      setIngredients(detected);
      setView('ingredients');
    } catch (e) {
      console.error(e);
      alert("Failed to identify ingredients. Please try again.");
      setView('onboarding');
    } finally {
      setIsScanning(false);
    }
  };

  const handleGenerate = async () => {
    if (ingredients.length === 0) return;
    setIsGenerating(true);
    try {
      const results = await generateRecipes(ingredients, prefs);
      setRecipes(results);
      setView('results');

      // Automatically trigger background image generation for all recipes
      // We do not await this, so the UI updates immediately
      results.forEach(async (recipe) => {
        try {
          const url = await generateRecipeImage(recipe);
          if (url) {
            setRecipes(prev => prev.map(r => r.id === recipe.id ? { ...r, imageUrl: url, generatedImage: true } : r));
          }
        } catch (err) {
          console.error("Failed to auto-generate image for", recipe.title, err);
        }
      });

    } catch (e) {
      alert("Failed to generate recipes.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectRecipe = async (recipe: Recipe) => {
    setSelectedRecipe(recipe);
    setView('recipe-detail');
    // Fallback: If for some reason auto-gen failed or hasn't finished, try again on view
    if (!recipe.imageUrl && !recipe.generatedImage) {
      setIsGeneratingImage(true);
      const imageUrl = await generateRecipeImage(recipe);
      if (imageUrl) {
        const updated = { ...recipe, imageUrl, generatedImage: true };
        setSelectedRecipe(updated);
        setRecipes(prev => prev.map(r => r.id === recipe.id ? updated : r));
      }
      setIsGeneratingImage(false);
    }
  };

  const addToHistory = (recipe: Recipe) => {
    if (!recipeHistory.find(r => r.id === recipe.id)) {
      setRecipeHistory([recipe, ...recipeHistory]);
    }
  };

  // --- Reusable Components ---

  const SectionHeader = ({ icon, title }: { icon: React.ReactNode, title: string }) => (
    <div className="flex items-center gap-3 mb-6 pb-2 border-b border-white/10 mt-12 first:mt-0">
      <div className="text-neonBlue animate-pulse-slow">{icon}</div>
      <h2 className="text-2xl font-black tracking-tighter uppercase text-white">{title}</h2>
    </div>
  );

  const PreferenceSelect = ({ label, value, options, onChange, icon }: any) => (
    <div className="mb-4 group">
      <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2 group-hover:text-neonBlue transition-colors">
        {icon} {label}
      </label>
      <div className="flex flex-wrap gap-2">
        {Object.values(options).map((opt: any) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`px-4 py-3 text-xs font-mono uppercase border transition-all duration-300 hover:scale-105 ${
              value === opt 
              ? 'bg-neonBlue text-black border-neonBlue font-black shadow-[0_0_15px_rgba(0,243,255,0.4)] tracking-wider' 
              : 'bg-transparent border-white/10 text-gray-500 hover:border-white/40 hover:text-white hover:tracking-wide'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );

  // --- Views ---

  const Sidebar = () => (
    <div className="hidden md:flex w-72 flex-col border-r border-white/10 bg-black/60 backdrop-blur-xl h-full overflow-y-auto p-6 fixed left-0 top-0 bottom-0 z-20">
       <div className="mb-10">
          <h1 className="text-3xl font-black italic tracking-tighter mb-1 cursor-pointer hover:text-neonBlue transition-colors duration-500" onClick={() => setView('onboarding')}>
            FRIDGE<span className="text-neonBlue">FORGE</span>
          </h1>
          <p className="text-[9px] text-gray-500 font-mono tracking-[0.2em]">AI CULINARY SYSTEM</p>
       </div>

       <div className="space-y-8 flex-1">
          {/* Status Panel */}
          <div className="glass-panel p-4 rounded-none industrial-border hover:border-neonBlue/30 transition-colors duration-500">
              <div className="text-[10px] font-mono text-gray-500 mb-3 uppercase tracking-widest">SYSTEM STATUS</div>
              <div className="flex items-center justify-between mb-2 group">
                 <span className="text-xs text-white font-bold group-hover:text-neonBlue transition-colors">AGENT</span>
                 <span className="text-neonBlue font-mono text-xs uppercase tracking-wider">{prefs.userName || 'GUEST'}</span>
              </div>
              <div className="flex items-center justify-between group">
                 <span className="text-xs text-white font-bold group-hover:text-neonBlue transition-colors">INPUTS</span>
                 <span className="text-neonBlue font-mono text-xs">{ingredients.length} DETECTED</span>
              </div>
          </div>

          {/* Quick Nav */}
          <nav className="space-y-2">
             <Button variant="ghost" size="sm" className="w-full justify-start text-xs hover:translate-x-2 transition-transform duration-300" onClick={() => setView('ingredients')} icon={<Scan size={14}/>}>INVENTORY</Button>
             <Button variant="ghost" size="sm" className="w-full justify-start text-xs hover:translate-x-2 transition-transform duration-300" onClick={() => setView('history')} icon={<History size={14}/>}>RECIPE ARCHIVE</Button>
             <Button variant="ghost" size="sm" className="w-full justify-start text-xs hover:translate-x-2 transition-transform duration-300" onClick={() => setView('shopping-list')} icon={<ShoppingCart size={14}/>}>ACQUISITION</Button>
          </nav>

          {/* Mini Prefs Summary */}
          <div className="border-t border-white/10 pt-6">
             <div className="text-[10px] font-mono text-gray-500 mb-4 uppercase tracking-widest">Current Config</div>
             <div className="space-y-2 text-xs text-gray-400 font-mono">
                <div className="flex justify-between hover:text-white transition-colors"><span>GOAL</span> <span className="text-neonBlue">{prefs.calorieGoal} KCAL</span></div>
                <div className="flex justify-between hover:text-white transition-colors"><span>DIET</span> <span className="text-white">{prefs.diet}</span></div>
                <div className="flex justify-between hover:text-white transition-colors"><span>VIBE</span> <span className="text-white">{prefs.vibe}</span></div>
             </div>
             <Button variant="secondary" size="sm" className="w-full mt-6 text-[10px] tracking-widest hover:bg-white hover:text-black hover:border-transparent" onClick={() => setView('onboarding')}>RECONFIGURE</Button>
          </div>
       </div>
    </div>
  );

  const renderOnboarding = () => (
    <div className="flex flex-col md:flex-row h-full w-full animate-fade-in">
        {/* Left Side Hero (Desktop) */}
        <div className="hidden md:flex flex-1 bg-black items-center justify-center relative overflow-hidden border-r border-white/10">
            <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1606914501449-5a96b6ce24ca?auto=format&fit=crop&w=1600&q=80')] bg-cover bg-center opacity-20 scale-105 animate-pulse-slow"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent"></div>
            <div className="z-10 p-12 max-w-xl">
                <div className="inline-block px-3 py-1 border border-neonBlue/30 text-neonBlue text-[10px] font-mono mb-6 uppercase tracking-[0.2em] animate-slide-up">System Ready</div>
                <h1 className="text-8xl font-black tracking-tighter leading-[0.85] mb-8 text-white animate-slide-up" style={{animationDelay: '0.1s'}}>
                   FORGE <br/> 
                   <span className="text-transparent bg-clip-text bg-gradient-to-r from-neonBlue to-neonPurple text-glow">MASTERY</span>
                </h1>
                <p className="text-xl text-gray-400 font-light leading-relaxed max-w-md border-l-2 border-neonBlue/50 pl-6 animate-slide-up" style={{animationDelay: '0.2s'}}>
                    Advanced AI analysis of your available resources.
                    Zero waste. Maximum flavor. High-fidelity outputs.
                </p>
            </div>
        </div>

        {/* Right Side - Configuration */}
        <div className="flex-1 bg-[#050505] flex flex-col h-full overflow-y-auto custom-scrollbar">
            <div className="p-6 md:p-16 max-w-3xl mx-auto w-full">
                <div className="md:hidden mb-10 text-center">
                    <h1 className="text-5xl font-black tracking-tighter italic">FRIDGE<span className="text-neonBlue">FORGE</span></h1>
                </div>
                
                <div className="space-y-2 animate-slide-up" style={{animationDelay: '0.3s'}}>
                    
                    {/* Core Identity - Simplified */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 items-end">
                         <div className="group">
                            <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-2 group-hover:text-neonBlue transition-colors">
                                YOUR NAME
                            </label>
                            <input 
                                type="text" 
                                className="w-full bg-transparent border-b-2 border-white/20 py-2 text-3xl font-black text-white focus:border-neonBlue focus:outline-none transition-all placeholder-white/10 uppercase tracking-tight"
                                placeholder="CHEF"
                                value={prefs.userName}
                                onChange={(e) => setPrefs({...prefs, userName: e.target.value})}
                            />
                        </div>
                        <div className="group">
                            <div className="flex justify-between items-end mb-4">
                                <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest flex items-center gap-2 group-hover:text-neonBlue transition-colors">
                                    <Zap size={14}/> DAILY ENERGY TARGET
                                </label>
                                <span className="font-mono text-3xl font-black text-neonBlue tracking-tighter">
                                    {prefs.calorieGoal}<span className="text-xs text-gray-500 ml-1 font-normal align-middle">KCAL</span>
                                </span>
                            </div>
                            <div className="relative pt-2 pb-2">
                                <input 
                                    type="range" 
                                    min="1200"
                                    max="4000"
                                    step="50"
                                    value={prefs.calorieGoal}
                                    onChange={(e) => setPrefs({...prefs, calorieGoal: parseInt(e.target.value)})}
                                    className="w-full h-2 bg-white/10 rounded-none appearance-none cursor-pointer"
                                />
                                <div className="flex justify-between mt-2 opacity-50">
                                    <span className="text-[8px] font-mono text-gray-500">MIN</span>
                                    <span className="text-[8px] font-mono text-gray-500">MAX</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* System Configuration Section */}
                    <SectionHeader icon={<Settings size={20}/>} title="System Configuration" />
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-6">
                      <PreferenceSelect 
                          label="Dietary Mode" 
                          icon={<Leaf size={14}/>}
                          value={prefs.diet} 
                          options={DietType} 
                          onChange={(v: any) => setPrefs({...prefs, diet: v})} 
                      />
                      <PreferenceSelect 
                          label="Target Meal" 
                          icon={<Utensils size={14}/>}
                          value={prefs.mealType} 
                          options={MealType} 
                          onChange={(v: any) => setPrefs({...prefs, mealType: v})} 
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-2">
                      <PreferenceSelect 
                          label="Cuisine Module" 
                          icon={<Globe size={14}/>}
                          value={prefs.cuisine} 
                          options={CuisineType} 
                          onChange={(v: any) => setPrefs({...prefs, cuisine: v})} 
                      />
                      <PreferenceSelect 
                          label="Operational Vibe" 
                          icon={<Sparkles size={14}/>}
                          value={prefs.vibe} 
                          options={VibeType} 
                          onChange={(v: any) => setPrefs({...prefs, vibe: v})} 
                      />
                    </div>

                    <div className="mb-12 mt-6 group">
                         <label className="text-[10px] font-mono text-gray-400 uppercase tracking-widest mb-3 block group-hover:text-neonBlue transition-colors">Allergen Exclusions</label>
                         <input 
                            type="text" 
                            className="w-full bg-white/5 border border-white/10 p-5 text-white font-mono focus:border-neonBlue focus:outline-none transition-all placeholder-gray-700 text-lg hover:bg-white/10"
                            placeholder="E.G. PEANUTS, SHELLFISH (OPTIONAL)"
                            value={prefs.allergies}
                            onChange={(e) => setPrefs({...prefs, allergies: e.target.value})}
                         />
                    </div>

                    <div className="pt-8 border-t border-white/10 flex flex-col gap-4">
                        <Button onClick={startCamera} className="w-full h-16 text-xl font-black tracking-[0.2em] shadow-[0_0_20px_rgba(0,243,255,0.2)] hover:shadow-[0_0_40px_rgba(0,243,255,0.4)] transition-all duration-300 group" icon={<Camera size={24} className="group-hover:rotate-12 transition-transform" />}>
                          INITIATE VISUAL SCAN
                        </Button>
                        <Button 
                            variant="secondary" 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full h-12 text-sm tracking-widest hover:bg-white hover:text-black" 
                            icon={<Upload size={18} />}
                        >
                            UPLOAD SOURCE IMAGE
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    </div>
  );

  const renderIngredients = () => (
    <div className="flex flex-col h-full w-full bg-[#050505]">
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/50 backdrop-blur sticky top-0 z-20">
            <h2 className="text-xl font-black font-mono flex items-center gap-3 text-white uppercase tracking-tighter">
                <Scan className="text-neonBlue animate-pulse-slow" /> Inventory Matrix
            </h2>
            <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={startCamera} icon={<RefreshCw size={14}/>}>RESCAN</Button>
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
            <div className="max-w-6xl mx-auto">
                {/* Grid layout for ingredients */}
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-12 animate-slide-up">
                    {ingredients.map((ing, i) => (
                        <div key={i} className="group relative glass-panel p-4 flex items-center justify-between hover:border-neonBlue transition-all duration-300 hover:bg-white/10 hover:scale-105" style={{animationDelay: `${i * 0.05}s`}}>
                            <input 
                                type="text" 
                                value={ing} 
                                onChange={(e) => {
                                    const newIngs = [...ingredients];
                                    newIngs[i] = e.target.value;
                                    setIngredients(newIngs);
                                }}
                                className="bg-transparent border-none text-white w-full focus:ring-0 font-mono text-xs uppercase tracking-wider font-bold truncate"
                            />
                            <button 
                                onClick={() => setIngredients(ingredients.filter((_, idx) => idx !== i))}
                                className="text-gray-600 hover:text-red-500 transition-colors p-1"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                    <button 
                        onClick={() => setIngredients([...ingredients, "NEW ITEM"])}
                        className="p-4 border border-dashed border-white/20 text-gray-500 font-mono text-xs hover:border-neonBlue hover:text-neonBlue transition-all flex items-center justify-center gap-2 group uppercase hover:tracking-widest duration-300"
                    >
                        <span>+ Add Item</span>
                    </button>
                </div>

                <div className="max-w-xl mx-auto text-center">
                    <Button 
                        onClick={handleGenerate} 
                        isLoading={isGenerating} 
                        className="w-full h-20 text-xl font-black shadow-[0_0_30px_rgba(0,243,255,0.15)] tracking-[0.2em] hover:scale-105 transition-transform"
                        icon={<Sparkles size={24} className={isGenerating ? 'animate-spin' : ''}/>}
                        disabled={ingredients.length === 0}
                    >
                        {isGenerating ? 'FORGING RECIPES...' : 'GENERATE RECIPES'}
                    </Button>
                    {ingredients.length === 0 && (
                        <p className="text-center text-red-500 font-mono text-xs mt-4 flex items-center justify-center gap-2 animate-pulse">
                           <AlertCircle size={12} /> ERROR: NO INVENTORY DETECTED
                        </p>
                    )}
                </div>
            </div>
        </div>
    </div>
  );

  const renderResults = () => (
    <div className="h-full flex flex-col w-full bg-[#050505] overflow-y-auto">
        <div className="p-6 md:p-10 max-w-[1600px] mx-auto w-full animate-fade-in">
            <div className="flex items-center gap-4 mb-8 border-b border-white/10 pb-6">
                <button onClick={() => setView('ingredients')} className="p-2 hover:bg-white/10 rounded-full transition-colors text-white"><ArrowLeft size={24}/></button>
                <div>
                    <h2 className="text-4xl font-black tracking-tighter uppercase text-white">Generated Recipes</h2>
                    <p className="text-xs text-neonBlue font-mono tracking-widest mt-1">AI ANALYSIS COMPLETE • {recipes.length} MATCHES FOUND</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {recipes.map((recipe, i) => (
                    <div 
                        key={recipe.id} 
                        onClick={() => handleSelectRecipe(recipe)} 
                        className="group cursor-pointer relative bg-[#0a0a0a] border border-white/10 hover:border-neonBlue/50 transition-all duration-500 flex flex-col h-[550px] overflow-hidden shadow-2xl hover:shadow-[0_0_30px_rgba(0,0,0,0.6)] hover:-translate-y-2 animate-slide-up"
                        style={{animationDelay: `${i * 0.1}s`}}
                    >
                        {/* Image Area */}
                        <div className="h-3/5 bg-black relative overflow-hidden">
                            {recipe.imageUrl ? (
                                <img src={recipe.imageUrl} alt={recipe.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-900 to-black relative">
                                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-700 via-black to-black"></div>
                                    <div className="flex flex-col items-center gap-4">
                                        <Sparkles className="text-neonBlue animate-pulse" size={48} />
                                        <span className="text-[10px] font-mono text-neonBlue animate-pulse tracking-widest">GENERATING VISUALS...</span>
                                    </div>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent opacity-90"></div>
                            
                            <div className="absolute top-4 left-4 flex gap-2">
                                <span className={`text-[10px] font-bold font-mono px-3 py-1 bg-black/80 border uppercase backdrop-blur-sm tracking-wider ${
                                    recipe.difficulty === 'Easy' ? 'border-green-500 text-green-400' :
                                    recipe.difficulty === 'Medium' ? 'border-yellow-500 text-yellow-400' :
                                    'border-red-500 text-red-400'
                                }`}>
                                    {recipe.difficulty}
                                </span>
                                <span className="text-[10px] font-bold font-mono px-3 py-1 bg-black/80 border border-white/20 text-white uppercase backdrop-blur-sm tracking-wider flex items-center gap-1">
                                    <Clock size={10} /> {recipe.cookTime}
                                </span>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-8 flex-1 flex flex-col relative -mt-16 z-10">
                            <h3 className="text-3xl font-black mb-4 text-white group-hover:text-neonBlue transition-colors leading-[0.9] uppercase tracking-tight">{recipe.title}</h3>
                            <p className="text-sm text-gray-400 line-clamp-2 mb-6 flex-1 font-light leading-relaxed group-hover:text-gray-300 transition-colors">{recipe.description}</p>
                            
                            {/* Stats Grid */}
                            <div className="grid grid-cols-3 gap-2 mb-6">
                                <div className="bg-white/5 p-2 text-center border border-white/5 group-hover:border-white/20 transition-colors">
                                   <div className="text-[9px] text-gray-500 font-mono uppercase tracking-wider">CAL</div>
                                   <div className="text-lg font-black text-white">{recipe.macros.calories}</div>
                                </div>
                                <div className="bg-white/5 p-2 text-center border border-white/5 group-hover:border-white/20 transition-colors">
                                   <div className="text-[9px] text-gray-500 font-mono uppercase tracking-wider">PRO</div>
                                   <div className="text-lg font-black text-white">{recipe.macros.protein}g</div>
                                </div>
                                <div className="bg-white/5 p-2 text-center border border-white/5 group-hover:border-white/20 transition-colors">
                                   <div className="text-[9px] text-gray-500 font-mono uppercase tracking-wider">CARB</div>
                                   <div className="text-lg font-black text-white">{recipe.macros.carbs}g</div>
                                </div>
                            </div>
                            
                            <div className="flex items-center justify-between mt-auto border-t border-white/10 pt-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-32 h-1 bg-gray-800 overflow-hidden relative">
                                        <div className="absolute inset-0 bg-neonBlue opacity-20 animate-pulse"></div>
                                        <div className="h-full bg-neonBlue shadow-[0_0_10px_rgba(0,243,255,0.8)]" style={{width: `${recipe.vibeMatchScore}%`}}></div>
                                    </div>
                                    <span className="text-[10px] font-mono font-bold text-neonBlue">{recipe.vibeMatchScore}% MATCH</span>
                                </div>
                                <div className="p-2 rounded-full border border-white/10 group-hover:bg-neonBlue group-hover:text-black group-hover:border-neonBlue transition-all duration-300">
                                    <ArrowRight size={18} />
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
  );

  const renderRecipeDetail = () => {
      if (!selectedRecipe) return null;
      const missingIngredients = selectedRecipe.ingredients.filter(i => !i.inPantry);

      return (
        <div className="h-full w-full bg-[#050505] flex flex-col lg:flex-row overflow-hidden relative animate-fade-in">
            {/* Close Button */}
            <button 
                onClick={() => setView('results')} 
                className="absolute top-6 left-6 z-50 p-3 bg-black/50 backdrop-blur-md border border-white/10 rounded-full hover:bg-white/10 transition-all text-white hover:scale-110 hover:border-neonBlue"
            >
                <ArrowLeft size={24}/>
            </button>

            {/* Left Panel: Image */}
            <div className="w-full lg:w-1/2 h-[40vh] lg:h-full relative bg-black">
                {selectedRecipe.imageUrl ? (
                     <div className="w-full h-full relative group">
                        <img src={selectedRecipe.imageUrl} className="w-full h-full object-cover" alt={selectedRecipe.title} />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent lg:bg-gradient-to-r lg:from-transparent lg:to-[#050505]"></div>
                     </div>
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900">
                        {isGeneratingImage ? (
                            <div className="flex flex-col items-center gap-4">
                                <div className="w-16 h-16 border-t-2 border-neonBlue rounded-full animate-spin"></div>
                                <span className="font-mono text-sm text-neonBlue animate-pulse tracking-widest">RENDERING VISUALS...</span>
                            </div>
                        ) : (
                            <span className="font-mono text-gray-600">NO VISUAL DATA</span>
                        )}
                    </div>
                )}
            </div>

            {/* Right Panel: Details */}
            <div className="w-full lg:w-1/2 h-full overflow-y-auto p-6 md:p-16 bg-[#050505]">
                <div className="max-w-3xl mx-auto pt-8 lg:pt-16">
                    <div className="flex justify-between items-start mb-6">
                        <div className="space-y-4">
                            <div className="flex gap-2 flex-wrap">
                                {selectedRecipe.tags.slice(0,3).map(tag => (
                                    <span key={tag} className="px-3 py-1 text-[10px] font-mono border border-neonBlue/30 text-neonBlue uppercase tracking-wider font-bold">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                            <h1 className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-[0.85] text-white text-glow">{selectedRecipe.title}</h1>
                        </div>
                        <button onClick={() => { addToHistory(selectedRecipe); alert("Recipe Saved"); }} className="p-4 hover:bg-white/5 rounded-full border border-white/10 transition-all hover:border-neonBlue hover:text-neonBlue text-gray-400 hover:rotate-12">
                            <Save size={24} />
                        </button>
                    </div>

                    <p className="text-xl text-gray-400 leading-relaxed mb-12 border-l-2 border-neonPurple pl-8 font-light italic">
                        "{selectedRecipe.description}"
                    </p>

                    {/* Macros */}
                    <div className="grid grid-cols-4 gap-px bg-white/10 border border-white/10 mb-16">
                        {Object.entries(selectedRecipe.macros).map(([key, val]) => (
                            <div key={key} className="bg-[#050505] p-6 flex flex-col items-center justify-center group hover:bg-white/5 transition-colors">
                                <span className="text-[10px] font-mono text-gray-500 uppercase tracking-widest mb-1 group-hover:text-neonBlue transition-colors">{key}</span>
                                <span className="text-2xl font-black font-mono text-white">{val}</span>
                            </div>
                        ))}
                    </div>

                    {/* Two Column Content */}
                    <div className="space-y-16">
                        <div>
                            <h3 className="text-3xl font-black mb-8 flex items-center gap-4 uppercase tracking-tighter text-white border-b border-white/10 pb-4">
                                <ShoppingCart size={28} className="text-neonBlue"/> Components
                            </h3>
                            <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                                {selectedRecipe.ingredients.map((ing, i) => (
                                    <li key={i} className="flex items-center justify-between group border-b border-white/5 pb-3 hover:pl-2 transition-all">
                                        <div className="flex items-center gap-4">
                                            <span className={`w-2 h-2 rounded-sm rotate-45 ${ing.inPantry ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]'}`}></span>
                                            <span className="text-sm font-mono uppercase font-bold text-white">
                                                {ing.name}
                                            </span>
                                        </div>
                                        <span className="text-xs text-neonBlue font-mono tracking-wider">{ing.quantity}</span>
                                    </li>
                                ))}
                            </ul>
                            {missingIngredients.length > 0 && (
                                <Button 
                                    variant="danger" 
                                    className="mt-10 w-full h-14 tracking-widest font-bold"
                                    onClick={() => {
                                        const newItems = missingIngredients.map(i => i.name);
                                        setShoppingList(Array.from(new Set([...shoppingList, ...newItems])));
                                        alert(`Added ${newItems.length} items to acquisition list.`);
                                    }}
                                >
                                    ADD {missingIngredients.length} MISSING ITEMS TO LIST
                                </Button>
                            )}
                        </div>

                        <div>
                            <h3 className="text-3xl font-black mb-8 flex items-center gap-4 uppercase tracking-tighter text-white border-b border-white/10 pb-4">
                                <Flame size={28} className="text-neonBlue"/> Execution
                            </h3>
                            <div className="space-y-12 relative">
                                {/* Vertical Line */}
                                <div className="absolute left-5 top-5 bottom-5 w-px bg-gradient-to-b from-neonBlue via-white/10 to-transparent"></div>
                                
                                {selectedRecipe.instructions.map((step, i) => (
                                    <div key={i} className="relative pl-16 group">
                                        <div className="absolute left-0 top-0 w-10 h-10 flex items-center justify-center bg-[#050505] border border-neonBlue text-neonBlue font-mono font-bold text-lg z-10 shadow-[0_0_15px_rgba(0,243,255,0.3)] group-hover:scale-110 group-hover:bg-neonBlue group-hover:text-black transition-all duration-300">
                                            {i + 1}
                                        </div>
                                        <p className="text-gray-300 leading-relaxed text-lg font-light group-hover:text-white transition-colors">{step}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      );
  };

  const renderHistory = () => (
      <div className="h-full p-6 md:p-12 bg-[#050505] overflow-y-auto w-full animate-fade-in">
          <div className="max-w-5xl mx-auto">
              <div className="flex justify-between items-end mb-10 border-b border-white/10 pb-6">
                  <div>
                      <h2 className="text-4xl font-black uppercase tracking-tighter text-white">Recipe History</h2>
                      <p className="text-xs text-gray-500 font-mono mt-1 tracking-widest">SAVED RECIPES: {recipeHistory.length}</p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setRecipeHistory([])} icon={<Trash2 size={16}/>}>CLEAR ARCHIVE</Button>
              </div>

              <div className="space-y-6">
                  {recipeHistory.length === 0 && <div className="py-24 text-center text-gray-600 font-mono border-2 border-dashed border-white/10 uppercase tracking-widest">NO SAVED RECIPES</div>}
                  {recipeHistory.map((r, i) => (
                      <div key={r.id} onClick={() => handleSelectRecipe(r)} className="glass-panel p-0 flex items-stretch cursor-pointer group hover:border-neonBlue transition-all h-40 hover:-translate-x-2 duration-300 animate-slide-up" style={{animationDelay: `${i*0.05}s`}}>
                          <div className="w-32 md:w-56 bg-gray-900 relative overflow-hidden">
                              {r.imageUrl && <img src={r.imageUrl} className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-500 group-hover:scale-110" alt={r.title}/>}
                          </div>
                          <div className="p-8 flex-1 flex flex-col justify-center relative">
                              <div className="flex justify-between items-start mb-3">
                                  <h4 className="font-black text-2xl text-white group-hover:text-neonBlue transition-colors uppercase tracking-tight">{r.title}</h4>
                                  <ArrowRight className="text-gray-600 group-hover:text-neonBlue group-hover:translate-x-4 transition-all" size={24} />
                              </div>
                              <div className="flex gap-8 text-xs font-mono text-gray-500 uppercase tracking-wider">
                                  <span className="flex items-center gap-2 group-hover:text-white transition-colors"><Clock size={14}/> {r.cookTime}</span>
                                  <span className="flex items-center gap-2 group-hover:text-white transition-colors"><Flame size={14}/> {r.macros.calories} CAL</span>
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>
  );

  const renderShoppingList = () => (
    <div className="h-full p-6 md:p-12 bg-[#050505] overflow-y-auto w-full animate-fade-in">
        <div className="max-w-3xl mx-auto">
            <div className="mb-10 border-b border-white/10 pb-6">
                <h2 className="text-4xl font-black uppercase tracking-tighter text-white">Acquisition List</h2>
                <p className="text-xs text-gray-500 font-mono mt-1 tracking-widest">ITEMS PENDING: {shoppingList.length}</p>
            </div>

            {shoppingList.length === 0 ? (
                <div className="py-24 text-center text-gray-600 font-mono border-2 border-dashed border-white/10 uppercase tracking-widest">
                    LIST EMPTY. GENERATE RECIPES TO POPULATE.
                </div>
            ) : (
                <div className="grid gap-4">
                    {shoppingList.map((item, i) => (
                        <div key={i} className="glass-panel p-6 flex items-center justify-between group hover:bg-white/5 transition-colors animate-slide-up" style={{animationDelay: `${i*0.05}s`}}>
                             <div className="flex items-center gap-6">
                                 <div className="w-8 h-8 border-2 border-neonPurple/50 rounded-sm flex items-center justify-center cursor-pointer hover:bg-neonPurple/20 hover:border-neonPurple transition-all"
                                      onClick={() => {
                                          setShoppingList(shoppingList.filter(s => s !== item));
                                      }}>
                                     <div className="w-4 h-4 bg-transparent group-hover:bg-neonPurple transition-colors"></div>
                                 </div>
                                 <span className="font-mono uppercase tracking-widest text-xl text-white font-bold">{item}</span>
                             </div>
                             <button onClick={() => setShoppingList(shoppingList.filter(s => s !== item))} className="text-gray-600 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 duration-300">
                                 <Trash2 size={24} />
                             </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );

  const renderCamera = () => (
      <div className="h-full w-full bg-black relative flex flex-col animate-fade-in">
           <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden">
                {capturedImage ? (
                    <img src={capturedImage} className="absolute inset-0 w-full h-full object-cover opacity-50" alt="Captured" />
                ) : (
                    <video 
                      ref={videoRef} 
                      autoPlay 
                      playsInline 
                      className="absolute inset-0 w-full h-full object-cover"
                      onLoadedMetadata={() => videoRef.current?.play()}
                    />
                )}
                
                {/* Scanner UI */}
                <div className="absolute inset-0 pointer-events-none z-10">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[60%] border border-neonBlue/30">
                        <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-neonBlue shadow-[0_0_15px_rgba(0,243,255,0.5)]"></div>
                        <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-neonBlue shadow-[0_0_15px_rgba(0,243,255,0.5)]"></div>
                        <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-neonBlue shadow-[0_0_15px_rgba(0,243,255,0.5)]"></div>
                        <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-neonBlue shadow-[0_0_15px_rgba(0,243,255,0.5)]"></div>
                        {isScanning && <div className="w-full h-1 bg-neonBlue/80 shadow-[0_0_20px_rgba(0,243,255,1)] absolute animate-scan-line opacity-80"></div>}
                    </div>
                    
                    {/* Data Overlay */}
                    <div className="absolute top-8 right-8 font-mono text-xs text-neonBlue flex flex-col items-end gap-1 opacity-90">
                        <span className="bg-black/50 px-2 py-1 border border-neonBlue/30">MODE: {capturedImage ? 'STATIC_ANALYSIS' : 'LIVE_FEED'}</span>
                        <span className="bg-black/50 px-2 py-1 border border-neonBlue/30">ISO: AUTO</span>
                        {isScanning && <span className="animate-pulse bg-neonBlue text-black px-2 py-1 font-bold">PROCESSING...</span>}
                    </div>
                </div>

                {isScanning && (
                    <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-20 flex items-center justify-center flex-col">
                        <div className="w-32 h-32 border-t-4 border-neonBlue rounded-full animate-spin shadow-[0_0_30px_rgba(0,243,255,0.2)]"></div>
                        <div className="mt-8 font-mono text-2xl text-neonBlue animate-pulse tracking-[0.3em] font-bold">ANALYZING MATTER...</div>
                    </div>
                )}

                {/* Capture Controls */}
                {!isScanning && (
                  <div className="absolute bottom-10 left-0 right-0 flex justify-center z-20 pointer-events-auto gap-12 items-center">
                      <button onClick={() => { stopCamera(); setView('onboarding'); }} className="p-6 rounded-full bg-black/60 border border-white/20 text-white hover:bg-white/10 backdrop-blur-md hover:border-red-500 hover:text-red-500 transition-all">
                          <X size={24}/>
                      </button>
                      
                      {!capturedImage && (
                        <button 
                          onClick={handleCapture}
                          className="w-28 h-28 rounded-full border-4 border-white/20 bg-white/5 backdrop-blur-md flex items-center justify-center hover:bg-white/20 hover:border-neonBlue transition-all active:scale-90 shadow-[0_0_50px_rgba(0,0,0,0.8)] group"
                        >
                          <div className="w-24 h-24 rounded-full bg-white group-hover:scale-90 transition-transform duration-200"></div>
                        </button>
                      )}

                      <button onClick={() => fileInputRef.current?.click()} className="p-6 rounded-full bg-black/60 border border-white/20 text-white hover:bg-white/10 backdrop-blur-md hover:border-neonBlue hover:text-neonBlue transition-all">
                          <Upload size={24} />
                      </button>
                  </div>
                )}
           </div>
      </div>
  );

  // --- Main Layout Logic ---

  return (
    <div className="flex h-full w-full bg-[#020202] text-gray-200 font-sans selection:bg-neonBlue selection:text-black crt">
        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
        {/* Added canvas element for image capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Dynamic Background Gradient */}
        <div className="fixed inset-0 z-0 pointer-events-none">
             <div className="absolute top-0 left-1/4 w-96 h-96 bg-neonBlue/5 rounded-full blur-[150px] animate-pulse-slow"></div>
             <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-neonPurple/5 rounded-full blur-[150px] animate-pulse-slow" style={{animationDelay: '2s'}}></div>
        </div>

        {/* Desktop Sidebar (Hidden on 'camera' view) */}
        {view !== 'onboarding' && view !== 'camera' && <Sidebar />}

        {/* Desktop Layout Spacer */}
        <div className={`flex-1 relative z-10 h-full overflow-hidden flex flex-col transition-all duration-300 ${view !== 'onboarding' && view !== 'camera' ? 'md:pl-72' : ''}`}>
            {/* Mobile Nav Header */}
            <div className="md:hidden absolute top-0 left-0 right-0 h-16 bg-black/80 backdrop-blur-md border-b border-white/10 z-40 flex items-center justify-between px-4">
                <span className="font-black text-xl italic text-white">FRIDGE<span className="text-neonBlue">FORGE</span></span>
                <button onClick={() => setView('onboarding')} className="p-2 text-white"><Settings size={20}/></button>
            </div>

            {/* Main Content Views */}
            <main className="flex-1 h-full relative pt-16 md:pt-0">
                {view === 'onboarding' && renderOnboarding()}
                {view === 'camera' && renderCamera()}
                {view === 'ingredients' && renderIngredients()}
                {view === 'results' && renderResults()}
                {view === 'recipe-detail' && renderRecipeDetail()}
                {view === 'history' && renderHistory()}
                {view === 'shopping-list' && renderShoppingList()}
            </main>

            {/* Mobile Bottom Nav */}
            {view !== 'onboarding' && view !== 'camera' && view !== 'recipe-detail' && (
              <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black/90 backdrop-blur-lg border-t border-white/10 z-50 pb-safe">
                  <div className="flex justify-around items-center p-4">
                      <button onClick={() => setView('history')} className={`flex flex-col items-center gap-1 p-2 ${view === 'history' ? 'text-neonBlue' : 'text-gray-500'}`}>
                          <History size={20} />
                          <span className="text-[9px] font-mono tracking-widest mt-1">LOGS</span>
                      </button>
                      <button onClick={() => setView('ingredients')} className={`flex flex-col items-center gap-1 p-2 -mt-10 rounded-full bg-black border border-white/20 w-16 h-16 justify-center shadow-lg ${view === 'ingredients' ? 'border-neonBlue text-neonBlue shadow-[0_0_20px_rgba(0,243,255,0.4)]' : 'text-white'}`}>
                          <ChefHat size={24} />
                      </button>
                      <button onClick={() => setView('shopping-list')} className={`flex flex-col items-center gap-1 p-2 ${view === 'shopping-list' ? 'text-neonPurple' : 'text-gray-500'}`}>
                          <ShoppingCart size={20} />
                          <span className="text-[9px] font-mono tracking-widest mt-1">LIST</span>
                      </button>
                  </div>
              </nav>
            )}
        </div>
    </div>
  );
}