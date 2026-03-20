import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { CharacterConfigProvider } from "@/context/character-config-context";
import { Live2DConfigProvider } from "@/context/live2d-config-context";
import { ModeProvider } from "@/context/mode-context";
import { AiStateProvider } from "@/context/ai-state-context";
import { ChatHistoryProvider } from "@/context/chat-history-context";
import { ProactiveSpeakProvider } from "@/context/proactive-speak-context";
import { Toaster } from "@/components/ui/toaster";
import { CameraProvider } from "@/context/camera-context";
import { ScreenCaptureProvider } from "@/context/screen-capture-context";
import { SubtitleProvider } from "@/context/subtitle-context";
import { VADProvider } from "@/context/vad-context";
import { BgUrlProvider } from "@/context/bgurl-context";
import { GroupProvider } from "@/context/group-context";
import { BrowserProvider } from "@/context/browser-context";
import LunariaShell from "@/features/lunaria-shell";
import { LunariaRuntimeProvider } from "@/runtime/lunaria-runtime";

function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <CameraProvider>
      <ScreenCaptureProvider>
        <CharacterConfigProvider>
          <ChatHistoryProvider>
            <AiStateProvider>
              <ProactiveSpeakProvider>
                <Live2DConfigProvider>
                  <LunariaRuntimeProvider>
                    <SubtitleProvider>
                      <VADProvider>
                        <BgUrlProvider>
                          <GroupProvider>
                            <BrowserProvider>
                              <Toaster />
                              {children}
                            </BrowserProvider>
                          </GroupProvider>
                        </BgUrlProvider>
                      </VADProvider>
                    </SubtitleProvider>
                  </LunariaRuntimeProvider>
                </Live2DConfigProvider>
              </ProactiveSpeakProvider>
            </AiStateProvider>
          </ChatHistoryProvider>
        </CharacterConfigProvider>
      </ScreenCaptureProvider>
    </CameraProvider>
  );
}

export default function App(): JSX.Element {
  return (
    <ChakraProvider value={defaultSystem}>
      <ModeProvider>
        <AppProviders>
          <LunariaShell />
        </AppProviders>
      </ModeProvider>
    </ChakraProvider>
  );
}
