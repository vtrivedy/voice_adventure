import os, uuid
from io import BytesIO
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ValidationError
from PIL import Image
from google import genai
from google.genai import types
from dotenv import load_dotenv
from typing import List, Dict, Any, Optional
import json

#grab Gemini key from env var and init client
load_dotenv()
# Validate required environment variables
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    raise ValueError(
        "GEMINI_API_KEY environment variable is required! "
        "Please set it in your .env file or environment."
    )
client = genai.Client(api_key=GEMINI_API_KEY)

#set up fastapi app and add middleware (where to allow/accept requests from)
app = FastAPI(title="Voice Adventure API")
# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create static directory and mount it for serving images
# As images are made as part of the story gen process they'll be stored here and shown on screen
os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Legacy model for backward compatibility
class SceneReq(BaseModel):
    scene_prompt: str
    option_a: str
    option_b: str

# for each turn between the user and vapi agent, we define Pydantic models to define the inputs/outputs Ex:
# Took Calls to Imagen, Input message
# New models for the two-tool architecture
class GenerateSceneReq(BaseModel):
    scene_prompt: str

class GenerateChoicesReq(BaseModel):
    choice_a_prompt: str
    choice_b_prompt: str
    choice_a_text: str
    choice_b_text: str

# Vapi request/response models - match actual Vapi format
class VapiFunction(BaseModel):
    name: Optional[str] = None
    arguments: Optional[Dict[str, Any]] = None

class VapiToolCall(BaseModel):
    id: Optional[str] = None
    type: Optional[str] = None
    function: Optional[VapiFunction] = None

class VapiMessage(BaseModel):
    type: Optional[str] = None
    toolCallList: Optional[List[VapiToolCall]] = None

class VapiRequest(BaseModel):
    message: Optional[VapiMessage] = None

class VapiResult(BaseModel):
    toolCallId: str
    result: str

class VapiResponse(BaseModel):
    results: List[VapiResult]

# Simple test endpoint for Vapi connectivity
class TestReq(BaseModel):
    test_message: str

@app.post("/test_vapi")
async def test_vapi(req: TestReq):
    """Simple test endpoint to verify Vapi can reach our backend"""
    print(f"🎯 Vapi test received: {req.test_message}")
    return {
        "status": "success",
        "message": f"Backend received: {req.test_message}",
        "timestamp": "2025-05-25T03:30:00Z"
    }

# Add raw request logger to see what Vapi actually sends
@app.post("/debug/raw")
async def debug_raw_request(request: Request):
    """Debug endpoint to see raw requests from Vapi"""
    try:
        body = await request.body()
        headers = dict(request.headers)
        
        print("🔍 === RAW REQUEST DEBUG ===")
        print(f"Headers: {headers}")
        print(f"Body (raw): {body}")
        print(f"Body (decoded): {body.decode('utf-8')}")
        
        try:
            json_body = json.loads(body.decode('utf-8'))
            print(f"Body (parsed JSON): {json.dumps(json_body, indent=2)}")
        except:
            print("Body is not valid JSON")
            
        print("🔍 === END RAW REQUEST ===")
        
        return {"status": "logged", "body_length": len(body)}
    except Exception as e:
        print(f"Error in debug endpoint: {e}")
        return {"error": str(e)}

#overall helper function for generating an image and saving in locally
def make_image(prompt: str) -> str:
    try:
        resp = client.models.generate_images(
            model="imagen-3.0-generate-002",
            prompt=prompt,
            config=types.GenerateImagesConfig(number_of_images=1)
        )
        img_bytes = resp.generated_images[0].image.image_bytes
        img = Image.open(BytesIO(img_bytes))
        filename = f"{uuid.uuid4()}.png"
        path = f"static/{filename}"
        img.save(path)
        return f"/static/{filename}"  # Return the correct static URL
    except Exception as e:
        print(f"Error generating image for prompt '{prompt}': {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate image: {str(e)}")

import asyncio
from functools import partial

# New endpoint for single scene generation
@app.post("/api/generate_scene")
async def api_generate_scene(req: GenerateSceneReq):
    """Generate a single scene image"""
    try:
        print(f"🎨 Generating single scene image:")
        print(f"  Scene: {req.scene_prompt}")
        
        loop = asyncio.get_event_loop()
        scene_url = await loop.run_in_executor(None, make_image, req.scene_prompt)
        
        result = {
            "type": "scene",
            "sceneURL": scene_url,
            "scene_prompt": req.scene_prompt
        }
        print(f"✅ Single scene generation successful: {result}")
        return result
    except Exception as e:
        print(f"❌ Error in api_generate_scene: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# New endpoint for choice generation
@app.post("/api/generate_choices")
async def api_generate_choices(req: GenerateChoicesReq):
    """Generate two choice images side by side"""
    try:
        print(f"🎨 Generating choice images:")
        print(f"  Choice A: {req.choice_a_prompt}")
        print(f"  Choice B: {req.choice_b_prompt}")
        
        loop = asyncio.get_event_loop()
        make = partial(make_image)

        # Generate both choice images concurrently
        a_img, b_img = await asyncio.gather(
            loop.run_in_executor(None, make, req.choice_a_prompt),
            loop.run_in_executor(None, make, req.choice_b_prompt),
        )

        result = {
            "type": "choices",
            "choices": [
                {
                    "label": "A", 
                    "text": req.choice_a_text,
                    "url": a_img, 
                    "prompt": req.choice_a_prompt
                },
                {
                    "label": "B", 
                    "text": req.choice_b_text,
                    "url": b_img, 
                    "prompt": req.choice_b_prompt
                },
            ],
        }
        print(f"✅ Choice generation successful: {result}")
        return result
    except Exception as e:
        print(f"❌ Error in api_generate_choices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Legacy endpoint for backward compatibility
@app.post("/generate_scene")
async def generate_scene(req: SceneReq):
    try:
        print(f"🎨 Legacy generate_scene with prompts:")
        print(f"  Scene: {req.scene_prompt}")
        print(f"  Option A: {req.option_a}")
        print(f"  Option B: {req.option_b}")
        
        loop = asyncio.get_event_loop()
        make = partial(make_image)

        # run all three blocking calls concurrently in default thread-pool
        scene, a_img, b_img = await asyncio.gather(
            loop.run_in_executor(None, make, req.scene_prompt),
            loop.run_in_executor(None, make, req.option_a),
            loop.run_in_executor(None, make, req.option_b),
        )

        result = {
            "sceneURL": scene,
            "options": [
                {"label": "A", "url": a_img, "prompt": req.option_a},
                {"label": "B", "url": b_img, "prompt": req.option_b},
            ],
        }
        print(f"✅ Legacy scene generation successful: {result}")
        return result
    except Exception as e:
        print(f"❌ Error in legacy generate_scene: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Vapi-compatible endpoint for generate_scene tool
@app.post("/vapi/generate_scene", response_model=VapiResponse)
async def vapi_generate_scene(request: Request):
    """
    Vapi-compatible endpoint for generate_scene function.
    Generates a single atmospheric scene image.
    """
    try:
        # Log raw request for debugging
        body = await request.body()
        print(f"🎯 Raw Vapi generate_scene request: {body.decode('utf-8')}")
        
        # Try to parse the request
        try:
            json_data = json.loads(body.decode('utf-8'))
            req = VapiRequest(**json_data)
        except ValidationError as ve:
            print(f"❌ Validation error: {ve}")
            return VapiResponse(results=[VapiResult(
                toolCallId="error",
                result=f"Request validation failed: {str(ve)}"
            )])
        except Exception as pe:
            print(f"❌ Parse error: {pe}")
            return VapiResponse(results=[VapiResult(
                toolCallId="error", 
                result=f"Request parsing failed: {str(pe)}"
            )])
        
        print(f"🎯 Parsed Vapi generate_scene request: {req}")
        
        # Handle missing message or toolCallList
        if not req.message or not req.message.toolCallList:
            print("⚠️ No tool calls found in request")
            return VapiResponse(results=[VapiResult(
                toolCallId="error",
                result="No tool calls found in request"
            )])
        
        # Process each tool call in the request
        results = []
        
        for tool_call in req.message.toolCallList:
            if not tool_call.function or not tool_call.function.name or not tool_call.id:
                print(f"⚠️ Invalid tool call: {tool_call}")
                continue
                
            # Extract from nested function object
            function_name = tool_call.function.name
            function_args = tool_call.function.arguments or {}
            
            print(f"🎨 Processing tool call: {function_name} (ID: {tool_call.id})")
            
            if function_name == "generate_scene":
                # Handle single scene generation
                scene_prompt = function_args.get("scene_prompt", "A mysterious adventure scene...")
                
                print(f"🌟 Generating scene: {scene_prompt}")
                
                # Generate scene image
                loop = asyncio.get_event_loop()
                scene_url = await loop.run_in_executor(None, make_image, scene_prompt)

                result_str = f"Scene generated successfully! Image URL: {scene_url}"
                
                results.append(VapiResult(
                    toolCallId=tool_call.id,
                    result=result_str
                ))
                
                print(f"✅ Scene generation successful for tool call {tool_call.id}")
                
            else:
                print(f"⚠️ Unknown tool call: {function_name}")
                results.append(VapiResult(
                    toolCallId=tool_call.id,
                    result=f"Unknown tool: {function_name}"
                ))
        
        response = VapiResponse(results=results)
        print(f"📤 Returning Vapi generate_scene response: {response}")
        return response
        
    except Exception as e:
        print(f"❌ Error in vapi_generate_scene: {e}")
        import traceback
        traceback.print_exc()
        # Return error in Vapi format
        return VapiResponse(results=[VapiResult(
            toolCallId="error",
            result=f"Server error: {str(e)}"
        )])

# Vapi-compatible endpoint for generate_choices tool
@app.post("/vapi/generate_choices", response_model=VapiResponse)
async def vapi_generate_choices(request: Request):
    """
    Vapi-compatible endpoint for generate_choices function.
    Generates two contrasting choice images.
    """
    try:
        # Log raw request for debugging
        body = await request.body()
        print(f"🎯 Raw Vapi generate_choices request: {body.decode('utf-8')}")
        
        # Try to parse the request
        try:
            json_data = json.loads(body.decode('utf-8'))
            req = VapiRequest(**json_data)
        except ValidationError as ve:
            print(f"❌ Validation error: {ve}")
            return VapiResponse(results=[VapiResult(
                toolCallId="error",
                result=f"Request validation failed: {str(ve)}"
            )])
        except Exception as pe:
            print(f"❌ Parse error: {pe}")
            return VapiResponse(results=[VapiResult(
                toolCallId="error", 
                result=f"Request parsing failed: {str(pe)}"
            )])
        
        print(f"🎯 Parsed Vapi generate_choices request: {req}")
        
        # Handle missing message or toolCallList
        if not req.message or not req.message.toolCallList:
            print("⚠️ No tool calls found in request")
            return VapiResponse(results=[VapiResult(
                toolCallId="error",
                result="No tool calls found in request"
            )])
        
        # Process each tool call in the request
        results = []
        
        for tool_call in req.message.toolCallList:
            if not tool_call.function or not tool_call.function.name or not tool_call.id:
                print(f"⚠️ Invalid tool call: {tool_call}")
                continue
                
            # Extract from nested function object
            function_name = tool_call.function.name
            function_args = tool_call.function.arguments or {}
            
            print(f"🎨 Processing tool call: {function_name} (ID: {tool_call.id})")
            
            if function_name == "generate_choices":
                # Handle choice generation
                choice_a_prompt = function_args.get("choice_a_prompt", "Option A")
                choice_b_prompt = function_args.get("choice_b_prompt", "Option B")
                choice_a_text = function_args.get("choice_a_text", "Choice A")
                choice_b_text = function_args.get("choice_b_text", "Choice B")
                
                print(f"🔀 Generating choices:")
                print(f"  Choice A: {choice_a_prompt} ({choice_a_text})")
                print(f"  Choice B: {choice_b_prompt} ({choice_b_text})")
                
                # Generate both choice images
                loop = asyncio.get_event_loop()
                make = partial(make_image)

                a_img, b_img = await asyncio.gather(
                    loop.run_in_executor(None, make, choice_a_prompt),
                    loop.run_in_executor(None, make, choice_b_prompt),
                )

                result_str = f"Choices generated successfully! Choice A ({choice_a_text}): {a_img}, Choice B ({choice_b_text}): {b_img}"
                
                results.append(VapiResult(
                    toolCallId=tool_call.id,
                    result=result_str
                ))
                
                print(f"✅ Choice generation successful for tool call {tool_call.id}")
                
            else:
                print(f"⚠️ Unknown tool call: {function_name}")
                results.append(VapiResult(
                    toolCallId=tool_call.id,
                    result=f"Unknown tool: {function_name}"
                ))
        
        response = VapiResponse(results=results)
        print(f"📤 Returning Vapi generate_choices response: {response}")
        return response
        
    except Exception as e:
        print(f"❌ Error in vapi_generate_choices: {e}")
        import traceback
        traceback.print_exc()
        # Return error in Vapi format
        return VapiResponse(results=[VapiResult(
            toolCallId="error",
            result=f"Server error: {str(e)}"
        )])

@app.get("/health")
async def health_check():
    return {"status": "healthy", "message": "Voice Adventure API is running!"}

if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host=host, port=port)