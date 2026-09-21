import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import Index from "./pages/Index";
import Home from "./pages/Home";
import NotFound from "./pages/NotFound";
import Arrangement from "./pages/Arrangement";
import AudioDiagnostic from "./pages/AudioDiagnostic";
import PianoFaithful from "./pages/PianoFaithful";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        {import.meta.env.DEV && <div className="border-b border-violet-800 bg-violet-950 px-5 py-2 text-right"><Link to="/dev/audio-diagnostic" className="inline-flex rounded-lg border border-violet-400 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-800">Analyze Arrangement (DEV)</Link></div>}
        <Routes>
          <Route path="/" element={<><Home /><div className="bg-[#120e1d] px-6 pb-12 text-center"><Link className="inline-block rounded-xl border border-violet-500 px-6 py-3 text-violet-200 hover:bg-violet-900/40" to="/ai-arrangement">AI Piano Arrangement · Upload MP3/WAV <span className="ml-2 text-xs">Fondasi / model eksternal</span></Link></div></>} />
          <Route path="/studio" element={<Index />} />
          <Route path="/ai-arrangement" element={<Arrangement />} />
          <Route path="/experiments/piano-faithful" element={<PianoFaithful />} />
          {import.meta.env.DEV && <Route path="/dev/audio-diagnostic" element={<AudioDiagnostic />} />}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
