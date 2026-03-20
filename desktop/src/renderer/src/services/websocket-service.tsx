import { LunariaAttachment } from './openclaw-api';

export interface DisplayText {
  text: string;
  name: string;
  avatar: string;
}

export interface Message {
  id: string;
  content: string;
  role: 'ai' | 'human' | 'system';
  timestamp: string;
  name?: string;
  avatar?: string;
  attachments?: LunariaAttachment[];
  type?: 'text' | 'tool_call_status' | 'automation_note';
  tool_id?: string;
  tool_name?: string;
  status?: 'running' | 'completed' | 'error';
  source?: string;
  automationKind?: 'proactive' | 'screenshot' | null;
}
