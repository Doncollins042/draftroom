// Shared DTO types between the API routes and the console UI.

export type ClientDTO = {
  id: string;
  waId: string;
  displayName: string | null;
  notes: string | null;
  tags: string[];
  assistantMode: boolean;
  emotion: string;
  energy: number;
  emojiDensity: number;
  replyLength: string;
  goal: string;
  lastInboundAt: string | null;
};

export type MessageDTO = {
  id: string;
  direction: string;
  body: string;
  status: string | null;
  aiGenerated: boolean;
  source: string;
  sentAt: string;
};

export type DraftDTO = {
  id: string;
  variant: number;
  text: string;
  status: string;
  createdAt: string;
};

export type WindowDTO = { open: boolean; hoursLeft: number };

export type ConversationSummary = {
  id: string;
  status: string;
  lastMessageAt: string | null;
  client: ClientDTO;
  lastMessage: MessageDTO | null;
  pendingDraft: { id: string; text: string } | null;
  window: WindowDTO;
};

export type ConversationDetail = {
  id: string;
  status: string;
  client: ClientDTO;
  window: WindowDTO;
  messages: MessageDTO[];
  drafts: DraftDTO[]; // pending only
  exemplarCount: number; // embedded + searchable
  pendingEmbeds: number; // waiting for the embed worker
};

export type TemplateDTO = {
  id: string;
  name: string;
  language: string;
  body: string;
};
