import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Mic, MicOff, Plus, MessageSquare, Image as ImageIcon, Send, Menu, X, Loader2, Volume2 } from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type Message = { id: string; role: 'user' | 'model'; text: string; image?: string };
type Session = { id: string; title: string; messages: Message[] };

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([{ id: '1', title: 'নতুন চ্যাট', messages: [] }]);
  const [activeSessionId, setActiveSessionId] = useState('1');
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<{data: string, mimeType: string} | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);

  const activeSession = sessions.find(s => s.id === activeSessionId) || sessions[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession.messages, isProcessing]);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'bn-BD';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = async (event: any) => {
        const text = event.results[0][0].transcript;
        setIsListening(false);
        await handleSend(text);
      };
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => {
        setIsListening(false);
        if (continuousMode && !isProcessing && !synthRef.current.speaking) {
          setTimeout(() => {
            try { recognition.start(); } catch (e) {}
          }, 300);
        }
      };
      recognitionRef.current = recognition;
    }
  }, [continuousMode, isProcessing, activeSessionId]);

  const toggleVoiceMode = () => {
    if (continuousMode) {
      setContinuousMode(false);
      recognitionRef.current?.stop();
      synthRef.current.cancel();
    } else {
      setContinuousMode(true);
      try { recognitionRef.current?.start(); } catch(e){}
    }
  };

  const speak = (text: string) => {
    synthRef.current.cancel();
    const utterance = new SpeechSynthesisUtterance(text.replace(/\*/g, ''));
    utterance.lang = 'bn-BD';
    utterance.onend = () => {
      if (continuousMode) {
        setTimeout(() => {
          try { recognitionRef.current?.start(); } catch(e){}
        }, 500);
      }
    };
    synthRef.current.speak(utterance);
  };

  const getLocation = (): Promise<GeolocationPosition | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { enableHighAccuracy: true });
    });
  };

  const handleSend = async (text: string = input) => {
    if (!text.trim() && !attachment) return;
    
    const newUserMsg: Message = { 
      id: Date.now().toString(), 
      role: 'user', 
      text, 
      image: attachment ? `data:${attachment.mimeType};base64,${attachment.data}` : undefined 
    };
    
    let updatedMessages = [...activeSession.messages, newUserMsg];
    
    let newTitle = activeSession.title;
    if (updatedMessages.length === 1) {
      newTitle = text.substring(0, 20) + (text.length > 20 ? '...' : '');
    }

    setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, title: newTitle, messages: updatedMessages } : s));
    setInput('');
    const currentAttachment = attachment;
    setAttachment(null);
    setIsProcessing(true);
    recognitionRef.current?.stop();

    try {
      const isImageGenRequest = text.includes('ছবি তৈরি') || text.includes('ছবি আঁক') || text.includes('generate image');
      const isLocationRequest = text.includes('কোথায়') || text.includes('লোকেশন') || text.includes('গাড়ি') || text.includes('কোথায়');

      let aiResponseText = '';
      let generatedImage = '';

      if (isImageGenRequest) {
        const parts: any[] = [{ text }];
        if (currentAttachment) {
          parts.push({ inlineData: { data: currentAttachment.data, mimeType: currentAttachment.mimeType } });
        }
        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: { parts }
        });
        
        for (const part of result.candidates?.[0]?.content?.parts || []) {
          if (part.inlineData) {
            generatedImage = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          } else if (part.text) {
            aiResponseText += part.text;
          }
        }
        if (!aiResponseText) aiResponseText = 'আপনার ছবিটি তৈরি করা হয়েছে।';
      } else {
        const parts: any[] = [{ text }];
        if (currentAttachment) {
          parts.push({ inlineData: { data: currentAttachment.data, mimeType: currentAttachment.mimeType } });
        }

        let config: any = {
          systemInstruction: 'You are Hridoy, an advanced Bengali AI assistant. Respond in Bengali. Keep it conversational and helpful.',
        };

        if (isLocationRequest) {
          const pos = await getLocation();
          if (pos) {
            config.tools = [{ googleMaps: {} }];
            config.toolConfig = {
              retrievalConfig: {
                latLng: { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
              }
            };
            if (pos.coords.speed !== null && pos.coords.speed > 0) {
              const speedKmh = Math.round(pos.coords.speed * 3.6);
              parts.push({ text: `[System Note: User's current speed is ${speedKmh} km/h. They might be in a vehicle.]` });
            }
          }
        }

        const result = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: { parts },
          config
        });
        aiResponseText = result.text || 'দুঃখিত, বুঝতে পারিনি।';
      }

      const newModelMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: aiResponseText,
        image: generatedImage || undefined
      };

      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, newModelMsg] } : s));
      speak(aiResponseText);

    } catch (error) {
      console.error(error);
      const errorMsg: Message = { id: Date.now().toString(), role: 'model', text: 'দুঃখিত, একটি ত্রুটি হয়েছে।' };
      setSessions(prev => prev.map(s => s.id === activeSessionId ? { ...s, messages: [...s.messages, errorMsg] } : s));
      if (continuousMode) {
        setTimeout(() => { try { recognitionRef.current?.start(); } catch(e){} }, 1000);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      setAttachment({ data: base64String, mimeType: file.type });
    };
    reader.readAsDataURL(file);
  };

  const createNewChat = () => {
    const newId = Date.now().toString();
    setSessions([{ id: newId, title: 'নতুন চ্যাট', messages: [] }, ...sessions]);
    setActiveSessionId(newId);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-10 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} fixed md:relative z-20 w-64 h-full bg-slate-900 text-slate-300 transition-transform duration-300 ease-in-out flex flex-col shrink-0`}>
        <div className="p-4 flex justify-between items-center border-b border-slate-800">
          <h2 className="text-xl font-bold text-white">হৃদয় (Hridoy)</h2>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="p-4">
          <button onClick={createNewChat} className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-white py-2 px-4 rounded-lg transition-colors">
            <Plus className="w-5 h-5" /> নতুন চ্যাট
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {sessions.map(s => (
            <div 
              key={s.id} 
              onClick={() => { setActiveSessionId(s.id); if (window.innerWidth < 768) setSidebarOpen(false); }}
              className={`px-4 py-3 cursor-pointer flex items-center gap-3 border-l-4 transition-colors ${activeSessionId === s.id ? 'bg-slate-800 border-blue-500 text-white' : 'border-transparent hover:bg-slate-800/50'}`}
            >
              <MessageSquare className="w-4 h-4 shrink-0" />
              <span className="truncate text-sm">{s.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full relative w-full min-w-0">
        {/* Header */}
        <header className="bg-white shadow-sm p-4 flex items-center gap-4 z-10">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden text-slate-600">
            <Menu className="w-6 h-6" />
          </button>
          <h1 className="text-lg font-semibold text-slate-800 truncate">{activeSession.title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <button 
              onClick={toggleVoiceMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${continuousMode ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {continuousMode ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              <span className="hidden sm:inline">{continuousMode ? 'ভয়েস মোড অন' : 'ভয়েস মোড অফ'}</span>
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar bg-slate-50">
          {activeSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-blue-500" />
              </div>
              <p className="text-lg font-medium text-slate-600">হৃদয়-এর সাথে কথা বলুন</p>
              <p className="text-sm mt-2 text-center max-w-xs">ভয়েস মোড অন করে কথা বলতে পারেন, অথবা নিচে টাইপ করুন। ছবি তৈরি করতে বা লোকেশন জানতে জিজ্ঞেস করুন।</p>
            </div>
          ) : (
            activeSession.messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-4 shadow-sm relative group ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                  {msg.role === 'model' && (
                    <button 
                      onClick={() => speak(msg.text)}
                      className="absolute -right-10 top-2 p-2 text-slate-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="আবার শুনুন"
                    >
                      <Volume2 className="w-5 h-5" />
                    </button>
                  )}
                  {msg.image && (
                    <img src={msg.image} alt="Attachment" className="max-w-full h-auto rounded-lg mb-3 object-cover max-h-64" />
                  )}
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {msg.text.split('\n').map((line, i) => <p key={i}>{line.replace(/\*\*/g, '')}</p>)}
                  </div>
                </div>
              </div>
            ))
          )}
          {isProcessing && (
            <div className="flex justify-start">
              <div className="bg-white rounded-2xl rounded-tl-none p-4 shadow-sm border border-slate-100 flex items-center gap-2 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" /> হৃদয় ভাবছে...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-slate-200">
          {attachment && (
            <div className="mb-3 flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-lg w-fit">
              <ImageIcon className="w-4 h-4" />
              <span className="text-sm font-medium">ছবি যুক্ত করা হয়েছে</span>
              <button onClick={() => setAttachment(null)} className="ml-2 text-blue-400 hover:text-blue-600"><X className="w-4 h-4" /></button>
            </div>
          )}
          <div className="flex items-end gap-2 max-w-4xl mx-auto">
            <label className="shrink-0 p-3 text-slate-400 hover:text-blue-500 hover:bg-blue-50 rounded-full cursor-pointer transition-colors">
              <ImageIcon className="w-6 h-6" />
              <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
            </label>
            
            <div className="flex-1 bg-slate-100 rounded-2xl relative flex items-center">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="হৃদয়কে কিছু লিখুন..."
                className="w-full bg-transparent border-none focus:ring-0 resize-none py-3 px-4 max-h-32 min-h-[48px] outline-none"
                rows={1}
              />
            </div>

            <button
              onClick={() => handleSend()}
              disabled={(!input.trim() && !attachment) || isProcessing}
              className="shrink-0 p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
