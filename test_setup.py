#!/usr/bin/env python3
"""
Simple test script to verify the Voice Adventure setup.
Run this after setting up your environment variables.
"""

import os
import sys
from pathlib import Path

def check_env_file(path, required_vars):
    """Check if environment file exists and has required variables."""
    if not path.exists():
        return False, f"Missing {path}"
    
    content = path.read_text()
    missing_vars = []
    
    for var in required_vars:
        if f"{var}=" not in content or f"{var}=your_" in content:
            missing_vars.append(var)
    
    if missing_vars:
        return False, f"Missing/unfilled variables in {path}: {', '.join(missing_vars)}"
    
    return True, "OK"

def main():
    print("🔍 Testing Voice Adventure Setup...\n")
    
    # Check backend
    print("📦 Backend checks:")
    backend_env = Path("backend/.env")
    backend_ok, backend_msg = check_env_file(backend_env, ["GEMINI_API_KEY"])
    print(f"  Environment file: {backend_msg}")
    
    # Check if virtual env exists
    venv_path = Path("backend/.venv")
    if venv_path.exists():
        print("  Virtual environment: ✅ Found")
    else:
        print("  Virtual environment: ❌ Missing (run setup.sh)")
    
    # Check frontend
    print("\n🎮 Frontend checks:")
    frontend_env = Path("frontend/.env")
    frontend_ok, frontend_msg = check_env_file(frontend_env, ["VITE_VAPI_PUBLIC_KEY", "VITE_ASSISTANT_ID"])
    print(f"  Environment file: {frontend_msg}")
    
    # Check if node_modules exists
    node_modules = Path("frontend/node_modules")
    if node_modules.exists():
        print("  Node modules: ✅ Found")
    else:
        print("  Node modules: ❌ Missing (run npm install)")
    
    # Overall status
    print("\n🎯 Overall Status:")
    if backend_ok and frontend_ok:
        print("✅ Setup looks good! You can try starting the servers.")
        print("\nTo start:")
        print("  Backend:  cd backend && source .venv/bin/activate && uvicorn main:app --reload")
        print("  Frontend: cd frontend && npm run dev")
    else:
        print("❌ Setup incomplete. Please check the issues above.")
        print("\n💡 Quick fix: Run ./setup.sh and then edit the .env files with your API keys")

if __name__ == "__main__":
    main() 