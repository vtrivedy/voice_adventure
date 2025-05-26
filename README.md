# 🎮 Voice Adventure Game

A fun build-your-own-adventure game using **Vapi** for voice interaction and **Google's Imagen-3** for generating dynamic images as you progress through the story.

## 🏗️ Architecture

- **Frontend**: React + Vite with Vapi Web SDK for voice interaction
- **Backend**: FastAPI server that generates images using Google's Imagen-3 API
- **Voice Agent**: Vapi handles the conversation and calls our image generation function

## 🚀 Setup Instructions

### 1. Clone and Navigate
```bash
git clone <your-repo>
cd voice_adventure
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Setup environment variables
cp env_template.txt .env
# Edit .env and add your actual API keys (see below)
```

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Setup environment variables
cp env_template.txt .env
# Edit .env and add your actual values (see below)
```

### 4. Get Required API Keys

#### Google AI Studio (for Imagen-3)
1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Create an account/sign in
3. Go to "Get API Key" and create a new key
4. Add this to `backend/.env` as `GEMINI_API_KEY`

#### Vapi (for Voice Agent)
1. Go to [Vapi Dashboard](https://dashboard.vapi.ai/)
2. Create an account and get your public key
3. Create an assistant and note the assistant ID
4. Add these to `frontend/.env`:
   - `VITE_VAPI_PUBLIC_KEY`
   - `VITE_ASSISTANT_ID`

### 5. Configure Your Vapi Assistant

In your Vapi dashboard, configure your assistant with this function:

```json
{
  "name": "generate_scene",
  "description": "Generate a scene image and two option images for the adventure game",
  "parameters": {
    "type": "object",
    "properties": {
      "scene_prompt": {
        "type": "string",
        "description": "Description of the current scene to generate an image for"
      },
      "option_a": {
        "type": "string", 
        "description": "Description of option A to generate an image for"
      },
      "option_b": {
        "type": "string",
        "description": "Description of option B to generate an image for"
      }
    },
    "required": ["scene_prompt", "option_a", "option_b"]
  }
}
```

## 🎯 Running the Application

### Start Backend
```bash
cd backend
source .venv/bin/activate
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Start Frontend
```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173` to play the game!

## 🎮 How It Works

1. **Start Game**: Click "Start Game" to begin voice interaction with Vapi
2. **Voice Conversation**: Talk to the AI about what kind of adventure you want
3. **Scene Generation**: The AI will call the `generate_scene` function with prompts
4. **Image Creation**: Backend generates 3 images using Imagen-3:
   - Main scene image
   - Two option images (A & B)
5. **Continue Adventure**: Keep talking to explore different paths!

## 📁 Project Structure

```
voice_adventure/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── requirements.txt     # Python dependencies
│   ├── env_template.txt     # Environment template
│   └── static/             # Generated images (created automatically)
├── frontend/
│   ├── src/
│   │   └── App.jsx         # React app with Vapi integration
│   ├── env_template.txt    # Frontend environment template
│   └── package.json        # Node dependencies
└── README.md               # This file
```

## 🐛 Troubleshooting

### "Missing key inputs argument" Error
- Make sure `GEMINI_API_KEY` is set in `backend/.env`
- Verify your Google AI Studio API key is valid

### Frontend Can't Connect to Backend
- Ensure backend is running on port 8000
- Check `VITE_BACKEND_URL` in `frontend/.env`

### No Images Appearing
- Check browser console for errors
- Verify the Vapi assistant has the `generate_scene` function configured
- Check backend logs for image generation errors

## 🔧 Development Tips

- Backend logs will show detailed error messages
- Use `/health` endpoint to test backend connectivity
- Generated images are stored in `backend/static/`
- Frontend will update automatically when new images are generated 