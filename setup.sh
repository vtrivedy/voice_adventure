#!/bin/bash

echo "🎮 Setting up Voice Adventure Game..."

# Backend setup
echo "📦 Setting up backend..."
cd backend

# Create .env from template if it doesn't exist
if [ ! -f .env ]; then
    cp env_template.txt .env
    echo "✅ Created backend/.env from template"
    echo "⚠️  Please edit backend/.env and add your GEMINI_API_KEY"
else
    echo "⚠️  backend/.env already exists"
fi

# Install Python dependencies
if [ ! -d ".venv" ]; then
    echo "📦 Creating Python virtual environment..."
    python -m venv .venv
    echo "✅ Virtual environment created"
fi

echo "📦 Installing Python dependencies..."
source .venv/bin/activate
pip install -r requirements.txt
echo "✅ Backend dependencies installed"

# Frontend setup
echo "📦 Setting up frontend..."
cd ../frontend

# Create .env from template if it doesn't exist
if [ ! -f .env ]; then
    cp env_template.txt .env
    echo "✅ Created frontend/.env from template"
    echo "⚠️  Please edit frontend/.env and add your Vapi credentials"
else
    echo "⚠️  frontend/.env already exists"
fi

# Install Node dependencies
if [ ! -d "node_modules" ]; then
    echo "📦 Installing Node dependencies..."
    npm install
    echo "✅ Frontend dependencies installed"
else
    echo "⚠️  node_modules already exists, skipping npm install"
fi

cd ..

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Get your Google AI Studio API key from: https://aistudio.google.com/"
echo "2. Add it to backend/.env as GEMINI_API_KEY"
echo "3. Get your Vapi credentials from: https://dashboard.vapi.ai/"
echo "4. Add them to frontend/.env"
echo "5. Configure your Vapi assistant with the generate_scene function (see README.md)"
echo ""
echo "To start the servers:"
echo "Backend:  cd backend && source .venv/bin/activate && uvicorn main:app --reload"
echo "Frontend: cd frontend && npm run dev" 