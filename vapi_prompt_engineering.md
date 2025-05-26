## FINAL ULTRA-SIMPLE System Prompt for Vapi Assistant

```
You are the Adventure Agent. You create voice adventures with AI images.

[CRITICAL TIMING RULES]
1. When you call a tool, STOP TALKING IMMEDIATELY
2. WAIT for the tool to complete before speaking again
3. NEVER speak while tools are running
4. Tools ALWAYS work - never assume failure

[EXACT CONVERSATION PATTERN]

**Starting:**
User: "I want [adventure type]"
You: "Perfect! Creating your adventure now."
→ STOP TALKING → CALL generate_scene → WAIT
→ "You find yourself [brief scene]. Two paths await."
→ STOP TALKING → CALL generate_choices → WAIT
→ "Choose: [Option A] or [Option B]?"

**After Choice:**
User: "[choice]"
You: "Great choice!"
→ STOP TALKING → CALL generate_scene → WAIT
→ "[Brief result]. What's next?"
→ STOP TALKING → CALL generate_choices → WAIT
→ "Choose: [Option A] or [Option B]?"

[TOOL CALL RULES]
- generate_scene: Describe scene AFTER tool completes
- generate_choices: Present options AFTER tool completes
- NEVER continue speaking after calling a tool
- WAIT for success response before continuing

[ABSOLUTELY FORBIDDEN]
- ❌ Speaking while tools are running
- ❌ "Something is interfering" or retry language
- ❌ Skipping generate_choices after generate_scene
- ❌ Long descriptions before tool calls
- ❌ Continuing to speak after calling tools

[EXAMPLE WITH EXACT TIMING]
User: "Fantasy adventure"
You: "Perfect! Creating your fantasy adventure now."
[STOP] → [CALL generate_scene] → [WAIT] → [SUCCESS]
You: "You stand in a mystical forest. Two paths await."
[STOP] → [CALL generate_choices] → [WAIT] → [SUCCESS]
You: "Choose: Follow the river or Enter the cave?"

User: "River"
You: "Great choice!"
[STOP] → [CALL generate_scene] → [WAIT] → [SUCCESS]
You: "The river leads to a waterfall. What's next?"
[STOP] → [CALL generate_choices] → [WAIT] → [SUCCESS]
You: "Choose: Swim through or Climb around?"

REMEMBER: STOP talking after every tool call. WAIT for completion. Then continue.
```

## Simplified Tool Configuration for Vapi

### Tool 1: generate_scene
```json
{
  "type": "function",
  "function": {
    "name": "generate_scene",
    "description": "Generate one scene image. Call this when starting adventures or after user makes a choice.",
    "parameters": {
      "type": "object",
      "properties": {
        "scene_prompt": {
          "type": "string",
          "description": "Visual description of the scene. Include art style, setting, atmosphere, and key details. Example: 'A mystical forest at twilight, glowing mushrooms, ancient trees, fantasy art style'"
        }
      },
      "required": ["scene_prompt"]
    }
  }
}
```

### Tool 2: generate_choices
```json
{
  "type": "function", 
  "function": {
    "name": "generate_choices",
    "description": "Generate two choice images. ALWAYS call this after generate_scene. Required for every decision point.",
    "parameters": {
      "type": "object",
      "properties": {
        "choice_a_prompt": {
          "type": "string",
          "description": "Visual description of first choice/path. Show what this option leads to."
        },
        "choice_b_prompt": {
          "type": "string", 
          "description": "Visual description of second choice/path. Must contrast with choice A."
        },
        "choice_a_text": {
          "type": "string",
          "description": "Short action text for choice A (2-4 words). Example: 'Enter the cave'"
        },
        "choice_b_text": {
          "type": "string",
          "description": "Short action text for choice B (2-4 words). Example: 'Follow the path'"
        }
      },
      "required": ["choice_a_prompt", "choice_b_prompt", "choice_a_text", "choice_b_text"]
    }
  }
}
```

## Vapi Assistant Configuration

### Request Messages (CRITICAL FOR TIMING)
- **Request Start Message**: "Creating your visual..."
- **Request Complete Message**: "Visual ready!"

### Settings
- ✅ Enable "Wait for message to be spoken before triggering tool call"
- ⏱️ Tool call timeout: 60 seconds
- 🔄 Max retries: 1

## Expected Flow After All Fixes

1. **User**: "I want a space adventure"
2. **Agent**: "Perfect! Creating your space adventure now."
3. **[Agent STOPS talking]**
4. **[Request Start]**: "Creating your visual..."
5. **[generate_scene called]** → 1 second pause
6. **[Request Complete]**: "Visual ready!"
7. **Agent**: "You're aboard a starship approaching an alien planet. Two paths await."
8. **[Agent STOPS talking]**
9. **[Request Start]**: "Creating your visual..."
10. **[generate_choices called]** → 1 second pause  
11. **[Request Complete]**: "Visual ready!"
12. **Agent**: "Choose: Land near the signal or Scan from orbit?"
13. **User**: "Land near the signal"
14. **Agent**: "Great choice!"
15. **[Repeat from step 3]**

**Key Improvements:**
- ✅ Single message listener (no duplicates)
- ✅ Ultra-short system prompt (no confusion)
- ✅ Simplified tool descriptions
- ✅ Clearer success messages
- ✅ Mandatory generate_choices after every scene
- ✅ No long descriptions before tool calls

## Debugging Agent Flow Issues

### If agent doesn't call generate_choices:
1. Check if agent is getting confused by long descriptions
2. Verify system prompt emphasizes "STOP TALKING → CALL generate_choices"
3. Ensure success messages are clear about next steps

### If agent speaks while tools are running:
1. Check if "Wait for message to be spoken" is enabled in Vapi
2. Verify request start/complete messages are configured
3. Ensure agent understands STOP TALKING command

### If agent skips the pattern:
1. Agent should ALWAYS follow: Scene → Description → Choices → Options
2. Check if agent is receiving proper success confirmations
3. Verify tool call timing in logs

### Console Debug Commands:
```javascript
// Check if agent is following pattern
console.log('Last tool call:', processedCalls);
console.log('Current display mode:', displayMode);
console.log('Is generating:', isGenerating);
```

### Expected Log Pattern:
```
🎯 Function call detected: generate_scene
📥 Scene generation result: success
📤 Sending success response: Scene complete
🎯 Function call detected: generate_choices  
📥 Choice generation result: success
📤 Sending success response: Choices complete
```

## Conversation Flow Examples

### Example 1: Fantasy Adventure Start
```
Agent: "Welcome, brave soul! What kind of adventure stirs your heart today?"
User: "I want a fantasy adventure with magic and dragons!"
Agent: "Magnificent! Let me set the stage for your epic quest..."

[generate_scene: "A towering medieval castle perched on a cliff overlooking a vast mystical valley, purple storm clouds gathering overhead with lightning crackling between ancient spires, a dragon's silhouette visible in the distance, cinematic fantasy art style, dramatic lighting"]

Agent: "You stand before the ancient Castle of Storms, where legends say a powerful artifact lies hidden. The very air crackles with magic, and in the distance, you glimpse the shadow of an ancient dragon. Your quest begins here, but how will you approach this legendary fortress?"

[generate_choices: 
A: "The main gate of the castle, massive oak doors reinforced with iron, two stone gargoyles flanking the entrance, torchlight flickering from within, welcoming but potentially dangerous"
B: "A hidden cave entrance at the base of the cliff, partially concealed by hanging vines, mysterious blue light emanating from within, secretive and mysterious path"
A_text: "Approach the main gate"
B_text: "Find the secret entrance"]

Agent: "Two paths present themselves. Will you boldly approach the main gate and announce your presence, or seek the shadows and find a more secretive way inside?"
```

### Example 2: Sci-Fi Adventure
```
Agent: "The cosmos awaits! What draws you to the stars?"
User: "I want to explore alien worlds and discover new civilizations!"
Agent: "Excellent! Let me show you where your journey begins..."

[generate_scene: "A sleek silver spaceship interior with holographic star maps floating in the air, large viewport showing a vibrant nebula with three unknown planets visible, advanced control panels with alien symbols glowing softly, futuristic sci-fi art style"]

Agent: "You're aboard the starship Horizon, approaching the Kepler system where three mysterious worlds orbit a dying star. Your sensors detect signs of civilization on two of the planets, but something else entirely on the third. Which world calls to your explorer's spirit?"

[generate_choices:
A: "A lush green planet with sprawling cities visible from orbit, geometric patterns suggesting advanced architecture, peaceful blue oceans and white clouds"
B: "A red desert planet with massive crystalline structures jutting from the surface, strange energy readings emanating from geometric formations, alien and mysterious"
A_text: "Explore the green world"
B_text: "Investigate the crystal planet"]
```

## Key Success Factors

1. **Timing**: Always generate scene first, then narrate, then generate choices
2. **Contrast**: Make choices visually and thematically distinct
3. **Consistency**: Maintain art style and world logic throughout
4. **Engagement**: Use dramatic language and create emotional investment
5. **Pacing**: Allow natural pauses for image generation and user processing
6. **Flexibility**: Adapt to user preferences and unexpected responses

This system creates a cinematic, interactive storytelling experience where every choice feels meaningful and every scene comes to life! 