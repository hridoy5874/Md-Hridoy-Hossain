# Hridoy (হৃদয়) - Advanced AI Assistant

An advanced Bengali voice assistant with continuous listening, image generation, and location awareness, powered by Google Gemini API.

## Features
- **Voice Interaction**: Speak in Bengali and get voice responses.
- **Image Generation**: Ask to create images and it will generate them using Gemini 2.5 Flash Image.
- **Location Awareness**: Ask about nearby places or directions, and it uses your location to provide context-aware answers.
- **Continuous Listening**: Toggle continuous mode for hands-free interaction.
- **Image Upload**: Upload images and ask questions about them.

## Prerequisites
- Node.js (v18 or higher recommended)
- A Google Gemini API Key

## Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone <your-repo-url>
   cd <your-repo-name>
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Environment Variables:**
   Create a `.env` file in the root directory and add your Gemini API key:
   ```env
   GEMINI_API_KEY="your_actual_api_key_here"
   ```
   *(Note: Do not commit the `.env` file to GitHub. It is already included in `.gitignore`)*

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open in Browser:**
   Navigate to `http://localhost:3000` in your web browser.

## Deployment
To build the app for production:
```bash
npm run build
```
The compiled files will be in the `dist` directory, which can be deployed to any static hosting service like GitHub Pages, Vercel, or Netlify.
