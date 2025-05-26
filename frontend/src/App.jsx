import { useEffect, useState, useRef } from 'react';
import Vapi from '@vapi-ai/web';            // default import per SDK docs

export default function App() {
  /* ────────────────── runtime config ────────────────── */
  const vapiKey     = import.meta.env.VITE_VAPI_PUBLIC_KEY;
  const assistantId = import.meta.env.VITE_ASSISTANT_ID;
  const backendUrl  = import.meta.env.VITE_BACKEND_URL;

  // 🔧 DEBUG: Check environment variables
  console.log('🔧 Frontend Config Check:', {
    hasVapiKey: !!vapiKey,
    vapiKeyLength: vapiKey?.length,
    assistantId: assistantId,
    backendUrl: backendUrl
  });

  /* ────────────────── initialise SDK ────────────────── */
  const vapi = new Vapi(vapiKey);           // ctor takes only the key

  /* ────────────────── local UI state ────────────────── */
  const [scene, setScene] = useState(null);
  const [choices, setChoices] = useState([]);
  const [displayMode, setDisplayMode] = useState('none'); // 'none', 'scene', 'choices'
  const [isGenerating, setIsGenerating] = useState(false);
  const [isWaitingForAgent, setIsWaitingForAgent] = useState(false);
  const [error, setError] = useState(null);
  const [callStatus, setCallStatus] = useState('idle'); // idle, connecting, connected, ended
  const [processedCalls, setProcessedCalls] = useState(new Set()); // Track processed function calls
  const [messageCount, setMessageCount] = useState(0); // Track message count for debugging
  
  // Use a ref to track processed calls immediately (avoiding React state timing issues)
  const processedCallsRef = useRef(new Set());
  const processingCallsRef = useRef(new Set()); // Track calls currently being processed

  /* ────────────────── event wiring ────────────────── */
  useEffect(() => {
    console.log('🔧 Setting up Vapi listeners...');
    console.log('🔧 Vapi instance:', vapi);

    // Handle call state changes
    vapi.on('call-start', () => {
      console.log('📞 Call started - Vapi connected');
      setCallStatus('connected');
      setError(null);
      setProcessedCalls(new Set()); // Reset processed calls on new call
      processedCallsRef.current = new Set(); // Reset ref too
      processingCallsRef.current = new Set(); // Reset processing ref too
      setIsWaitingForAgent(false); // Reset waiting state
      setMessageCount(0); // Reset message count
    });

    vapi.on('call-end', () => {
      console.log('📞 Call ended');
      setCallStatus('ended');
      setProcessedCalls(new Set()); // Reset processed calls
      processedCallsRef.current = new Set(); // Reset ref too
      processingCallsRef.current = new Set(); // Reset processing ref too
      setIsWaitingForAgent(false); // Reset waiting state
      setMessageCount(0); // Reset message count
      setIsGenerating(false); // Reset generating state
      setScene(null); // Clear scene
      setChoices([]); // Clear choices
      setDisplayMode('none'); // Reset display mode
    });

    vapi.on('error', (err) => {
      console.error('❌ Vapi error:', err);
      setError(`Voice error: ${err.message || 'Unknown error'}`);
      setCallStatus('idle');
    });

    // Single consolidated message listener
    vapi.on('message', async (msg) => {
      const currentCount = messageCount + 1;
      setMessageCount(currentCount);
      console.log(`🎯 RAW Vapi message #${currentCount} received:`, msg);
      
      // Only process function calls
      if (msg.type !== 'function-call' && msg.type !== 'tool-calls') return;
      
      console.log(`🎯 Function call detected:`, msg);
      
      // Extract function call data based on message type
      let functionCall;
      let callId;
      
      if (msg.type === 'function-call') {
        functionCall = msg.functionCall;
        callId = functionCall.id;
        console.log(`📞 Function call format: function-call`);
        console.log(`📞 Raw functionCall:`, functionCall);
      } else if (msg.type === 'tool-calls' && msg.toolCalls && msg.toolCalls.length > 0) {
        // Convert tool-calls format to function-call format
        const toolCall = msg.toolCalls[0];
        callId = toolCall.id;
        console.log(`🔧 Tool call format: tool-calls`);
        console.log(`🔧 Raw toolCall:`, toolCall);
        console.log(`🔧 Tool function:`, toolCall.function);
        console.log(`🔧 Tool arguments:`, toolCall.function?.arguments);
        
        functionCall = {
          id: callId,
          name: toolCall.function?.name,
          parameters: JSON.stringify(toolCall.function?.arguments || {})
        };
        console.log(`🔧 Converted functionCall:`, functionCall);
      }
      
      if (!functionCall || !functionCall.name || !callId) {
        console.log('⚠️ No valid function call found in message');
        return;
      }

      // Prevent duplicate processing using ref (immediate check)
      if (processedCallsRef.current.has(callId)) {
        console.log(`🔄 Skipping duplicate function call: ${callId}`);
        return;
      }

      // Check if this call is currently being processed
      if (processingCallsRef.current.has(callId)) {
        console.log(`⏳ Call already being processed: ${callId}`);
        return;
      }

      // Check if we're already generating to prevent race conditions
      if (isGenerating) {
        console.log(`⏳ Already generating, skipping call: ${callId}`);
        return;
      }

      // Mark this call as being processed
      console.log(`🔒 Marking call as processing: ${callId}`);
      processingCallsRef.current.add(callId);
      
      // Mark this call as processed IMMEDIATELY to prevent race conditions
      console.log(`🔒 Marking call as processed: ${callId}`);
      
      // Add to ref immediately (synchronous)
      processedCallsRef.current.add(callId);
      
      // Also update state for UI consistency
      setProcessedCalls(prev => {
        const newSet = new Set([...prev, callId]);
        console.log(`✅ Updated state with processed call: ${callId}. Total processed: ${newSet.size}`);
        return newSet;
      });

      // Handle the new two-tool architecture
      if (!['generate_scene', 'generate_choices'].includes(functionCall.name)) {
        console.log('⚠️ Unknown function name:', functionCall.name);
        return;
      }

      console.log(`🎨 Processing function call: ${functionCall.name} (ID: ${callId})`);
      setIsGenerating(true);
      setError(null);

      try {
        // Parse parameters
        const args = JSON.parse(functionCall.parameters);
        console.log('📝 Function arguments:', args);

        // Validate arguments based on function type
        if (functionCall.name === 'generate_scene') {
          if (!args.scene_prompt) {
            throw new Error('Missing scene_prompt parameter');
          }
        } else if (functionCall.name === 'generate_choices') {
          const requiredFields = ['choice_a_prompt', 'choice_b_prompt', 'choice_a_text', 'choice_b_text'];
          const missingFields = requiredFields.filter(field => !args[field]);
          if (missingFields.length > 0) {
            console.error('❌ Missing required fields for generate_choices:', missingFields);
            console.error('❌ Received args:', args);
            throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
          }
        }

        if (functionCall.name === 'generate_scene') {
          // Handle single scene generation
          console.log('🌟 Generating single scene image');
          
          const response = await fetch(`${backendUrl}/api/generate_scene`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              scene_prompt: args.scene_prompt
            }),
          });

          if (!response.ok) {
            throw new Error(`Backend error: ${response.status} ${response.statusText}`);
          }

          const result = await response.json();
          console.log('📥 Scene generation result:', result);

          // Update UI for single scene display
          setScene(result.sceneURL);
          setChoices([]);
          setDisplayMode('scene');

          // Show waiting state during pause
          setIsWaitingForAgent(true);

          // Add a pause before sending success response to create breathing room
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second pause

          // Send success response back to Vapi with proper format
          const successResponse = {
            type: 'function-call-result',
            functionCallId: callId,
            result: {
              success: true,
              message: 'Scene complete. Now describe the scene and call generate_choices.',
              sceneURL: result.sceneURL
            }
          };

          console.log('📤 Sending success response to Vapi:', successResponse);
          vapi.send(successResponse);

          // Clear waiting state after sending response
          setIsWaitingForAgent(false);

        } else if (functionCall.name === 'generate_choices') {
          // Handle choice generation
          console.log('🔀 Generating choice images');
          
          try {
            const response = await fetch(`${backendUrl}/api/generate_choices`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                choice_a_prompt: args.choice_a_prompt,
                choice_b_prompt: args.choice_b_prompt,
                choice_a_text: args.choice_a_text,
                choice_b_text: args.choice_b_text
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`❌ Backend error response:`, errorText);
              throw new Error(`Backend error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();
            console.log('📥 Choice generation result:', result);

            // Update UI for choices display
            setScene(null);
            setChoices(result.choices);
            setDisplayMode('choices');

            // Show waiting state during pause
            setIsWaitingForAgent(true);

            // Add a pause before sending success response to create breathing room
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second pause

            // Send success response back to Vapi with proper format
            const successResponse = {
              type: 'function-call-result',
              functionCallId: callId,
              result: {
                success: true,
                message: 'Choices complete. Now present the two options to the user.',
                choices: result.choices
              }
            };

            console.log('📤 Sending success response to Vapi:', successResponse);
            vapi.send(successResponse);

            // Clear waiting state after sending response
            setIsWaitingForAgent(false);
            
          } catch (fetchError) {
            console.error('❌ Fetch error in generate_choices:', fetchError);
            throw fetchError; // Re-throw to be caught by outer try-catch
          }
        }

        console.log('✅ Function call processed successfully');

      } catch (err) {
        console.error('❌ Error processing function call:', err);
        setError(`Image generation failed: ${err.message}`);

        // Send error response back to Vapi with proper format
        const errorResponse = {
          type: 'function-call-result',
          functionCallId: callId,
          result: {
            success: false,
            error: err.message
          }
        };

        console.log('📤 Sending error response to Vapi:', errorResponse);
        vapi.send(errorResponse);
      } finally {
        setIsGenerating(false);
        // Remove from processing set when done
        processingCallsRef.current.delete(callId);
        console.log(`🧹 Removed ${callId} from processing set`);
      }
    });

    // Cleanup listeners on unmount
    return () => {
      vapi.removeAllListeners();
    };
  }, [backendUrl]);

  /* ────────────────── helpers ────────────────── */
  const startGame = async () => {
    if (!vapiKey || !assistantId) {
      setError('Missing Vapi configuration. Please check your .env file.');
      return;
    }

    try {
      setCallStatus('connecting');
      setError(null);
      setProcessedCalls(new Set()); // Reset on new game
      setIsWaitingForAgent(false); // Reset waiting state
      await vapi.start(assistantId);
    } catch (err) {
      console.error('❌ Failed to start call:', err);
      setError(`Failed to start voice call: ${err.message}`);
      setCallStatus('idle');
    }
  };

  const endGame = () => {
    vapi.stop();
    setCallStatus('idle');
    setScene(null);
    setChoices([]);
    setDisplayMode('none');
    setProcessedCalls(new Set()); // Reset processed calls
    setIsWaitingForAgent(false); // Reset waiting state
  };

  /* ────────────────── render helpers ────────────────── */
  const renderCallStatus = () => {
    switch (callStatus) {
      case 'connecting':
        return (
          <div className="text-center animate-pulse">
            <div className="relative inline-block">
              <div className="w-16 h-16 border-4 border-amber-300 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-amber-500 border-b-transparent rounded-full animate-spin mx-auto" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
            </div>
            <p className="text-amber-300 font-bold text-xl pixel-font">Summoning your guide...</p>
          </div>
        );
      case 'connected':
        return (
          <div className="text-center space-y-6">
            <div className="flex items-center justify-center space-x-3">
              <div className="w-4 h-4 bg-green-400 rounded-full animate-ping"></div>
              <div className="w-4 h-4 bg-green-400 rounded-full animate-ping" style={{ animationDelay: '0.2s' }}></div>
              <div className="w-4 h-4 bg-green-400 rounded-full animate-ping" style={{ animationDelay: '0.4s' }}></div>
            </div>
            <div className="bg-black/60 backdrop-blur-sm rounded-xl p-6 border-2 border-green-400 shadow-lg shadow-green-400/20">
              <p className="text-green-400 font-bold text-xl pixel-font mb-4">🎙️ ADVENTURE LINK ACTIVE</p>
              <p className="text-green-300 mb-4">Your voice agent is listening...</p>
              <button
                onClick={endGame}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-all duration-200 transform hover:scale-105 pixel-font border-2 border-red-400 shadow-lg shadow-red-600/30"
              >
                🚪 END QUEST
              </button>
            </div>
          </div>
        );
      case 'ended':
        return (
          <div className="text-center">
            <div className="bg-black/60 backdrop-blur-sm rounded-xl p-8 border-2 border-purple-400 shadow-lg shadow-purple-400/20 mb-6">
              <p className="text-purple-300 text-xl pixel-font mb-4">Quest Complete!</p>
              <p className="text-gray-300 mb-6">Ready for another adventure?</p>
              <button
                onClick={startGame}
                className="adventure-button pixel-font text-xl"
              >
                🗡️ NEW QUEST
              </button>
            </div>
          </div>
        );
      default:
        return (
          <div className="text-center space-y-8">
            {/* Epic Title */}
            <div className="relative">
              <h1 className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 pixel-font tracking-wider drop-shadow-2xl">
                ADVENTURE
              </h1>
              <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 pixel-font tracking-wider -mt-4">
                AGENT
              </h2>
              <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 rounded-lg blur opacity-20 animate-pulse"></div>
            </div>

            {/* Subtitle */}
            <div className="bg-black/70 backdrop-blur-sm rounded-xl p-6 border-2 border-amber-400 shadow-2xl shadow-amber-400/20 max-w-2xl mx-auto">
              <p className="text-amber-300 text-xl pixel-font mb-2">🎮 VOICE-POWERED ADVENTURES</p>
              <p className="text-gray-300 text-lg leading-relaxed">
                Embark on epic quests where your voice shapes the story and AI creates stunning visuals for every scene!
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="bg-gradient-to-br from-purple-900/80 to-blue-900/80 backdrop-blur-sm rounded-xl p-6 border border-purple-400 shadow-lg hover:shadow-purple-400/30 transition-all duration-300 transform hover:scale-105">
                <div className="text-4xl mb-3">🗣️</div>
                <h3 className="text-purple-300 font-bold pixel-font mb-2">VOICE CONTROL</h3>
                <p className="text-gray-300 text-sm">Speak your choices and watch the adventure unfold</p>
              </div>
              <div className="bg-gradient-to-br from-emerald-900/80 to-teal-900/80 backdrop-blur-sm rounded-xl p-6 border border-emerald-400 shadow-lg hover:shadow-emerald-400/30 transition-all duration-300 transform hover:scale-105">
                <div className="text-4xl mb-3">🎨</div>
                <h3 className="text-emerald-300 font-bold pixel-font mb-2">AI VISUALS</h3>
                <p className="text-gray-300 text-sm">Dynamic scenes generated by cutting-edge AI</p>
              </div>
              <div className="bg-gradient-to-br from-amber-900/80 to-orange-900/80 backdrop-blur-sm rounded-xl p-6 border border-amber-400 shadow-lg hover:shadow-amber-400/30 transition-all duration-300 transform hover:scale-105">
                <div className="text-4xl mb-3">⚔️</div>
                <h3 className="text-amber-300 font-bold pixel-font mb-2">EPIC QUESTS</h3>
                <p className="text-gray-300 text-sm">Unlimited adventures limited only by imagination</p>
              </div>
            </div>

            {/* Start Button */}
            <div className="relative">
              <button
                onClick={startGame}
                className="adventure-button pixel-font text-2xl relative z-10"
              >
                🚀 BEGIN ADVENTURE
              </button>
              <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl blur-xl opacity-30 animate-pulse"></div>
            </div>

            {/* Instructions */}
            <div className="bg-black/50 backdrop-blur-sm rounded-xl p-6 border border-gray-600 max-w-2xl mx-auto">
              <p className="text-gray-400 text-sm leading-relaxed">
                <span className="text-amber-400 font-bold">🎯 How to play:</span> Click to start, then simply talk to your AI guide! 
                Describe the adventure you want, make choices, and watch as your story comes to life with beautiful generated artwork.
              </p>
            </div>
          </div>
        );
    }
  };

  /* ────────────────── render ────────────────── */
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-800">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-700/20 via-transparent to-transparent"></div>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-amber-700/10 via-transparent to-transparent"></div>
        
        {/* Floating particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-amber-400 rounded-full animate-ping opacity-60"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            ></div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 gap-8">
        {/* Error Display */}
        {error && (
          <div className="w-full max-w-3xl p-4 bg-red-900/80 backdrop-blur-sm border-2 border-red-400 rounded-xl shadow-lg shadow-red-400/20">
            <div className="flex items-center space-x-3">
              <span className="text-red-400 text-xl">⚠️</span>
              <span className="text-red-200 pixel-font">{error}</span>
            </div>
          </div>
        )}

        {/* Call Status */}
        {renderCallStatus()}

        {/* Loading State */}
        {isGenerating && (
          <div className="text-center">
            <div className="relative inline-block mb-6">
              <div className="w-20 h-20 border-4 border-purple-400 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-2 w-16 h-16 border-4 border-amber-400 border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse' }}></div>
              <div className="absolute inset-4 w-12 h-12 border-4 border-emerald-400 border-r-transparent rounded-full animate-spin" style={{ animationDuration: '1.5s' }}></div>
            </div>
            <p className="text-purple-300 font-bold text-xl pixel-font animate-pulse">
              🎨 Crafting Your Adventure...
            </p>
            <p className="text-purple-200 text-sm mt-2">The AI is painting your story into existence</p>
          </div>
        )}

        {/* Waiting for Agent State */}
        {isWaitingForAgent && !isGenerating && (
          <div className="text-center">
            <div className="relative inline-block mb-6">
              <div className="w-16 h-16 border-4 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-2 w-12 h-12 border-4 border-emerald-300 border-b-transparent rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }}></div>
            </div>
            <p className="text-emerald-300 font-bold text-xl pixel-font animate-pulse">
              🎭 Your Guide Prepares...
            </p>
            <p className="text-emerald-200 text-sm mt-2">The Adventure Agent is crafting your next chapter</p>
          </div>
        )}

        {/* Single Scene Display */}
        {displayMode === 'scene' && scene && !isGenerating && (
          <div className="w-full max-w-5xl space-y-8">
            <div className="text-center">
              <div className="relative inline-block">
                <img
                  src={`${backendUrl}${scene}`}
                  alt="Adventure scene"
                  className="w-full max-w-4xl rounded-2xl shadow-2xl border-4 border-amber-400 shadow-amber-400/20"
                  onError={(e) => {
                    console.error('Failed to load scene image:', scene);
                    setError('Failed to load scene image');
                  }}
                />
                <div className="absolute -inset-1 bg-gradient-to-r from-amber-400 to-orange-500 rounded-2xl blur opacity-20"></div>
              </div>
            </div>

            {/* Scene Instructions */}
            <div className="text-center p-6 bg-black/70 backdrop-blur-sm rounded-xl border-2 border-emerald-400 shadow-lg shadow-emerald-400/20">
              <p className="text-emerald-300 pixel-font text-lg mb-2">
                🎤 CONTINUE YOUR STORY
              </p>
              <p className="text-gray-300 leading-relaxed">
                Describe what you want to do next or ask your guide to present you with choices!
              </p>
            </div>
          </div>
        )}

        {/* Choices Display */}
        {displayMode === 'choices' && choices.length > 0 && !isGenerating && (
          <div className="w-full max-w-6xl space-y-8">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 pixel-font mb-4">
                CHOOSE YOUR PATH
              </h2>
              <p className="text-gray-300 text-lg">Two paths diverge before you. Which will you take?</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {choices.map((choice, index) => (
                <div key={choice.label} className="group transform transition-all duration-300 hover:scale-105">
                  <div className="relative">
                    <img
                      src={`${backendUrl}${choice.url}`}
                      alt={choice.text}
                      className="w-full aspect-square object-cover rounded-xl shadow-xl border-2 border-purple-400 group-hover:border-amber-400 transition-colors duration-300"
                      onError={(e) => {
                        console.error('Failed to load choice image:', choice.url);
                      }}
                    />
                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-blue-500 group-hover:from-amber-400 group-hover:to-orange-500 rounded-xl blur opacity-20 transition-all duration-300"></div>
                  </div>
                  <div className="mt-4 text-center p-6 bg-black/60 backdrop-blur-sm rounded-xl border border-purple-400 group-hover:border-amber-400 transition-colors duration-300">
                    <span className="font-bold text-3xl text-purple-300 group-hover:text-amber-300 pixel-font transition-colors duration-300">
                      CHOICE {choice.label}
                    </span>
                    <p className="text-xl text-gray-200 mt-3 font-semibold">{choice.text}</p>
                    {choice.prompt && (
                      <p className="text-gray-400 text-sm mt-3 leading-relaxed italic">{choice.prompt}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Choice Instructions */}
            <div className="text-center p-6 bg-black/70 backdrop-blur-sm rounded-xl border-2 border-emerald-400 shadow-lg shadow-emerald-400/20">
              <p className="text-emerald-300 pixel-font text-lg mb-2">
                🎤 MAKE YOUR CHOICE
              </p>
              <p className="text-gray-300 leading-relaxed">
                Speak your choice aloud - say "Choice A", "Choice B", or describe which path you want to take!
              </p>
            </div>
          </div>
        )}
      </div>

      {/* CSS Styles */}
      <style jsx>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&display=swap');
        
        .pixel-font {
          font-family: 'Orbitron', monospace;
          text-shadow: 0 0 10px currentColor;
        }
        
        .adventure-button {
          @apply px-12 py-6 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500;
          @apply text-white font-black rounded-2xl transition-all duration-300 transform hover:scale-110;
          @apply border-4 border-amber-300 shadow-2xl shadow-amber-500/40 hover:shadow-amber-400/60;
          @apply relative overflow-hidden;
        }
        
        .adventure-button::before {
          content: '';
          @apply absolute inset-0 bg-gradient-to-r from-white/20 to-transparent;
          @apply transform translate-x-[-100%] hover:translate-x-[100%] transition-transform duration-700;
        }
        
        .adventure-button:active {
          @apply scale-95;
        }
      `}</style>
    </div>
  );
}
